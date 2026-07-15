use std::{
    fs::File,
    io::{BufRead, BufReader},
    path::{Path, PathBuf},
};

use serde_json::{Value, json};
use walkdir::WalkDir;

use crate::domain::{
    error::AppError,
    event::{EventKind, EventLevel, EventSource},
    history::{ImportedEvent, ImportedSession},
    session::SessionSource,
};

use super::adapter::{
    AgentHistoryAdapter, compact_text, extract_text, file_timestamp, parse_timestamp,
    path_external_id,
};

pub struct ClaudeAdapter;

impl ClaudeAdapter {
    fn tool_metadata(block: &Value, name: &str) -> Value {
        let lower = name.to_ascii_lowercase();
        let skill_name = (lower == "skill")
            .then(|| {
                block
                    .get("input")?
                    .get("skill")
                    .or_else(|| block.get("input")?.get("name"))?
                    .as_str()
                    .map(ToOwned::to_owned)
            })
            .flatten();
        let mcp_server = name
            .strip_prefix("mcp__")
            .and_then(|value| value.split("__").next());
        let (category, operation) = if let Some(skill_name) = &skill_name {
            ("skill", format!("使用 Skill：{skill_name}"))
        } else if let Some(server) = mcp_server {
            ("mcp", format!("调用 MCP：{server}"))
        } else if matches!(
            lower.as_str(),
            "read" | "write" | "edit" | "multiedit" | "notebookedit"
        ) {
            ("file", format!("文件操作：{name}"))
        } else if matches!(lower.as_str(), "bash" | "shell" | "terminal") {
            ("command", "执行终端命令".into())
        } else if lower.contains("todo") || lower.contains("plan") {
            ("plan", "更新执行计划".into())
        } else {
            ("tool", format!("调用工具 {name}"))
        };
        let commands = if category == "command" {
            block
                .get("input")
                .and_then(|input| input.get("command"))
                .and_then(Value::as_str)
                .map(|command| vec![command.to_owned()])
                .unwrap_or_default()
        } else {
            Vec::new()
        };
        json!({
            "toolName": name,
            "toolUseId": block.get("id"),
            "toolCategory": category,
            "operation": operation,
            "skillName": skill_name,
            "mcpServer": mcp_server,
            "command": commands.first(),
            "commands": commands,
        })
    }

    fn content_events(
        content: &Value,
        role: &str,
        timestamp: chrono::DateTime<chrono::Utc>,
    ) -> Vec<ImportedEvent> {
        if let Some(text) = content.as_str() {
            return vec![ImportedEvent {
                timestamp,
                source: if role == "user" {
                    EventSource::User
                } else {
                    EventSource::Agent
                },
                kind: EventKind::Message,
                level: EventLevel::Info,
                summary: compact_text(text, 8_000),
                payload: json!({ "claudeRole": role }),
            }];
        }

        content
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|block| {
                let block_type = block.get("type").and_then(Value::as_str)?;
                match block_type {
                    "text" => Some(ImportedEvent {
                        timestamp,
                        source: if role == "user" {
                            EventSource::User
                        } else {
                            EventSource::Agent
                        },
                        kind: EventKind::Message,
                        level: EventLevel::Info,
                        summary: compact_text(extract_text(block)?, 8_000),
                        payload: json!({ "claudeType": block_type }),
                    }),
                    "tool_use" => {
                        let name = block.get("name").and_then(Value::as_str).unwrap_or("tool");
                        let metadata = Self::tool_metadata(block, name);
                        let summary = metadata
                            .get("operation")
                            .and_then(Value::as_str)
                            .unwrap_or("调用工具")
                            .to_owned();
                        Some(ImportedEvent {
                            timestamp,
                            source: EventSource::Tool,
                            kind: EventKind::ToolCall,
                            level: EventLevel::Info,
                            summary,
                            payload: metadata,
                        })
                    }
                    "tool_result" => Some(ImportedEvent {
                        timestamp,
                        source: EventSource::Tool,
                        kind: EventKind::ToolResult,
                        level: if block.get("is_error").and_then(Value::as_bool) == Some(true) {
                            EventLevel::Error
                        } else {
                            EventLevel::Info
                        },
                        summary: compact_text(
                            block
                                .get("content")
                                .and_then(extract_text)
                                .unwrap_or_else(|| "工具调用已完成".into()),
                            2_000,
                        ),
                        payload: json!({
                            "toolUseId": block.get("tool_use_id"),
                            "failed": block.get("is_error").and_then(Value::as_bool) == Some(true),
                        }),
                    }),
                    _ => None,
                }
            })
            .collect()
    }
}

impl AgentHistoryAdapter for ClaudeAdapter {
    fn source(&self) -> SessionSource {
        SessionSource::Claude
    }

    fn roots(&self, home: &Path) -> Vec<PathBuf> {
        vec![
            home.join(".claude/projects"),
            home.join(".claude/transcripts"),
        ]
    }

    fn matches(&self, path: &Path) -> bool {
        path.extension()
            .is_some_and(|extension| extension == "jsonl")
            && path.components().any(|part| part.as_os_str() == ".claude")
    }

    fn discover(&self, home: &Path) -> Vec<PathBuf> {
        self.roots(home)
            .into_iter()
            .filter(|root| root.exists())
            .flat_map(|root| WalkDir::new(root).into_iter().filter_map(Result::ok))
            .map(walkdir::DirEntry::into_path)
            .filter(|path| path.is_file() && self.matches(path))
            .collect()
    }

    fn parse(&self, path: &Path) -> Result<Option<ImportedSession>, AppError> {
        let fallback = file_timestamp(path);
        let file = File::open(path).map_err(|error| AppError::Internal(error.to_string()))?;
        let mut external_id = path_external_id(path);
        let mut workspace = None;
        let mut events = Vec::new();

        for line in BufReader::new(file).lines() {
            let line = line.map_err(|error| AppError::Internal(error.to_string()))?;
            let Ok(record) = serde_json::from_str::<Value>(&line) else {
                continue;
            };
            let record_type = record.get("type").and_then(Value::as_str);
            if !matches!(record_type, Some("user" | "assistant")) {
                continue;
            }
            if let Some(session_id) = record.get("sessionId").and_then(Value::as_str) {
                session_id.clone_into(&mut external_id);
            }
            workspace = record
                .get("cwd")
                .and_then(Value::as_str)
                .map(ToOwned::to_owned)
                .or(workspace);
            let timestamp = parse_timestamp(record.get("timestamp"), fallback);
            let Some(message) = record.get("message") else {
                continue;
            };
            let role = message
                .get("role")
                .and_then(Value::as_str)
                .unwrap_or(record_type.unwrap_or("assistant"));
            events.extend(Self::content_events(
                message.get("content").unwrap_or(&Value::Null),
                role,
                timestamp,
            ));
        }

        events.sort_by_key(|event| event.timestamp);
        let Some(first_event) = events.first() else {
            return Ok(None);
        };
        let name = events
            .iter()
            .find(|event| event.source == EventSource::User && event.kind == EventKind::Message)
            .map_or_else(
                || format!("Claude {external_id}"),
                |event| compact_text(&event.summary, 80),
            );

        Ok(Some(ImportedSession {
            source: SessionSource::Claude,
            external_id,
            name,
            workspace,
            source_path: path.to_path_buf(),
            started_at: first_event.timestamp,
            updated_at: events.last().map_or(fallback, |event| event.timestamp),
            events,
        }))
    }
}
