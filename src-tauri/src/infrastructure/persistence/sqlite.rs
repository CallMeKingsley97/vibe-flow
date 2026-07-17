use std::{
    fs,
    path::{Path, PathBuf},
    str::FromStr,
};

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use sqlx::{
    FromRow, SqlitePool,
    sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions},
};
use uuid::Uuid;

use crate::{
    application::ports::{CaptureRepository, GovernanceRepository, HistoryRepository, ImportOutcome},
    domain::{
        error::AppError,
        event::{AgentEvent, EventKind, EventLevel, EventSource},
        governance::{AgentDataSettings, CleanupPreview, CleanupResult, StorageStats},
        history::ImportedSession,
        session::{CaptureSession, SessionSource, SessionStatus, SessionUsage},
    },
};

pub struct SqliteRepository {
    pool: SqlitePool,
}

#[derive(FromRow)]
struct SessionRow {
    id: String,
    name: String,
    status: String,
    started_at: String,
    ended_at: Option<String>,
    last_sequence: i64,
    source: String,
    external_id: Option<String>,
    source_path: Option<String>,
    workspace: Option<String>,
    model: Option<String>,
    reasoning_effort: Option<String>,
    input_tokens: Option<i64>,
    cached_input_tokens: Option<i64>,
    output_tokens: Option<i64>,
    reasoning_output_tokens: Option<i64>,
    total_tokens: Option<i64>,
    updated_at: String,
}

#[derive(FromRow)]
struct EventRow {
    id: String,
    session_id: String,
    sequence: i64,
    timestamp: String,
    source: String,
    kind: String,
    level: String,
    summary: String,
    payload: String,
}

#[derive(FromRow)]
struct SettingsRow {
    retention_days: i64,
    auto_cleanup: bool,
    updated_at: String,
}

impl SqliteRepository {
    pub async fn connect(path: &Path) -> Result<Self, AppError> {
        let options = SqliteConnectOptions::new()
            .filename(path)
            .create_if_missing(true)
            .foreign_keys(true)
            .journal_mode(SqliteJournalMode::Wal);
        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .connect_with(options)
            .await?;
        sqlx::migrate!("./migrations").run(&pool).await?;
        let integrity: String = sqlx::query_scalar("PRAGMA quick_check")
            .fetch_one(&pool)
            .await?;
        if integrity != "ok" {
            return Err(AppError::Storage(format!(
                "database integrity check failed: {integrity}"
            )));
        }
        Ok(Self { pool })
    }

    pub async fn connect_with_recovery(path: &Path) -> Result<(Self, Option<PathBuf>), AppError> {
        match Self::connect(path).await {
            Ok(repository) => Ok((repository, None)),
            Err(error) if path.exists() && is_database_corruption(&error) => {
                let backup = backup_corrupt_database(path)?;
                let repository = Self::connect(path).await?;
                Ok((repository, Some(backup)))
            }
            Err(error) => Err(error),
        }
    }

    #[cfg(test)]
    pub(crate) async fn in_memory() -> Result<Self, AppError> {
        let options = SqliteConnectOptions::new()
            .filename(":memory:")
            .foreign_keys(true);
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(options)
            .await?;
        sqlx::migrate!("./migrations").run(&pool).await?;
        Ok(Self { pool })
    }
}

fn is_database_corruption(error: &AppError) -> bool {
    let message = error.to_string().to_ascii_lowercase();
    [
        "database disk image is malformed",
        "file is not a database",
        "database integrity check failed",
        "database corruption",
    ]
    .iter()
    .any(|needle| message.contains(needle))
}

fn backup_corrupt_database(path: &Path) -> Result<PathBuf, AppError> {
    let timestamp = Utc::now().format("%Y%m%d-%H%M%S");
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("vibe-flow.sqlite3");
    let backup = path.with_file_name(format!("{file_name}.corrupt-{timestamp}"));
    fs::rename(path, &backup)
        .map_err(|error| AppError::Storage(format!("cannot back up corrupt database: {error}")))?;
    for suffix in ["-wal", "-shm"] {
        let sidecar = PathBuf::from(format!("{}{suffix}", path.display()));
        if sidecar.exists() {
            let backup_sidecar = PathBuf::from(format!("{}{suffix}", backup.display()));
            fs::rename(&sidecar, backup_sidecar).map_err(|error| {
                AppError::Storage(format!("cannot back up database sidecar: {error}"))
            })?;
        }
    }
    Ok(backup)
}

fn parse_time(value: &str) -> Result<DateTime<Utc>, AppError> {
    DateTime::parse_from_rfc3339(value)
        .map(|time| time.with_timezone(&Utc))
        .map_err(|error| AppError::Storage(error.to_string()))
}

fn optional_time(value: Option<String>) -> Result<Option<DateTime<Utc>>, AppError> {
    value.map(|value| parse_time(&value)).transpose()
}

fn nonnegative_u64(value: i64) -> Result<u64, AppError> {
    u64::try_from(value).map_err(|error| AppError::Storage(error.to_string()))
}

fn optional_nonnegative_u64(value: Option<i64>) -> Result<Option<u64>, AppError> {
    value.map(nonnegative_u64).transpose()
}

impl TryFrom<SessionRow> for CaptureSession {
    type Error = AppError;

    fn try_from(row: SessionRow) -> Result<Self, Self::Error> {
        Ok(Self {
            id: Uuid::parse_str(&row.id).map_err(|error| AppError::Storage(error.to_string()))?,
            name: row.name,
            status: SessionStatus::from_str(&row.status)?,
            started_at: parse_time(&row.started_at)?,
            ended_at: optional_time(row.ended_at)?,
            last_sequence: nonnegative_u64(row.last_sequence)?,
            source: SessionSource::from_str(&row.source)?,
            external_id: row.external_id,
            source_path: row.source_path,
            workspace: row.workspace,
            usage: SessionUsage {
                model: row.model,
                reasoning_effort: row.reasoning_effort,
                input_tokens: optional_nonnegative_u64(row.input_tokens)?,
                cached_input_tokens: optional_nonnegative_u64(row.cached_input_tokens)?,
                output_tokens: optional_nonnegative_u64(row.output_tokens)?,
                reasoning_output_tokens: optional_nonnegative_u64(row.reasoning_output_tokens)?,
                total_tokens: optional_nonnegative_u64(row.total_tokens)?,
            },
            updated_at: parse_time(&row.updated_at)?,
        })
    }
}

impl TryFrom<EventRow> for AgentEvent {
    type Error = AppError;

    fn try_from(row: EventRow) -> Result<Self, Self::Error> {
        Ok(Self {
            id: Uuid::parse_str(&row.id).map_err(|error| AppError::Storage(error.to_string()))?,
            session_id: Uuid::parse_str(&row.session_id)
                .map_err(|error| AppError::Storage(error.to_string()))?,
            sequence: nonnegative_u64(row.sequence)?,
            timestamp: parse_time(&row.timestamp)?,
            source: EventSource::from_str(&row.source)?,
            kind: EventKind::from_str(&row.kind)?,
            level: EventLevel::from_str(&row.level)?,
            summary: row.summary,
            payload: serde_json::from_str(&row.payload)?,
        })
    }
}

#[async_trait]
impl CaptureRepository for SqliteRepository {
    async fn list_sessions(
        &self,
        limit: u32,
        offset: u32,
        source: Option<SessionSource>,
    ) -> Result<Vec<CaptureSession>, AppError> {
        let rows = if let Some(source) = source {
            sqlx::query_as::<_, SessionRow>(
                "SELECT id, name, status, started_at, ended_at, last_sequence,
                        source, external_id, source_path, workspace, model, reasoning_effort,
                        input_tokens, cached_input_tokens, output_tokens,
                        reasoning_output_tokens, total_tokens, updated_at
                 FROM capture_sessions
                 WHERE source = ?
                 ORDER BY updated_at DESC LIMIT ? OFFSET ?",
            )
            .bind(source.to_string())
            .bind(i64::from(limit))
            .bind(i64::from(offset))
            .fetch_all(&self.pool)
            .await?
        } else {
            sqlx::query_as::<_, SessionRow>(
                "SELECT id, name, status, started_at, ended_at, last_sequence,
                        source, external_id, source_path, workspace, model, reasoning_effort,
                        input_tokens, cached_input_tokens, output_tokens,
                        reasoning_output_tokens, total_tokens, updated_at
                 FROM capture_sessions ORDER BY updated_at DESC LIMIT ? OFFSET ?",
            )
            .bind(i64::from(limit))
            .bind(i64::from(offset))
            .fetch_all(&self.pool)
            .await?
        };
        rows.into_iter().map(TryInto::try_into).collect()
    }

    async fn list_events(
        &self,
        session_id: Uuid,
        after_sequence: u64,
        limit: u32,
    ) -> Result<Vec<AgentEvent>, AppError> {
        let rows = sqlx::query_as::<_, EventRow>(
            "SELECT id, session_id, sequence, timestamp, source, kind, level, summary, payload
             FROM agent_events WHERE session_id = ? AND sequence > ?
             ORDER BY sequence ASC LIMIT ?",
        )
        .bind(session_id.to_string())
        .bind(i64::try_from(after_sequence).map_err(|e| AppError::Storage(e.to_string()))?)
        .bind(i64::from(limit))
        .fetch_all(&self.pool)
        .await?;
        rows.into_iter().map(TryInto::try_into).collect()
    }

    async fn ping(&self) -> Result<(), AppError> {
        let _: i64 = sqlx::query_scalar("SELECT 1").fetch_one(&self.pool).await?;
        Ok(())
    }
}

#[async_trait]
impl HistoryRepository for SqliteRepository {
    async fn import_session(&self, session: ImportedSession) -> Result<ImportOutcome, AppError> {
        let identity = format!("{}:{}", session.source, session.external_id);
        let id = Uuid::new_v5(&Uuid::NAMESPACE_URL, identity.as_bytes());
        let event_count = i64::try_from(session.events.len())
            .map_err(|error| AppError::Storage(error.to_string()))?;
        // 以 sequence/name/model/tokens + 首尾事件摘要判断是否变更；
        // 不依赖 updated_at（Cursor DB 的 fallback 时间戳会随文件 mtime 抖动）
        let existing = sqlx::query_as::<_, (i64, String, Option<String>, Option<i64>)>(
            "SELECT last_sequence, name, model, total_tokens FROM capture_sessions WHERE id = ?",
        )
        .bind(id.to_string())
        .fetch_optional(&self.pool)
        .await?;
        if let Some((last_sequence, existing_name, model, total_tokens)) = existing {
            let same_tokens = total_tokens
                == session
                    .usage
                    .total_tokens
                    .and_then(|value| i64::try_from(value).ok());
            let same_model = model.as_deref() == session.usage.model.as_deref();
            let same_meta = last_sequence == event_count
                && existing_name == session.name
                && same_tokens
                && same_model;
            if same_meta {
                let existing_edges = sqlx::query_as::<_, (i64, String)>(
                    "SELECT sequence, summary FROM agent_events
                     WHERE session_id = ?
                     AND sequence IN (1, ?)
                     ORDER BY sequence",
                )
                .bind(id.to_string())
                .bind(event_count)
                .fetch_all(&self.pool)
                .await?;
                let incoming_edges: Vec<(i64, String)> = [
                    session.events.first().map(|event| (1_i64, event.summary.clone())),
                    session
                        .events
                        .last()
                        .map(|event| (event_count, event.summary.clone())),
                ]
                .into_iter()
                .flatten()
                .collect::<std::collections::BTreeMap<_, _>>()
                .into_iter()
                .collect();
                if existing_edges == incoming_edges {
                    return Ok(ImportOutcome {
                        session_id: id,
                        changed: false,
                    });
                }
            }
        }
        let mut transaction = self.pool.begin().await?;
        sqlx::query(
            "INSERT INTO capture_sessions
             (id, name, status, started_at, ended_at, last_sequence,
              source, external_id, source_path, workspace, model, reasoning_effort,
              input_tokens, cached_input_tokens, output_tokens,
              reasoning_output_tokens, total_tokens, updated_at)
             VALUES (?, ?, 'stopped', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET name = excluded.name,
               started_at = excluded.started_at, ended_at = excluded.ended_at,
               last_sequence = excluded.last_sequence, source_path = excluded.source_path,
               workspace = excluded.workspace, model = excluded.model,
               reasoning_effort = excluded.reasoning_effort,
               input_tokens = excluded.input_tokens,
               cached_input_tokens = excluded.cached_input_tokens,
               output_tokens = excluded.output_tokens,
               reasoning_output_tokens = excluded.reasoning_output_tokens,
               total_tokens = excluded.total_tokens,
               updated_at = excluded.updated_at",
        )
        .bind(id.to_string())
        .bind(&session.name)
        .bind(session.started_at.to_rfc3339())
        .bind(session.updated_at.to_rfc3339())
        .bind(event_count)
        .bind(session.source.to_string())
        .bind(&session.external_id)
        .bind(session.source_path.display().to_string())
        .bind(&session.workspace)
        .bind(&session.usage.model)
        .bind(&session.usage.reasoning_effort)
        .bind(
            session
                .usage
                .input_tokens
                .and_then(|value| i64::try_from(value).ok()),
        )
        .bind(
            session
                .usage
                .cached_input_tokens
                .and_then(|value| i64::try_from(value).ok()),
        )
        .bind(
            session
                .usage
                .output_tokens
                .and_then(|value| i64::try_from(value).ok()),
        )
        .bind(
            session
                .usage
                .reasoning_output_tokens
                .and_then(|value| i64::try_from(value).ok()),
        )
        .bind(
            session
                .usage
                .total_tokens
                .and_then(|value| i64::try_from(value).ok()),
        )
        .bind(session.updated_at.to_rfc3339())
        .execute(&mut *transaction)
        .await?;
        sqlx::query("DELETE FROM agent_events WHERE session_id = ?")
            .bind(id.to_string())
            .execute(&mut *transaction)
            .await?;
        for (index, event) in session.events.into_iter().enumerate() {
            let sequence =
                i64::try_from(index + 1).map_err(|error| AppError::Storage(error.to_string()))?;
            let event_id = Uuid::new_v5(
                &Uuid::NAMESPACE_URL,
                format!("{identity}:{sequence}").as_bytes(),
            );
            sqlx::query(
                "INSERT INTO agent_events
                 (id, session_id, sequence, timestamp, source, kind, level, summary, payload)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            )
            .bind(event_id.to_string())
            .bind(id.to_string())
            .bind(sequence)
            .bind(event.timestamp.to_rfc3339())
            .bind(event.source.to_string())
            .bind(event.kind.to_string())
            .bind(event.level.to_string())
            .bind(event.summary)
            .bind(serde_json::to_string(&event.payload)?)
            .execute(&mut *transaction)
            .await?;
        }
        transaction.commit().await?;
        Ok(ImportOutcome {
            session_id: id,
            changed: true,
        })
    }
}

#[async_trait]
impl GovernanceRepository for SqliteRepository {
    async fn get_data_settings(&self) -> Result<AgentDataSettings, AppError> {
        let row = sqlx::query_as::<_, SettingsRow>(
            "SELECT retention_days, auto_cleanup, updated_at FROM agent_settings WHERE id = 1",
        )
        .fetch_one(&self.pool)
        .await?;
        Ok(AgentDataSettings {
            retention_days: u32::try_from(row.retention_days)
                .map_err(|error| AppError::Storage(error.to_string()))?,
            auto_cleanup: row.auto_cleanup,
            updated_at: parse_time(&row.updated_at)?,
        })
    }

    async fn update_data_settings(
        &self,
        mut settings: AgentDataSettings,
    ) -> Result<AgentDataSettings, AppError> {
        settings.validate()?;
        settings.updated_at = Utc::now();
        sqlx::query(
            "UPDATE agent_settings SET retention_days = ?, auto_cleanup = ?, updated_at = ?
             WHERE id = 1",
        )
        .bind(i64::from(settings.retention_days))
        .bind(settings.auto_cleanup)
        .bind(settings.updated_at.to_rfc3339())
        .execute(&self.pool)
        .await?;
        Ok(settings)
    }

    async fn storage_stats(&self) -> Result<StorageStats, AppError> {
        let page_count: i64 = sqlx::query_scalar("PRAGMA page_count")
            .fetch_one(&self.pool)
            .await?;
        let page_size: i64 = sqlx::query_scalar("PRAGMA page_size")
            .fetch_one(&self.pool)
            .await?;
        let session_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM capture_sessions")
            .fetch_one(&self.pool)
            .await?;
        let event_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM agent_events")
            .fetch_one(&self.pool)
            .await?;
        let oldest: Option<String> =
            sqlx::query_scalar("SELECT MIN(started_at) FROM capture_sessions")
                .fetch_one(&self.pool)
                .await?;
        Ok(StorageStats {
            database_bytes: nonnegative_u64(page_count.saturating_mul(page_size))?,
            session_count: nonnegative_u64(session_count)?,
            event_count: nonnegative_u64(event_count)?,
            oldest_session_at: oldest.map(|value| parse_time(&value)).transpose()?,
        })
    }

    async fn cleanup_preview(&self, cutoff: DateTime<Utc>) -> Result<CleanupPreview, AppError> {
        let cutoff_value = cutoff.to_rfc3339();
        let session_count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM capture_sessions WHERE updated_at < ?")
                .bind(&cutoff_value)
                .fetch_one(&self.pool)
                .await?;
        let event_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM agent_events WHERE session_id IN
             (SELECT id FROM capture_sessions WHERE updated_at < ?)",
        )
        .bind(&cutoff_value)
        .fetch_one(&self.pool)
        .await?;
        Ok(CleanupPreview {
            cutoff,
            session_count: nonnegative_u64(session_count)?,
            event_count: nonnegative_u64(event_count)?,
        })
    }

    async fn cleanup_before(&self, cutoff: DateTime<Utc>) -> Result<CleanupResult, AppError> {
        let before = self.storage_stats().await?.database_bytes;
        let result = sqlx::query("DELETE FROM capture_sessions WHERE updated_at < ?")
            .bind(cutoff.to_rfc3339())
            .execute(&self.pool)
            .await?;
        if result.rows_affected() > 0 {
            sqlx::query("VACUUM").execute(&self.pool).await?;
        }
        let after = self.storage_stats().await?.database_bytes;
        Ok(CleanupResult {
            deleted_sessions: result.rows_affected(),
            reclaimed_database_bytes: before.saturating_sub(after),
        })
    }
}

#[cfg(test)]
mod tests {
    use std::fs;

    use chrono::Utc;
    use serde_json::json;
    use sqlx::sqlite::SqlitePoolOptions;
    use uuid::Uuid;

    use crate::{
        application::ports::{CaptureRepository, GovernanceRepository, HistoryRepository},
        domain::{
            event::{EventKind, EventLevel, EventSource},
            governance::AgentDataSettings,
            history::{ImportedEvent, ImportedSession},
            session::{SessionSource, SessionUsage},
        },
    };

    use super::SqliteRepository;

    #[tokio::test]
    async fn backs_up_and_recovers_a_corrupt_database() {
        let path =
            std::env::temp_dir().join(format!("vibe-flow-corrupt-{}.sqlite3", Uuid::new_v4()));
        fs::write(&path, b"this is not a sqlite database").expect("corrupt fixture");

        let (repository, recovered_path) = SqliteRepository::connect_with_recovery(&path)
            .await
            .expect("recovery");
        let recovered_path = recovered_path.expect("backup path");

        assert!(recovered_path.exists());
        assert!(path.exists());
        repository.ping().await.expect("new database");

        for database in [path, recovered_path] {
            for suffix in ["", "-shm", "-wal"] {
                let _ = fs::remove_file(format!("{}{suffix}", database.display()));
            }
        }
    }

    #[tokio::test]
    async fn migration_removes_advanced_capture_rows_and_event_kinds() {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("database");
        sqlx::raw_sql(
            "CREATE TABLE capture_sessions (
                id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL,
                started_at TEXT NOT NULL, ended_at TEXT, last_sequence INTEGER NOT NULL,
                source TEXT NOT NULL, external_id TEXT, source_path TEXT, workspace TEXT,
                updated_at TEXT NOT NULL
             );
             CREATE TABLE agent_events (
                id TEXT PRIMARY KEY NOT NULL, session_id TEXT NOT NULL, sequence INTEGER NOT NULL,
                timestamp TEXT NOT NULL, source TEXT NOT NULL, kind TEXT NOT NULL,
                level TEXT NOT NULL, summary TEXT NOT NULL, payload TEXT NOT NULL,
                FOREIGN KEY (session_id) REFERENCES capture_sessions(id) ON DELETE CASCADE
             );
             INSERT INTO capture_sessions VALUES
                ('managed', 'Managed', 'stopped', '2026-01-01T00:00:00Z', NULL, 1,
                 'vibe_flow', NULL, NULL, NULL, '2026-01-01T00:00:00Z'),
                ('codex', 'Codex', 'stopped', '2026-01-01T00:00:00Z', NULL, 1,
                 'codex', 'external', '/tmp/codex.jsonl', NULL, '2026-01-01T00:00:00Z');
             INSERT INTO agent_events VALUES
                ('managed-event', 'managed', 1, '2026-01-01T00:00:00Z', 'agent',
                 'process_stdout', 'info', 'output', '{}'),
                ('codex-event', 'codex', 1, '2026-01-01T00:00:00Z', 'user',
                 'message', 'info', 'hello', '{}');",
        )
        .execute(&pool)
        .await
        .expect("legacy fixture");

        sqlx::raw_sql(include_str!(
            "../../../migrations/0008_remove_advanced_capture.sql"
        ))
        .execute(&pool)
        .await
        .expect("migration");

        let sources: Vec<String> = sqlx::query_scalar("SELECT source FROM capture_sessions")
            .fetch_all(&pool)
            .await
            .expect("sources");
        let kinds: Vec<String> = sqlx::query_scalar("SELECT kind FROM agent_events")
            .fetch_all(&pool)
            .await
            .expect("events");
        assert_eq!(sources, vec!["codex"]);
        assert_eq!(kinds, vec!["message"]);
    }

    #[tokio::test]
    async fn persists_sessions_across_repository_reconnects() {
        let path = std::env::temp_dir().join(format!("vibe-flow-{}.sqlite3", Uuid::new_v4()));
        let timestamp = Utc::now();
        let repository = SqliteRepository::connect(&path).await.expect("connect");
        let id = repository
            .import_session(ImportedSession {
                source: SessionSource::Codex,
                external_id: "restart-test".into(),
                name: "Restart test".into(),
                workspace: None,
                usage: SessionUsage {
                    model: Some("gpt-5".into()),
                    reasoning_effort: Some("high".into()),
                    input_tokens: Some(1_200),
                    output_tokens: Some(300),
                    total_tokens: Some(1_500),
                    ..SessionUsage::default()
                },
                source_path: "/tmp/restart.jsonl".into(),
                started_at: timestamp,
                updated_at: timestamp,
                events: vec![],
            })
            .await
            .expect("persist").session_id;
        let restored = SqliteRepository::connect(&path)
            .await
            .expect("reopen")
            .list_sessions(10, 0, None)
            .await
            .expect("restore");
        assert!(restored.iter().any(|session| {
            session.id == id
                && session.name == "Restart test"
                && session.usage.model.as_deref() == Some("gpt-5")
                && session.usage.total_tokens == Some(1_500)
        }));
        for suffix in ["", "-shm", "-wal"] {
            let _ = fs::remove_file(format!("{}{suffix}", path.display()));
        }
    }

    #[tokio::test]
    async fn filters_sessions_by_source() {
        let repository = SqliteRepository::in_memory().await.expect("database");
        let now = Utc::now();
        for (source, external_id) in [
            (SessionSource::Codex, "c1"),
            (SessionSource::Gemini, "g1"),
            (SessionSource::Cursor, "u1"),
        ] {
            repository
                .import_session(ImportedSession {
                    source,
                    external_id: external_id.into(),
                    name: external_id.into(),
                    workspace: None,
                    usage: SessionUsage::default(),
                    source_path: format!("/tmp/{external_id}").into(),
                    started_at: now,
                    updated_at: now,
                    events: vec![],
                })
                .await
                .expect("import");
        }
        let gemini = repository
            .list_sessions(10, 0, Some(SessionSource::Gemini))
            .await
            .expect("gemini");
        assert_eq!(gemini.len(), 1);
        assert_eq!(gemini[0].source, SessionSource::Gemini);
        let all = repository.list_sessions(10, 0, None).await.expect("all");
        assert_eq!(all.len(), 3);
    }

    #[tokio::test]
    async fn imports_and_replaces_external_sessions() {
        let repository = SqliteRepository::in_memory().await.expect("database");
        let timestamp = Utc::now();
        let make = |summary: &str| ImportedSession {
            source: SessionSource::Codex,
            external_id: "external-1".into(),
            name: "Imported session".into(),
            workspace: Some("/repo".into()),
            usage: SessionUsage::default(),
            source_path: "/tmp/session.jsonl".into(),
            started_at: timestamp,
            updated_at: timestamp,
            events: vec![ImportedEvent {
                timestamp,
                source: EventSource::User,
                kind: EventKind::Message,
                level: EventLevel::Info,
                summary: summary.into(),
                payload: json!({}),
            }],
        };
        let id = repository
            .import_session(make("first"))
            .await
            .expect("first")
            .session_id;
        assert_eq!(
            id,
            repository
                .import_session(make("updated"))
                .await
                .expect("second")
                .session_id
        );
        let events = repository.list_events(id, 0, 10).await.expect("events");
        assert_eq!(events[0].summary, "updated");
    }

    #[tokio::test]
    async fn persists_agent_data_settings() {
        let repository = SqliteRepository::in_memory().await.expect("database");
        repository
            .update_data_settings(AgentDataSettings {
                retention_days: 60,
                auto_cleanup: true,
                updated_at: Utc::now(),
            })
            .await
            .expect("settings");
        let restored = repository.get_data_settings().await.expect("load");
        assert_eq!(restored.retention_days, 60);
        assert!(restored.auto_cleanup);
    }

    #[tokio::test]
    async fn cleans_only_expired_agent_sessions() {
        let repository = SqliteRepository::in_memory().await.expect("database");
        let now = Utc::now();
        let make = |source, external_id: &str, updated_at| ImportedSession {
            source,
            external_id: external_id.into(),
            name: external_id.into(),
            workspace: None,
            usage: SessionUsage::default(),
            source_path: format!("/tmp/{external_id}.jsonl").into(),
            started_at: updated_at,
            updated_at,
            events: vec![],
        };
        repository
            .import_session(make(
                SessionSource::Codex,
                "expired-session",
                now - chrono::Duration::days(90),
            ))
            .await
            .expect("old persist").session_id;
        let recent_id = repository
            .import_session(make(SessionSource::Claude, "recent-session", now))
            .await
            .expect("recent persist").session_id;
        let cutoff = Utc::now() - chrono::Duration::days(30);
        assert_eq!(
            repository
                .cleanup_preview(cutoff)
                .await
                .expect("preview")
                .session_count,
            1
        );
        assert_eq!(
            repository
                .cleanup_before(cutoff)
                .await
                .expect("cleanup")
                .deleted_sessions,
            1
        );
        assert!(
            repository
                .list_sessions(10, 0, None)
                .await
                .expect("remaining sessions")
                .iter()
                .any(|session| session.id == recent_id)
        );
    }
}
