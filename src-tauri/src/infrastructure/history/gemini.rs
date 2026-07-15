use std::{
    fs,
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
    AgentHistoryAdapter, compact_text, extract_text, file_timestamp, generic_tool_events,
    parse_timestamp, path_external_id,
};

pub struct GeminiAdapter;

impl AgentHistoryAdapter for GeminiAdapter {
    fn source(&self) -> SessionSource {
        SessionSource::Gemini
    }

    fn roots(&self, home: &Path) -> Vec<PathBuf> {
        vec![home.join(".gemini/tmp"), home.join(".gemini/chats")]
    }

    fn matches(&self, path: &Path) -> bool {
        matches!(
            path.extension().and_then(|value| value.to_str()),
            Some("json" | "jsonl")
        ) && path.components().any(|part| part.as_os_str() == ".gemini")
            && path.to_string_lossy().contains("chat")
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
        let content =
            fs::read_to_string(path).map_err(|error| AppError::Internal(error.to_string()))?;
        let root: Value = serde_json::from_str(&content).or_else(|_| {
            let messages = content
                .lines()
                .filter_map(|line| serde_json::from_str::<Value>(line).ok())
                .collect::<Vec<_>>();
            Ok::<Value, serde_json::Error>(json!({ "messages": messages }))
        })?;
        let Some(messages) = root
            .get("messages")
            .or_else(|| root.get("history"))
            .and_then(Value::as_array)
        else {
            return Ok(None);
        };
        let mut events = Vec::new();
        for message in messages {
            let role = message
                .get("role")
                .or_else(|| message.get("type"))
                .and_then(Value::as_str)
                .unwrap_or("assistant");
            let timestamp = parse_timestamp(
                message
                    .get("timestamp")
                    .or_else(|| message.get("createdAt")),
                fallback,
            );
            let text = message
                .get("content")
                .or_else(|| message.get("text"))
                .and_then(extract_text);
            if let Some(text) = text.filter(|text| !text.trim().is_empty()) {
                events.push(ImportedEvent {
                    timestamp,
                    source: if matches!(role, "user" | "human") {
                        EventSource::User
                    } else {
                        EventSource::Agent
                    },
                    kind: EventKind::Message,
                    level: EventLevel::Info,
                    summary: compact_text(text, 8_000),
                    payload: json!({ "geminiRole": role }),
                });
            }
            events.extend(generic_tool_events(message, timestamp, "gemini"));
        }
        let Some(first_event) = events.first() else {
            return Ok(None);
        };
        let external_id = root
            .get("sessionId")
            .or_else(|| root.get("id"))
            .and_then(Value::as_str)
            .map_or_else(|| path_external_id(path), ToOwned::to_owned);
        let workspace = root
            .get("projectPath")
            .or_else(|| root.get("cwd"))
            .and_then(Value::as_str)
            .map(ToOwned::to_owned);
        let name = events
            .iter()
            .find(|event| event.source == EventSource::User)
            .map_or_else(
                || format!("Gemini {external_id}"),
                |event| compact_text(&event.summary, 80),
            );

        Ok(Some(ImportedSession {
            source: SessionSource::Gemini,
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
