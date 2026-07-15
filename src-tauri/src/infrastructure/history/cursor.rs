use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
    time::Duration,
};

use serde_json::{Value, json};
use sqlx::{
    Connection, Row,
    sqlite::{SqliteConnectOptions, SqliteConnection},
};
use walkdir::WalkDir;

use crate::domain::{
    error::AppError,
    event::{EventKind, EventLevel, EventSource},
    history::{ImportedEvent, ImportedSession},
    session::{SessionSource, SessionUsage},
};

use super::adapter::{
    AgentHistoryAdapter, add_generic_token_usage, compact_text, complete_total_tokens,
    extract_text, file_timestamp, generic_tool_events, parse_timestamp, path_external_id,
    update_session_identity,
};

pub struct CursorAdapter;

impl CursorAdapter {
    fn application_support(home: &Path) -> PathBuf {
        #[cfg(target_os = "macos")]
        return home.join("Library/Application Support/Cursor/User");
        #[cfg(target_os = "windows")]
        return home.join("AppData/Roaming/Cursor/User");
        #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
        home.join(".config/Cursor/User")
    }

    fn session_from_value(
        root: &Value,
        path: &Path,
        fallback_id: String,
    ) -> Option<ImportedSession> {
        let fallback = file_timestamp(path);
        let external_id = root
            .get("id")
            .or_else(|| root.get("composerId"))
            .or_else(|| root.get("conversationId"))
            .or_else(|| root.get("chatId"))
            .or_else(|| root.get("sessionId"))
            .and_then(Value::as_str)
            .map_or(fallback_id, ToOwned::to_owned);
        let workspace = root
            .get("workspace")
            .or_else(|| root.get("workspacePath"))
            .or_else(|| root.get("cwd"))
            .and_then(Value::as_str)
            .map(ToOwned::to_owned);
        let messages = root
            .get("messages")
            .or_else(|| root.get("conversation"))
            .or_else(|| root.get("bubbles"))
            .and_then(Value::as_array)?;
        let mut events = Vec::new();
        let mut usage = SessionUsage::default();
        update_session_identity(&mut usage, root);
        for message in messages {
            let role = message
                .get("role")
                .or_else(|| message.get("type"))
                .and_then(Value::as_str)
                .unwrap_or("assistant");
            update_session_identity(&mut usage, message);
            add_generic_token_usage(&mut usage, message);
            let Some(text) = message
                .get("content")
                .or_else(|| message.get("text"))
                .or_else(|| message.get("message"))
                .and_then(extract_text)
            else {
                continue;
            };
            events.push(ImportedEvent {
                timestamp: parse_timestamp(
                    message
                        .get("timestamp")
                        .or_else(|| message.get("createdAt")),
                    fallback,
                ),
                source: if matches!(role, "user" | "human") {
                    EventSource::User
                } else {
                    EventSource::Agent
                },
                kind: EventKind::Message,
                level: EventLevel::Info,
                summary: compact_text(text, 8_000),
                payload: json!({ "cursorRole": role }),
            });
            events.extend(generic_tool_events(
                message,
                parse_timestamp(
                    message
                        .get("timestamp")
                        .or_else(|| message.get("createdAt")),
                    fallback,
                ),
                "cursor",
            ));
        }
        let first_event = events.first()?;
        let name = events
            .iter()
            .find(|event| event.source == EventSource::User)
            .map_or_else(
                || format!("Cursor {external_id}"),
                |event| compact_text(&event.summary, 80),
            );
        complete_total_tokens(&mut usage);
        Some(ImportedSession {
            source: SessionSource::Cursor,
            external_id,
            name,
            workspace,
            usage,
            source_path: path.to_path_buf(),
            started_at: first_event.timestamp,
            updated_at: events.last().map_or(fallback, |event| event.timestamp),
            events,
        })
    }

    fn collect_session_values(value: &Value, sessions: &mut Vec<Value>) {
        match value {
            Value::Object(object) => {
                let has_identity = ["composerId", "conversationId", "chatId", "sessionId"]
                    .into_iter()
                    .any(|key| object.contains_key(key));
                let has_messages = ["messages", "conversation", "bubbles"]
                    .into_iter()
                    .any(|key| object.get(key).is_some_and(Value::is_array));
                if has_identity && has_messages {
                    sessions.push(value.clone());
                }
                for child in object.values() {
                    Self::collect_session_values(child, sessions);
                }
            }
            Value::Array(items) => {
                for child in items {
                    Self::collect_session_values(child, sessions);
                }
            }
            Value::Null | Value::Bool(_) | Value::Number(_) | Value::String(_) => {}
        }
    }

    async fn database_values(path: &Path) -> Result<Vec<Value>, AppError> {
        let options = SqliteConnectOptions::new()
            .filename(path)
            .busy_timeout(Duration::from_secs(2));
        let mut connection = SqliteConnection::connect_with(&options)
            .await
            .map_err(|error| AppError::Internal(format!("cursor database open failed: {error}")))?;
        let tables = sqlx::query("SELECT name FROM sqlite_master WHERE type = 'table'")
            .fetch_all(&mut connection)
            .await
            .map_err(|error| AppError::Internal(format!("cursor table query failed: {error}")))?;
        let table_names = tables
            .iter()
            .filter_map(|row| row.try_get::<String, _>("name").ok())
            .collect::<HashSet<_>>();
        let mut values = Vec::new();
        for table in ["ItemTable", "cursorDiskKV"] {
            if !table_names.contains(table) {
                continue;
            }
            let query = format!(
                "SELECT CAST(value AS TEXT) AS value FROM {table} \
                 WHERE key LIKE '%composer%' OR key LIKE '%chat%' OR key LIKE '%conversation%'"
            );
            let rows = sqlx::query(&query)
                .fetch_all(&mut connection)
                .await
                .map_err(|error| {
                    AppError::Internal(format!("cursor value query failed for {table}: {error}"))
                })?;
            for row in rows {
                if let Ok(text) = row.try_get::<String, _>("value") {
                    if let Ok(value) = serde_json::from_str(&text) {
                        values.push(value);
                    }
                }
            }
        }
        Ok(values)
    }

    fn parse_database(path: &Path) -> Result<Vec<ImportedSession>, AppError> {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .build()
            .map_err(|error| {
                AppError::Internal(format!("cursor parser runtime failed: {error}"))
            })?;
        let values = runtime.block_on(Self::database_values(path))?;
        let mut candidates = Vec::new();
        for value in values {
            Self::collect_session_values(&value, &mut candidates);
        }
        let mut seen = HashSet::new();
        Ok(candidates
            .iter()
            .enumerate()
            .filter_map(|(index, value)| {
                Self::session_from_value(value, path, format!("{}-{index}", path_external_id(path)))
            })
            .filter(|session| seen.insert(session.external_id.clone()))
            .collect())
    }
}

impl AgentHistoryAdapter for CursorAdapter {
    fn source(&self) -> SessionSource {
        SessionSource::Cursor
    }

    fn roots(&self, home: &Path) -> Vec<PathBuf> {
        vec![
            home.join(".cursor/projects"),
            Self::application_support(home),
        ]
    }

    fn matches(&self, path: &Path) -> bool {
        if path.file_name().and_then(|value| value.to_str()) == Some("state.vscdb") {
            return path.to_string_lossy().contains("Cursor");
        }
        let extension = path.extension().and_then(|value| value.to_str());
        let name = path.to_string_lossy().to_ascii_lowercase();
        matches!(extension, Some("json" | "jsonl" | "txt"))
            && (name.contains("agent-transcript")
                || name.contains("composer")
                || name.contains("chat"))
    }

    fn discover(&self, home: &Path) -> Vec<PathBuf> {
        self.roots(home)
            .into_iter()
            .filter(|root| root.exists())
            .flat_map(|root| {
                WalkDir::new(root)
                    .max_depth(7)
                    .into_iter()
                    .filter_map(Result::ok)
            })
            .map(walkdir::DirEntry::into_path)
            .filter(|path| path.is_file() && self.matches(path))
            .collect()
    }

    fn parse(&self, path: &Path) -> Result<Option<ImportedSession>, AppError> {
        if path.file_name().and_then(|value| value.to_str()) == Some("state.vscdb") {
            return Ok(None);
        }
        let fallback = file_timestamp(path);
        let content =
            fs::read_to_string(path).map_err(|error| AppError::Internal(error.to_string()))?;
        if let Ok(root) = serde_json::from_str::<Value>(&content) {
            return Ok(Self::session_from_value(
                &root,
                path,
                path_external_id(path),
            ));
        }

        let mut events = Vec::new();
        for line in content.lines() {
            let normalized = line.trim();
            let (source, text) = if let Some(text) = normalized.strip_prefix("User:") {
                (EventSource::User, text)
            } else if let Some(text) = normalized.strip_prefix("Assistant:") {
                (EventSource::Agent, text)
            } else {
                continue;
            };
            events.push(ImportedEvent {
                timestamp: fallback,
                source,
                kind: EventKind::Message,
                level: EventLevel::Info,
                summary: compact_text(text, 8_000),
                payload: json!({ "cursorFormat": "transcript" }),
            });
        }
        let Some(first_event) = events.first() else {
            return Ok(None);
        };
        let external_id = path_external_id(path);
        let name = events
            .iter()
            .find(|event| event.source == EventSource::User)
            .map_or_else(
                || format!("Cursor {external_id}"),
                |event| compact_text(&event.summary, 80),
            );
        Ok(Some(ImportedSession {
            source: SessionSource::Cursor,
            external_id,
            name,
            workspace: None,
            usage: SessionUsage::default(),
            source_path: path.to_path_buf(),
            started_at: first_event.timestamp,
            updated_at: fallback,
            events,
        }))
    }

    fn parse_many(&self, path: &Path) -> Result<Vec<ImportedSession>, AppError> {
        if path.file_name().and_then(|value| value.to_str()) == Some("state.vscdb") {
            Self::parse_database(path)
        } else {
            Ok(self.parse(path)?.into_iter().collect())
        }
    }
}
