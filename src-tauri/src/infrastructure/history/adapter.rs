use std::{
    fs,
    path::{Path, PathBuf},
};

use chrono::{DateTime, TimeZone, Utc};
use serde_json::Value;

use crate::domain::{
    error::AppError,
    event::{EventKind, EventLevel, EventSource},
    history::{ImportedEvent, ImportedSession},
    session::SessionSource,
};

pub trait AgentHistoryAdapter: Send + Sync {
    fn source(&self) -> SessionSource;
    fn roots(&self, home: &Path) -> Vec<PathBuf>;
    fn matches(&self, path: &Path) -> bool;
    fn discover(&self, home: &Path) -> Vec<PathBuf>;
    fn parse(&self, path: &Path) -> Result<Option<ImportedSession>, AppError>;
    fn parse_many(&self, path: &Path) -> Result<Vec<ImportedSession>, AppError> {
        Ok(self.parse(path)?.into_iter().collect())
    }
}

pub fn file_timestamp(path: &Path) -> DateTime<Utc> {
    fs::metadata(path)
        .and_then(|metadata| metadata.modified())
        .ok()
        .map_or_else(Utc::now, DateTime::<Utc>::from)
}

pub fn parse_timestamp(value: Option<&Value>, fallback: DateTime<Utc>) -> DateTime<Utc> {
    match value {
        Some(Value::String(value)) => DateTime::parse_from_rfc3339(value)
            .map_or(fallback, |timestamp| timestamp.with_timezone(&Utc)),
        Some(Value::Number(value)) => value
            .as_i64()
            .and_then(|timestamp| {
                if timestamp > 10_000_000_000 {
                    Utc.timestamp_millis_opt(timestamp).single()
                } else {
                    Utc.timestamp_opt(timestamp, 0).single()
                }
            })
            .unwrap_or(fallback),
        _ => fallback,
    }
}

pub fn extract_text(value: &Value) -> Option<String> {
    match value {
        Value::String(text) => Some(text.clone()),
        Value::Array(items) => {
            let text = items
                .iter()
                .filter_map(extract_text)
                .collect::<Vec<_>>()
                .join("\n");
            (!text.trim().is_empty()).then_some(text)
        }
        Value::Object(object) => ["text", "content", "message", "output", "result"]
            .into_iter()
            .find_map(|key| object.get(key).and_then(extract_text)),
        Value::Null | Value::Bool(_) | Value::Number(_) => None,
    }
}

pub fn compact_text(value: impl AsRef<str>, limit: usize) -> String {
    let normalized = value
        .as_ref()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    if normalized.chars().count() <= limit {
        return normalized;
    }
    let mut text = normalized
        .chars()
        .take(limit.saturating_sub(1))
        .collect::<String>();
    text.push('…');
    text
}

pub fn generic_tool_events(
    message: &Value,
    timestamp: DateTime<Utc>,
    provider: &str,
) -> Vec<ImportedEvent> {
    let calls = ["toolCalls", "tool_calls", "functionCalls", "function_calls"]
        .into_iter()
        .find_map(|key| message.get(key).and_then(Value::as_array));
    calls
        .into_iter()
        .flatten()
        .filter_map(|call| {
            let function = call.get("function").unwrap_or(call);
            let name = function
                .get("name")
                .or_else(|| call.get("name"))
                .and_then(Value::as_str)?;
            let input = function
                .get("arguments")
                .or_else(|| call.get("args"))
                .or_else(|| call.get("arguments"))
                .or_else(|| call.get("input"));
            let command = input
                .and_then(|value| {
                    value
                        .get("command")
                        .or_else(|| value.get("cmd"))
                        .and_then(Value::as_str)
                        .map(ToOwned::to_owned)
                        .or_else(|| {
                            value.as_str().and_then(|text| {
                                let parsed = serde_json::from_str::<Value>(text).ok()?;
                                parsed
                                    .get("command")
                                    .or_else(|| parsed.get("cmd"))
                                    .and_then(Value::as_str)
                                    .map(ToOwned::to_owned)
                            })
                        })
                });
            let lower = name.to_ascii_lowercase();
            let category = if command.is_some()
                || lower.contains("shell")
                || matches!(lower.as_str(), "bash" | "terminal" | "exec" | "run_command")
            {
                "command"
            } else if ["read", "write", "edit", "delete", "remove"]
                .iter()
                .any(|action| lower.contains(action))
            {
                "file"
            } else {
                "tool"
            };
            Some(ImportedEvent {
                timestamp,
                source: EventSource::Tool,
                kind: EventKind::ToolCall,
                level: EventLevel::Info,
                summary: command
                    .as_ref()
                    .map_or_else(|| format!("调用工具 {name}"), |_| "执行终端命令".into()),
                payload: serde_json::json!({
                    "toolName": name,
                    "toolCategory": category,
                    "operation": if category == "command" { "执行终端命令" } else { "调用 Agent 工具" },
                    "command": command.clone(),
                    "commands": command.into_iter().collect::<Vec<_>>(),
                    "provider": provider,
                }),
            })
        })
        .collect()
}

pub fn path_external_id(path: &Path) -> String {
    path.file_stem()
        .and_then(|name| name.to_str())
        .map_or_else(|| path.display().to_string(), ToOwned::to_owned)
}
