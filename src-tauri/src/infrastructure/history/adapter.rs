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
    session::{SessionSource, SessionUsage},
};

pub trait AgentHistoryAdapter: Send + Sync {
    fn source(&self) -> SessionSource;
    fn roots(&self, home: &Path) -> Vec<PathBuf>;
    /// 文件监听根目录；默认同 roots，可收窄以降低噪音
    fn watch_roots(&self, home: &Path) -> Vec<PathBuf> {
        self.roots(home)
    }
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

pub fn json_u64(value: Option<&Value>) -> Option<u64> {
    value.and_then(|value| {
        value
            .as_u64()
            .or_else(|| value.as_i64().and_then(|number| u64::try_from(number).ok()))
    })
}

pub fn add_optional_u64(total: &mut Option<u64>, value: Option<u64>) {
    if let Some(value) = value {
        *total = Some(total.unwrap_or_default().saturating_add(value));
    }
}

pub fn complete_total_tokens(usage: &mut SessionUsage) {
    if usage.total_tokens.is_some() {
        return;
    }
    usage.total_tokens = [
        usage.input_tokens,
        usage.cached_input_tokens,
        usage.output_tokens,
        usage.reasoning_output_tokens,
    ]
    .into_iter()
    .flatten()
    .reduce(u64::saturating_add);
}

pub fn nonempty_string(value: Option<&Value>) -> Option<String> {
    value
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

pub fn update_session_identity(usage: &mut SessionUsage, value: &Value) {
    usage.model = nonempty_string(
        value
            .get("model")
            .or_else(|| value.get("modelId"))
            .or_else(|| value.get("modelName")),
    )
    .or_else(|| usage.model.take());
    usage.reasoning_effort = nonempty_string(
        value
            .get("reasoningEffort")
            .or_else(|| value.get("reasoning_effort"))
            .or_else(|| value.get("thinkingLevel")),
    )
    .or_else(|| usage.reasoning_effort.take());
    if usage.base_url.is_none() {
        usage.base_url = extract_base_url(value);
    }
}

/// Normalize an API base URL for aggregation (trim trailing slash).
pub fn normalize_base_url(value: &str) -> Option<String> {
    let trimmed = value.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_owned())
    }
}

pub fn extract_base_url(value: &Value) -> Option<String> {
    nonempty_string(
        value
            .get("base_url")
            .or_else(|| value.get("baseUrl"))
            .or_else(|| value.get("api_base"))
            .or_else(|| value.get("apiBase"))
            .or_else(|| value.get("endpoint")),
    )
    .and_then(|value| normalize_base_url(&value))
}

/// Resolve Codex provider id → `base_url` via `~/.codex/config.toml`.
pub fn resolve_codex_base_url(home: &Path, provider_id: Option<&str>) -> Option<String> {
    let config_path = home.join(".codex/config.toml");
    let content = fs::read_to_string(config_path).ok()?;
    let table = content.parse::<toml::Table>().ok()?;
    let provider_id = provider_id
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .or_else(|| {
            table
                .get("model_provider")
                .and_then(toml::Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(ToOwned::to_owned)
        })?;
    let providers = table.get("model_providers")?.as_table()?;
    let provider = providers.get(provider_id.as_str())?.as_table()?;
    provider
        .get("base_url")
        .and_then(toml::Value::as_str)
        .and_then(normalize_base_url)
}

/// Resolve Claude `ANTHROPIC_BASE_URL` from settings.json / project settings.
pub fn resolve_claude_base_url(home: &Path, workspace: Option<&str>) -> Option<String> {
    let mut candidates = Vec::new();
    if let Some(workspace) = workspace {
        candidates.push(PathBuf::from(workspace).join(".claude/settings.local.json"));
        candidates.push(PathBuf::from(workspace).join(".claude/settings.json"));
    }
    candidates.push(home.join(".claude/settings.local.json"));
    candidates.push(home.join(".claude/settings.json"));

    for path in candidates {
        if let Some(base_url) = read_anthropic_base_url(&path) {
            return Some(base_url);
        }
    }
    None
}

fn read_anthropic_base_url(path: &Path) -> Option<String> {
    let content = fs::read_to_string(path).ok()?;
    let value: Value = serde_json::from_str(&content).ok()?;
    let env = value.get("env")?;
    nonempty_string(
        env.get("ANTHROPIC_BASE_URL")
            .or_else(|| env.get("ANTHROPIC_API_BASE"))
            .or_else(|| env.get("CLAUDE_BASE_URL")),
    )
    .and_then(|value| normalize_base_url(&value))
}

pub fn add_generic_token_usage(usage: &mut SessionUsage, value: &Value) {
    let Some(value) = value
        .get("usageMetadata")
        .or_else(|| value.get("tokenUsage"))
        .or_else(|| value.get("usage"))
    else {
        return;
    };
    add_optional_u64(
        &mut usage.input_tokens,
        json_u64(
            value
                .get("promptTokenCount")
                .or_else(|| value.get("inputTokens"))
                .or_else(|| value.get("promptTokens")),
        ),
    );
    add_optional_u64(
        &mut usage.cached_input_tokens,
        json_u64(
            value
                .get("cachedContentTokenCount")
                .or_else(|| value.get("cachedInputTokens")),
        ),
    );
    add_optional_u64(
        &mut usage.output_tokens,
        json_u64(
            value
                .get("candidatesTokenCount")
                .or_else(|| value.get("outputTokens"))
                .or_else(|| value.get("completionTokens")),
        ),
    );
    add_optional_u64(
        &mut usage.reasoning_output_tokens,
        json_u64(
            value
                .get("thoughtsTokenCount")
                .or_else(|| value.get("reasoningTokens")),
        ),
    );
    add_optional_u64(
        &mut usage.total_tokens,
        json_u64(
            value
                .get("totalTokenCount")
                .or_else(|| value.get("totalTokens")),
        ),
    );
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
