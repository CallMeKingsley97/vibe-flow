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
    session::{SessionSource, SessionUsage},
};

use super::adapter::{
    AgentHistoryAdapter, compact_text, extract_text, file_timestamp, json_u64, nonempty_string,
    parse_timestamp, path_external_id, resolve_codex_base_url,
};

pub struct CodexAdapter;

impl CodexAdapter {
    fn update_usage(record_type: &str, payload: &Value, usage: &mut SessionUsage) -> bool {
        if record_type == "turn_context" {
            usage.model = nonempty_string(payload.get("model")).or_else(|| usage.model.take());
            usage.reasoning_effort = nonempty_string(payload.get("effort"))
                .or_else(|| {
                    payload
                        .get("collaboration_mode")
                        .and_then(|value| value.get("settings"))
                        .and_then(|value| nonempty_string(value.get("reasoning_effort")))
                })
                .or_else(|| usage.reasoning_effort.take());
            return true;
        }
        if payload.get("type").and_then(Value::as_str) != Some("token_count") {
            return false;
        }
        if let Some(total) = payload
            .get("info")
            .and_then(|value| value.get("total_token_usage"))
        {
            usage.input_tokens = json_u64(total.get("input_tokens"));
            usage.cached_input_tokens = json_u64(total.get("cached_input_tokens"));
            usage.output_tokens = json_u64(total.get("output_tokens"));
            usage.reasoning_output_tokens = json_u64(total.get("reasoning_output_tokens"));
            usage.total_tokens = json_u64(total.get("total_tokens"));
        }
        true
    }

    fn tool_metadata(payload: &Value, item_type: &str, name: &str) -> Value {
        let input = payload
            .get("input")
            .or_else(|| payload.get("arguments"))
            .and_then(Value::as_str)
            .unwrap_or_default();
        let call_id = payload
            .get("call_id")
            .or_else(|| payload.get("id"))
            .and_then(Value::as_str);
        let (category, operation, skill_name, mcp_server) = Self::classify_tool(name, input);
        let commands = if category == "command" {
            Self::extract_commands(input)
        } else {
            Vec::new()
        };
        json!({
            "toolName": name,
            "codexType": item_type,
            "callId": call_id,
            "toolCategory": category,
            "operation": operation,
            "skillName": skill_name,
            "mcpServer": mcp_server,
            "command": commands.first(),
            "commands": commands,
        })
    }

    fn extract_commands(input: &str) -> Vec<String> {
        let mut commands = Vec::new();
        let mut remaining = input;
        while let Some(index) = remaining
            .find("cmd:")
            .or_else(|| remaining.find("\"cmd\":"))
        {
            remaining = &remaining[index..];
            let Some(colon) = remaining.find(':') else {
                break;
            };
            let value = remaining[colon + 1..].trim_start();
            if !value.starts_with('"') {
                remaining = &remaining[colon + 1..];
                continue;
            }
            let mut escaped = false;
            let mut end = None;
            for (offset, character) in value[1..].char_indices() {
                if escaped {
                    escaped = false;
                } else if character == '\\' {
                    escaped = true;
                } else if character == '"' {
                    end = Some(offset + 2);
                    break;
                }
            }
            let Some(end) = end else {
                break;
            };
            if let Ok(command) = serde_json::from_str::<String>(&value[..end])
                && !command.trim().is_empty()
            {
                commands.push(command);
            }
            remaining = &value[end..];
        }
        commands
    }

    fn classify_tool(
        name: &str,
        input: &str,
    ) -> (&'static str, String, Option<String>, Option<String>) {
        let lower = input.to_ascii_lowercase();
        if lower.contains("tools.apply_patch") || name == "apply_patch" {
            return ("file", "修改项目文件".into(), None, None);
        }
        let can_read_skill = lower.contains("tools.exec_command")
            || matches!(
                name.to_ascii_lowercase().as_str(),
                "exec" | "read" | "shell"
            );
        if can_read_skill && let Some(skill_name) = Self::extract_skill_name(input) {
            return (
                "skill",
                format!("读取 Skill：{skill_name}"),
                Some(skill_name),
                None,
            );
        }
        if let Some((server, tool)) = Self::extract_mcp(name, input) {
            return (
                "mcp",
                format!("调用 MCP：{server}/{tool}"),
                None,
                Some(server),
            );
        }
        if lower.contains("tools.update_plan") || name == "update_plan" {
            return ("plan", "更新执行计划".into(), None, None);
        }
        if lower.contains("tools.request_user_input") || name == "request_user_input" {
            return ("interaction", "请求用户输入".into(), None, None);
        }
        if lower.contains("tools.view_image") || name == "view_image" {
            return ("media", "查看图片".into(), None, None);
        }
        if lower.contains("tools.exec_command") || name == "exec" {
            return ("command", "执行终端命令".into(), None, None);
        }
        if name == "wait" || name == "write_stdin" {
            return ("wait", "等待后台任务".into(), None, None);
        }
        ("tool", format!("调用工具 {name}"), None, None)
    }

    fn extract_skill_name(input: &str) -> Option<String> {
        if !input.contains("/skills/") && !input.contains("\\skills\\") {
            return None;
        }
        let marker = "/SKILL.md";
        let index = input.find(marker)?;
        let prefix = &input[..index];
        prefix
            .rsplit(['/', '\\'])
            .find(|part| !part.is_empty())
            .filter(|part| {
                part.chars().all(|character| {
                    character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.')
                })
            })
            .map(ToOwned::to_owned)
    }

    fn extract_mcp(name: &str, input: &str) -> Option<(String, String)> {
        let candidate = if name.starts_with("mcp__") {
            name
        } else {
            let index = input.find("tools.mcp__")? + "tools.".len();
            input[index..]
                .split(|character: char| !(character.is_ascii_alphanumeric() || character == '_'))
                .next()?
        };
        let mut parts = candidate.trim_start_matches("mcp__").splitn(2, "__");
        let server = parts.next()?.to_owned();
        let tool = parts.next()?.to_owned();
        if server.is_empty() || tool.is_empty() {
            return None;
        }
        Some((server, tool))
    }

    fn event_from_message(
        payload: &Value,
        timestamp: chrono::DateTime<chrono::Utc>,
    ) -> Option<ImportedEvent> {
        let message_type = payload.get("type")?.as_str()?;
        let (source, text) = match message_type {
            "user_message" => (EventSource::User, extract_text(payload.get("message")?)?),
            "agent_message" => (EventSource::Agent, extract_text(payload.get("message")?)?),
            _ => return None,
        };
        Some(ImportedEvent {
            timestamp,
            source,
            kind: EventKind::Message,
            level: EventLevel::Info,
            summary: compact_text(text, 8_000),
            payload: json!({ "codexType": message_type }),
        })
    }

    fn response_event(
        payload: &Value,
        timestamp: chrono::DateTime<chrono::Utc>,
    ) -> Option<ImportedEvent> {
        let item_type = payload.get("type")?.as_str()?;
        match item_type {
            "function_call" | "custom_tool_call" | "tool_search_call" | "web_search_call" => {
                let name = payload
                    .get("name")
                    .or_else(|| payload.get("tool_name"))
                    .and_then(Value::as_str)
                    .unwrap_or(item_type);
                let metadata = Self::tool_metadata(payload, item_type, name);
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
            "function_call_output" | "custom_tool_call_output" | "tool_search_output" => {
                let output = extract_text(payload.get("output").unwrap_or(&Value::Null))
                    .unwrap_or_else(|| "工具调用已完成".into());
                let lower = output.to_ascii_lowercase();
                let failed = lower.contains("failed") || lower.contains("error");
                Some(ImportedEvent {
                    timestamp,
                    source: EventSource::Tool,
                    kind: EventKind::ToolResult,
                    level: EventLevel::Info,
                    summary: compact_text(&output, 2_000),
                    payload: json!({
                        "codexType": item_type,
                        "callId": payload.get("call_id").and_then(Value::as_str),
                        "failed": failed,
                    }),
                })
            }
            _ => None,
        }
    }
}

impl AgentHistoryAdapter for CodexAdapter {
    fn source(&self) -> SessionSource {
        SessionSource::Codex
    }

    fn roots(&self, home: &Path) -> Vec<PathBuf> {
        vec![
            home.join(".codex/sessions"),
            home.join(".codex/archived_sessions"),
        ]
    }

    fn matches(&self, path: &Path) -> bool {
        path.extension()
            .is_some_and(|extension| extension == "jsonl")
            && path.components().any(|part| part.as_os_str() == ".codex")
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

    #[allow(clippy::too_many_lines)]
    fn parse(&self, path: &Path) -> Result<Option<ImportedSession>, AppError> {
        let fallback = file_timestamp(path);
        let file = File::open(path).map_err(|error| AppError::Internal(error.to_string()))?;
        let mut external_id = path_external_id(path);
        let mut workspace = None;
        let mut started_at = fallback;
        let mut events = Vec::new();
        let mut fallback_messages = Vec::new();
        let mut usage = SessionUsage::default();
        let mut model_provider: Option<String> = None;

        for line in BufReader::new(file).lines() {
            let line = line.map_err(|error| AppError::Internal(error.to_string()))?;
            let Ok(record) = serde_json::from_str::<Value>(&line) else {
                continue;
            };
            let timestamp = parse_timestamp(record.get("timestamp"), fallback);
            match record.get("type").and_then(Value::as_str) {
                Some("session_meta") => {
                    if let Some(payload) = record.get("payload") {
                        if let Some(session_id) = payload
                            .get("id")
                            .or_else(|| payload.get("session_id"))
                            .and_then(Value::as_str)
                        {
                            session_id.clone_into(&mut external_id);
                        }
                        workspace = payload
                            .get("cwd")
                            .and_then(Value::as_str)
                            .map(ToOwned::to_owned);
                        started_at = parse_timestamp(payload.get("timestamp"), timestamp);
                        if model_provider.is_none() {
                            model_provider = nonempty_string(payload.get("model_provider"));
                        }
                    }
                }
                Some("event_msg") => {
                    if let Some(payload) = record.get("payload") {
                        if payload.get("type").and_then(Value::as_str)
                            == Some("thread_settings_applied")
                            && model_provider.is_none()
                        {
                            model_provider = payload.get("thread_settings").and_then(|settings| {
                                nonempty_string(settings.get("model_provider_id"))
                            });
                        }
                        if !Self::update_usage("event_msg", payload, &mut usage)
                            && let Some(event) = Self::event_from_message(payload, timestamp)
                        {
                            events.push(event);
                        }
                    }
                }
                Some("turn_context") => {
                    if let Some(payload) = record.get("payload") {
                        Self::update_usage("turn_context", payload, &mut usage);
                    }
                }
                Some("response_item") => {
                    if let Some(payload) = record.get("payload") {
                        if let Some(event) = Self::response_event(payload, timestamp) {
                            events.push(event);
                        } else if payload.get("type").and_then(Value::as_str) == Some("message") {
                            let role = payload.get("role").and_then(Value::as_str);
                            if matches!(role, Some("user" | "assistant")) {
                                if let Some(text) = payload.get("content").and_then(extract_text) {
                                    fallback_messages.push(ImportedEvent {
                                        timestamp,
                                        source: if role == Some("user") {
                                            EventSource::User
                                        } else {
                                            EventSource::Agent
                                        },
                                        kind: EventKind::Message,
                                        level: EventLevel::Info,
                                        summary: compact_text(text, 8_000),
                                        payload: json!({ "codexType": "message" }),
                                    });
                                }
                            }
                        }
                    }
                }
                _ => {}
            }
        }

        if !events.iter().any(|event| event.kind == EventKind::Message) {
            events.extend(fallback_messages);
        }
        events.sort_by_key(|event| event.timestamp);
        let name = events
            .iter()
            .find(|event| event.source == EventSource::User && event.kind == EventKind::Message)
            .map_or_else(
                || format!("Codex {external_id}"),
                |event| compact_text(&event.summary, 80),
            );
        let updated_at = events.last().map_or(fallback, |event| event.timestamp);
        if usage.base_url.is_none() {
            // 仅从会话路径上的 `~/.codex` 解析，避免临时 fixture 误读本机配置。
            if let Some(home) = path
                .ancestors()
                .find(|ancestor| ancestor.ends_with(".codex"))
                .and_then(Path::parent)
            {
                usage.base_url = resolve_codex_base_url(home, model_provider.as_deref());
            }
        }

        Ok(Some(ImportedSession {
            source: SessionSource::Codex,
            external_id,
            name,
            workspace,
            usage,
            source_path: path.to_path_buf(),
            started_at,
            updated_at,
            events,
        }))
    }
}
