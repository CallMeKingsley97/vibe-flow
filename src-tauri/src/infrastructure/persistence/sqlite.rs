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
    application::ports::{
        AnalyticsRepository, CaptureRepository, GovernanceRepository, HistoryRepository,
        ImportOutcome,
    },
    domain::{
        analytics::{
            AnalyticsQuery, BaseUrlInsight, GlobalInsights, ProjectInsight, RankedItem, SourceInsight,
            TimeBucketPoint, TotalMetrics,
        },
        error::AppError,
        event::{AgentEvent, EventKind, EventLevel, EventSource},
        governance::{AgentDataSettings, CleanupPreview, CleanupResult, StorageStats},
        history::ImportedSession,
        search::{
            like_pattern, snippet_around, SearchHit, SearchMatchField, SearchQuery, SearchResult,
            SearchScope,
        },
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
    base_url: Option<String>,
    reasoning_effort: Option<String>,
    input_tokens: Option<i64>,
    cached_input_tokens: Option<i64>,
    output_tokens: Option<i64>,
    reasoning_output_tokens: Option<i64>,
    total_tokens: Option<i64>,
    is_favorite: i64,
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
                base_url: row.base_url,
                reasoning_effort: row.reasoning_effort,
                input_tokens: optional_nonnegative_u64(row.input_tokens)?,
                cached_input_tokens: optional_nonnegative_u64(row.cached_input_tokens)?,
                output_tokens: optional_nonnegative_u64(row.output_tokens)?,
                reasoning_output_tokens: optional_nonnegative_u64(row.reasoning_output_tokens)?,
                total_tokens: optional_nonnegative_u64(row.total_tokens)?,
            },
            is_favorite: row.is_favorite != 0,
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


const SESSION_SELECT: &str = "SELECT id, name, status, started_at, ended_at, last_sequence,
                        source, external_id, source_path, workspace, model, base_url, reasoning_effort,
                        input_tokens, cached_input_tokens, output_tokens,
                        reasoning_output_tokens, total_tokens, is_favorite, updated_at
                 FROM capture_sessions";

#[async_trait]
impl CaptureRepository for SqliteRepository {
    async fn list_sessions(
        &self,
        limit: u32,
        offset: u32,
        source: Option<SessionSource>,
        favorite_only: bool,
    ) -> Result<Vec<CaptureSession>, AppError> {
        let mut sql = String::from(SESSION_SELECT);
        let mut conditions = Vec::new();
        if source.is_some() {
            conditions.push("source = ?");
        }
        if favorite_only {
            conditions.push("is_favorite = 1");
        }
        if !conditions.is_empty() {
            sql.push_str(" WHERE ");
            sql.push_str(&conditions.join(" AND "));
        }
        sql.push_str(" ORDER BY updated_at DESC LIMIT ? OFFSET ?");
        let mut query = sqlx::query_as::<_, SessionRow>(&sql);
        if let Some(source) = source {
            query = query.bind(source.to_string());
        }
        let rows = query
            .bind(i64::from(limit))
            .bind(i64::from(offset))
            .fetch_all(&self.pool)
            .await?;
        rows.into_iter().map(TryInto::try_into).collect()
    }

    async fn set_session_favorite(
        &self,
        session_id: Uuid,
        favorite: bool,
    ) -> Result<CaptureSession, AppError> {
        let result = sqlx::query("UPDATE capture_sessions SET is_favorite = ? WHERE id = ?")
            .bind(i64::from(favorite))
            .bind(session_id.to_string())
            .execute(&self.pool)
            .await?;
        if result.rows_affected() == 0 {
            return Err(AppError::Validation(format!(
                "session not found: {session_id}"
            )));
        }
        let row = sqlx::query_as::<_, SessionRow>(&format!("{SESSION_SELECT} WHERE id = ?"))
            .bind(session_id.to_string())
            .fetch_optional(&self.pool)
            .await?
            .ok_or_else(|| AppError::Validation(format!("session not found: {session_id}")))?;
        row.try_into()
    }

    async fn search(&self, query: SearchQuery) -> Result<SearchResult, AppError> {
        search_history(&self.pool, query).await
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
    #[allow(clippy::too_many_lines)]
    async fn import_session(&self, session: ImportedSession) -> Result<ImportOutcome, AppError> {
        let identity = format!("{}:{}", session.source, session.external_id);
        let id = Uuid::new_v5(&Uuid::NAMESPACE_URL, identity.as_bytes());
        let event_count = i64::try_from(session.events.len())
            .map_err(|error| AppError::Storage(error.to_string()))?;
        // 以 sequence/name/model/base_url/tokens + 首尾事件摘要判断是否变更；
        // 不依赖 updated_at（Cursor DB 的 fallback 时间戳会随文件 mtime 抖动）
        let existing =
            sqlx::query_as::<_, (i64, String, Option<String>, Option<String>, Option<i64>)>(
                "SELECT last_sequence, name, model, base_url, total_tokens FROM capture_sessions WHERE id = ?",
            )
            .bind(id.to_string())
            .fetch_optional(&self.pool)
            .await?;
        if let Some((last_sequence, existing_name, model, base_url, total_tokens)) = existing {
            let same_tokens = total_tokens
                == session
                    .usage
                    .total_tokens
                    .and_then(|value| i64::try_from(value).ok());
            let same_model = model.as_deref() == session.usage.model.as_deref();
            let same_base_url = base_url.as_deref() == session.usage.base_url.as_deref();
            let same_meta = last_sequence == event_count
                && existing_name == session.name
                && same_tokens
                && same_model
                && same_base_url;
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
              source, external_id, source_path, workspace, model, base_url, reasoning_effort,
              input_tokens, cached_input_tokens, output_tokens,
              reasoning_output_tokens, total_tokens, updated_at)
             VALUES (?, ?, 'stopped', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET name = excluded.name,
               started_at = excluded.started_at, ended_at = excluded.ended_at,
               last_sequence = excluded.last_sequence, source_path = excluded.source_path,
               workspace = excluded.workspace, model = excluded.model,
               base_url = excluded.base_url,
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
        .bind(&session.usage.base_url)
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

fn optional_source_condition(source: Option<SessionSource>) -> String {
    source
        .map(|value| format!(" AND s.source = '{value}'"))
        .unwrap_or_default()
}

fn optional_workspace_condition(workspace: Option<&str>) -> (String, Option<String>) {
    workspace.map_or((String::new(), None), |value| {
        (" AND s.workspace = ?".to_string(), Some(value.to_string()))
    })
}

async fn scalar_u64(
    pool: &SqlitePool,
    sql: &str,
    binds: &[String],
) -> Result<u64, AppError> {
    let mut query = sqlx::query_scalar::<_, Option<i64>>(sql);
    for value in binds {
        query = query.bind(value);
    }
    let raw: Option<i64> = query.fetch_one(pool).await?;
    let value = raw.unwrap_or(0).max(0);
    nonnegative_u64(value)
}

async fn ranked(
    pool: &SqlitePool,
    sql: &str,
    binds: &[String],
) -> Result<Vec<RankedItem>, AppError> {
    let mut q = sqlx::query_as::<_, (String, i64)>(sql);
    for (index, value) in binds.iter().enumerate() {
        // The last bind is the LIMIT (integer). Bind it explicitly to i64.
        if index == binds.len() - 1 {
            let numeric: i64 = value
                .parse()
                .map_err(|error: std::num::ParseIntError| AppError::Storage(error.to_string()))?;
            q = q.bind(numeric);
        } else {
            q = q.bind(value);
        }
    }
    let rows = q.fetch_all(pool).await?;
    rows.into_iter()
        .map(|(name, count)| {
            Ok(RankedItem {
                name,
                count: nonnegative_u64(count)?,
            })
        })
        .collect()
}


#[allow(clippy::too_many_lines)]
async fn search_history(pool: &SqlitePool, query: SearchQuery) -> Result<SearchResult, AppError> {
    let pattern = like_pattern(&query.query);
    let fetch_limit = i64::from(query.limit) + 1;
    let mut clauses: Vec<String> = Vec::new();
    let mut include_sessions = false;
    let mut include_messages = false;
    let mut include_tools = false;
    let mut include_skills = false;
    let mut include_mcp = false;
    let mut include_commands = false;
    match query.scope {
        SearchScope::All => {
            include_sessions = true;
            include_messages = true;
            include_tools = true;
            include_skills = true;
            include_mcp = true;
            include_commands = true;
        }
        SearchScope::Sessions => include_sessions = true,
        SearchScope::Messages => include_messages = true,
        SearchScope::Tools => include_tools = true,
        SearchScope::Skills => include_skills = true,
        SearchScope::Mcp => include_mcp = true,
        SearchScope::Commands => include_commands = true,
    }

    let mut session_filter = String::new();
    if query.source.is_some() {
        session_filter.push_str(" AND s.source = ?");
    }
    if query.workspace.is_some() {
        session_filter.push_str(" AND s.workspace = ?");
    }

    if include_sessions {
        clauses.push(format!(
            "SELECT s.id AS session_id, s.name AS session_name, s.source AS source,
                    s.workspace AS workspace, s.updated_at AS sort_key,
                    NULL AS event_id, NULL AS sequence, NULL AS kind, NULL AS timestamp,
                    CASE
                      WHEN s.name LIKE ? ESCAPE '\\' THEN 'session_name'
                      ELSE 'workspace'
                    END AS match_field,
                    CASE
                      WHEN s.name LIKE ? ESCAPE '\\' THEN s.name
                      ELSE COALESCE(s.workspace, '')
                    END AS snippet
             FROM capture_sessions s
             WHERE (s.name LIKE ? ESCAPE '\\' OR COALESCE(s.workspace, '') LIKE ? ESCAPE '\\')
             {session_filter}"
        ));
    }
    if include_messages {
        clauses.push(format!(
            "SELECT s.id, s.name, s.source, s.workspace, e.timestamp AS sort_key,
                    e.id, e.sequence, e.kind, e.timestamp,
                    'summary' AS match_field, e.summary AS snippet
             FROM capture_sessions s
             JOIN agent_events e ON e.session_id = s.id
             WHERE e.kind = 'message' AND e.summary LIKE ? ESCAPE '\\'
             {session_filter}"
        ));
    }
    if include_tools {
        clauses.push(format!(
            "SELECT s.id, s.name, s.source, s.workspace, e.timestamp AS sort_key,
                    e.id, e.sequence, e.kind, e.timestamp,
                    'tool_name' AS match_field,
                    COALESCE(json_extract(e.payload, '$.toolName'), e.summary) AS snippet
             FROM capture_sessions s
             JOIN agent_events e ON e.session_id = s.id
             WHERE e.kind = 'tool_call'
               AND COALESCE(json_extract(e.payload, '$.toolName'), '') LIKE ? ESCAPE '\\'
             {session_filter}"
        ));
    }
    if include_skills {
        clauses.push(format!(
            "SELECT s.id, s.name, s.source, s.workspace, e.timestamp AS sort_key,
                    e.id, e.sequence, e.kind, e.timestamp,
                    'skill' AS match_field,
                    COALESCE(json_extract(e.payload, '$.skillName'), '') AS snippet
             FROM capture_sessions s
             JOIN agent_events e ON e.session_id = s.id
             WHERE e.kind = 'tool_call'
               AND COALESCE(json_extract(e.payload, '$.skillName'), '') LIKE ? ESCAPE '\\'
             {session_filter}"
        ));
    }
    if include_mcp {
        clauses.push(format!(
            "SELECT s.id, s.name, s.source, s.workspace, e.timestamp AS sort_key,
                    e.id, e.sequence, e.kind, e.timestamp,
                    'mcp' AS match_field,
                    COALESCE(json_extract(e.payload, '$.mcpServer'), '') AS snippet
             FROM capture_sessions s
             JOIN agent_events e ON e.session_id = s.id
             WHERE e.kind = 'tool_call'
               AND COALESCE(json_extract(e.payload, '$.mcpServer'), '') LIKE ? ESCAPE '\\'
             {session_filter}"
        ));
    }
    if include_commands {
        clauses.push(format!(
            "SELECT s.id, s.name, s.source, s.workspace, e.timestamp AS sort_key,
                    e.id, e.sequence, e.kind, e.timestamp,
                    'command' AS match_field,
                    COALESCE(json_extract(e.payload, '$.command'), e.summary) AS snippet
             FROM capture_sessions s
             JOIN agent_events e ON e.session_id = s.id
             WHERE e.kind = 'tool_call'
               AND (
                 COALESCE(json_extract(e.payload, '$.command'), '') LIKE ? ESCAPE '\\'
                 OR e.payload LIKE ? ESCAPE '\\'
               )
             {session_filter}"
        ));
    }

    if clauses.is_empty() {
        return Ok(SearchResult {
            hits: Vec::new(),
            has_more: false,
        });
    }

    let union_sql = format!(
        "SELECT * FROM ({}) ORDER BY sort_key DESC LIMIT ? OFFSET ?",
        clauses.join(" UNION ALL ")
    );

    let mut q = sqlx::query_as::<
        _,
        (
            String,
            String,
            String,
            Option<String>,
            String,
            Option<String>,
            Option<i64>,
            Option<String>,
            Option<String>,
            String,
            String,
        ),
    >(&union_sql);

    if include_sessions {
        q = q.bind(&pattern).bind(&pattern).bind(&pattern).bind(&pattern);
        if let Some(source) = query.source {
            q = q.bind(source.to_string());
        }
        if let Some(workspace) = query.workspace.as_ref() {
            q = q.bind(workspace);
        }
    }
    for include in [include_messages, include_tools, include_skills, include_mcp] {
        if include {
            q = q.bind(&pattern);
            if let Some(source) = query.source {
                q = q.bind(source.to_string());
            }
            if let Some(workspace) = query.workspace.as_ref() {
                q = q.bind(workspace);
            }
        }
    }
    if include_commands {
        q = q.bind(&pattern).bind(&pattern);
        if let Some(source) = query.source {
            q = q.bind(source.to_string());
        }
        if let Some(workspace) = query.workspace.as_ref() {
            q = q.bind(workspace);
        }
    }
    q = q
        .bind(fetch_limit)
        .bind(i64::from(query.offset));

    let rows = q.fetch_all(pool).await?;
    let has_more = rows.len() > usize::try_from(query.limit).unwrap_or(usize::MAX);
    let mut hits = Vec::new();
    for (
        session_id,
        session_name,
        source,
        workspace,
        sort_key,
        event_id,
        sequence,
        kind,
        timestamp,
        match_field,
        snippet,
    ) in rows.into_iter().take(usize::try_from(query.limit).unwrap_or(0))
    {
        let match_field = SearchMatchField::parse(&match_field)?;
        let snippet = snippet_around(&snippet, &query.query, 160);
        hits.push(SearchHit {
            session_id: Uuid::parse_str(&session_id)
                .map_err(|error| AppError::Storage(error.to_string()))?,
            session_name,
            source: SessionSource::from_str(&source)?,
            workspace,
            updated_at: parse_time(&sort_key).or_else(|_| {
                timestamp
                    .as_deref()
                    .map(parse_time)
                    .transpose()?
                    .ok_or_else(|| AppError::Storage("missing sort timestamp".into()))
            })?,
            event_id: event_id
                .as_deref()
                .map(Uuid::parse_str)
                .transpose()
                .map_err(|error| AppError::Storage(error.to_string()))?,
            sequence: sequence.map(nonnegative_u64).transpose()?,
            kind: kind.as_deref().map(EventKind::from_str).transpose()?,
            timestamp: timestamp.as_deref().map(parse_time).transpose()?,
            match_field,
            snippet,
        });
    }
    Ok(SearchResult { hits, has_more })
}

#[async_trait]
impl AnalyticsRepository for SqliteRepository {
    #[allow(clippy::too_many_lines)]
    async fn global_insights(&self, query: AnalyticsQuery) -> Result<GlobalInsights, AppError> {
        let from = query.from.to_rfc3339();
        let to = query.to.to_rfc3339();
        let source_clause = optional_source_condition(query.source);
        let (workspace_clause, workspace_value) =
            optional_workspace_condition(query.workspace.as_deref());
        let base_binds = {
            let mut binds = vec![from.clone(), to.clone()];
            if let Some(value) = workspace_value.as_ref() {
                binds.push(value.clone());
            }
            binds
        };

        let sessions = scalar_u64(
            &self.pool,
            &format!(
                "SELECT COUNT(*) FROM capture_sessions s
                 WHERE s.updated_at BETWEEN ? AND ?{source_clause}{workspace_clause}"
            ),
            &base_binds,
        )
        .await?;

        // Aggregate token metrics from sessions.
        let token_sql = format!(
            "SELECT COALESCE(SUM(input_tokens), 0),
                    COALESCE(SUM(output_tokens), 0),
                    COALESCE(SUM(total_tokens), 0)
             FROM capture_sessions s
             WHERE s.updated_at BETWEEN ? AND ?{source_clause}{workspace_clause}"
        );
        let mut token_row =
            sqlx::query_as::<_, (Option<i64>, Option<i64>, Option<i64>)>(&token_sql);
        for value in &base_binds {
            token_row = token_row.bind(value);
        }
        let (input_tokens, output_tokens, total_tokens) =
            token_row.fetch_one(&self.pool).await?;

        // Event-derived metrics via a single join.
        let event_metrics_sql = format!(
            "SELECT
                COUNT(*),
                SUM(CASE WHEN e.source = 'user' AND e.kind = 'message' THEN 1 ELSE 0 END),
                SUM(CASE WHEN e.source = 'agent' AND e.kind = 'message' THEN 1 ELSE 0 END),
                SUM(CASE WHEN e.kind = 'tool_call'
                              AND COALESCE(json_extract(e.payload, '$.toolCategory'), '') != 'wait'
                         THEN 1 ELSE 0 END),
                SUM(CASE WHEN e.kind = 'command'
                              OR (e.kind = 'tool_call' AND json_extract(e.payload, '$.toolCategory') = 'command')
                         THEN 1 ELSE 0 END),
                SUM(CASE WHEN e.kind = 'file_change' THEN 1 ELSE 0 END),
                SUM(CASE WHEN e.level = 'error' OR json_extract(e.payload, '$.failed') = 1 THEN 1 ELSE 0 END)
             FROM capture_sessions s
             JOIN agent_events e ON e.session_id = s.id
             WHERE s.updated_at BETWEEN ? AND ?{source_clause}{workspace_clause}"
        );
        let mut event_metrics_query = sqlx::query_as::<
            _,
            (
                Option<i64>,
                Option<i64>,
                Option<i64>,
                Option<i64>,
                Option<i64>,
                Option<i64>,
                Option<i64>,
            ),
        >(&event_metrics_sql);
        for value in &base_binds {
            event_metrics_query = event_metrics_query.bind(value);
        }
        let (events, user_messages, agent_messages, tool_calls, commands, file_changes, errors) =
            event_metrics_query.fetch_one(&self.pool).await?;

        let totals = TotalMetrics {
            sessions,
            events: nonnegative_u64(events.unwrap_or(0).max(0))?,
            user_messages: nonnegative_u64(user_messages.unwrap_or(0).max(0))?,
            agent_messages: nonnegative_u64(agent_messages.unwrap_or(0).max(0))?,
            tool_calls: nonnegative_u64(tool_calls.unwrap_or(0).max(0))?,
            commands: nonnegative_u64(commands.unwrap_or(0).max(0))?,
            file_changes: nonnegative_u64(file_changes.unwrap_or(0).max(0))?,
            errors: nonnegative_u64(errors.unwrap_or(0).max(0))?,
            input_tokens: nonnegative_u64(input_tokens.unwrap_or(0).max(0))?,
            output_tokens: nonnegative_u64(output_tokens.unwrap_or(0).max(0))?,
            total_tokens: nonnegative_u64(total_tokens.unwrap_or(0).max(0))?,
        };

        // Per-source aggregation, ignoring the source filter to make comparison meaningful.
        let source_sql = format!(
            "SELECT s.source,
                    COUNT(DISTINCT s.id),
                    COUNT(e.id),
                    SUM(CASE WHEN e.kind = 'tool_call'
                                  AND COALESCE(json_extract(e.payload, '$.toolCategory'), '') != 'wait'
                             THEN 1 ELSE 0 END),
                    SUM(CASE WHEN e.kind = 'command'
                                  OR (e.kind = 'tool_call' AND json_extract(e.payload, '$.toolCategory') = 'command')
                             THEN 1 ELSE 0 END),
                    SUM(CASE WHEN e.level = 'error' OR json_extract(e.payload, '$.failed') = 1 THEN 1 ELSE 0 END),
                    COALESCE(SUM(s.total_tokens), 0)
             FROM capture_sessions s
             LEFT JOIN agent_events e ON e.session_id = s.id
             WHERE s.updated_at BETWEEN ? AND ?{workspace_clause}
             GROUP BY s.source
             ORDER BY COUNT(DISTINCT s.id) DESC"
        );
        let mut source_query = sqlx::query_as::<
            _,
            (
                String,
                i64,
                Option<i64>,
                Option<i64>,
                Option<i64>,
                Option<i64>,
                Option<i64>,
            ),
        >(&source_sql);
        source_query = source_query.bind(&from).bind(&to);
        if let Some(value) = workspace_value.as_ref() {
            source_query = source_query.bind(value);
        }
        let source_rows = source_query.fetch_all(&self.pool).await?;
        let mut by_source = Vec::with_capacity(source_rows.len());
        for (source, sessions, events, tool_calls, commands, errors, tokens) in source_rows {
            by_source.push(SourceInsight {
                source: SessionSource::from_str(&source)?,
                sessions: nonnegative_u64(sessions)?,
                events: nonnegative_u64(events.unwrap_or(0).max(0))?,
                tool_calls: nonnegative_u64(tool_calls.unwrap_or(0).max(0))?,
                commands: nonnegative_u64(commands.unwrap_or(0).max(0))?,
                errors: nonnegative_u64(errors.unwrap_or(0).max(0))?,
                total_tokens: nonnegative_u64(tokens.unwrap_or(0).max(0))?,
            });
        }

        // Per-model/provider aggregation from capture_sessions.model.
        let provider_sql = format!(
            "SELECT COALESCE(NULLIF(TRIM(s.model), ''), '未知模型'),
                    COUNT(DISTINCT s.id),
                    COUNT(e.id),
                    SUM(CASE WHEN e.level = 'error' OR json_extract(e.payload, '$.failed') = 1 THEN 1 ELSE 0 END),
                    COALESCE(SUM(s.total_tokens), 0)
             FROM capture_sessions s
             LEFT JOIN agent_events e ON e.session_id = s.id
             WHERE s.updated_at BETWEEN ? AND ?{source_clause}{workspace_clause}
             GROUP BY COALESCE(NULLIF(TRIM(s.model), ''), '未知模型')
             ORDER BY COUNT(DISTINCT s.id) DESC, COALESCE(SUM(s.total_tokens), 0) DESC
             LIMIT ?"
        );
        let mut provider_query = sqlx::query_as::<
            _,
            (
                String,
                i64,
                Option<i64>,
                Option<i64>,
                Option<i64>,
            ),
        >(&provider_sql);
        for value in &base_binds {
            provider_query = provider_query.bind(value);
        }
        provider_query = provider_query.bind(i64::from(query.ranking_limit.max(query.project_limit)));
        let provider_rows = provider_query.fetch_all(&self.pool).await?;
        let mut by_provider = Vec::with_capacity(provider_rows.len());
        for (provider, sessions, events, errors, tokens) in provider_rows {
            by_provider.push(crate::domain::analytics::ProviderInsight {
                provider,
                sessions: nonnegative_u64(sessions)?,
                events: nonnegative_u64(events.unwrap_or(0).max(0))?,
                errors: nonnegative_u64(errors.unwrap_or(0).max(0))?,
                total_tokens: nonnegative_u64(tokens.unwrap_or(0).max(0))?,
            });
        }

        // Per base_url aggregation from capture_sessions.base_url.
        let base_url_sql = format!(
            "SELECT COALESCE(NULLIF(TRIM(s.base_url), ''), '未知提供商'),
                    COUNT(DISTINCT s.id),
                    COUNT(e.id),
                    SUM(CASE WHEN e.level = 'error' OR json_extract(e.payload, '$.failed') = 1 THEN 1 ELSE 0 END),
                    COALESCE(SUM(s.total_tokens), 0)
             FROM capture_sessions s
             LEFT JOIN agent_events e ON e.session_id = s.id
             WHERE s.updated_at BETWEEN ? AND ?{source_clause}{workspace_clause}
             GROUP BY COALESCE(NULLIF(TRIM(s.base_url), ''), '未知提供商')
             ORDER BY COUNT(DISTINCT s.id) DESC, COALESCE(SUM(s.total_tokens), 0) DESC
             LIMIT ?"
        );
        let mut base_url_query = sqlx::query_as::<
            _,
            (
                String,
                i64,
                Option<i64>,
                Option<i64>,
                Option<i64>,
            ),
        >(&base_url_sql);
        for value in &base_binds {
            base_url_query = base_url_query.bind(value);
        }
        base_url_query =
            base_url_query.bind(i64::from(query.ranking_limit.max(query.project_limit)));
        let base_url_rows = base_url_query.fetch_all(&self.pool).await?;
        let mut by_base_url = Vec::with_capacity(base_url_rows.len());
        for (base_url, sessions, events, errors, tokens) in base_url_rows {
            by_base_url.push(BaseUrlInsight {
                base_url,
                sessions: nonnegative_u64(sessions)?,
                events: nonnegative_u64(events.unwrap_or(0).max(0))?,
                errors: nonnegative_u64(errors.unwrap_or(0).max(0))?,
                total_tokens: nonnegative_u64(tokens.unwrap_or(0).max(0))?,
            });
        }

        // Per-workspace aggregation. Sessions with NULL workspace are grouped as "未分类".
        let project_sql = format!(
            "SELECT COALESCE(NULLIF(TRIM(s.workspace), ''), '未分类'),
                    COUNT(DISTINCT s.id),
                    COUNT(e.id),
                    SUM(CASE WHEN e.level = 'error' OR json_extract(e.payload, '$.failed') = 1 THEN 1 ELSE 0 END),
                    COALESCE(SUM(s.total_tokens), 0),
                    MAX(s.updated_at)
             FROM capture_sessions s
             LEFT JOIN agent_events e ON e.session_id = s.id
             WHERE s.updated_at BETWEEN ? AND ?{source_clause}
             GROUP BY COALESCE(NULLIF(TRIM(s.workspace), ''), '未分类')
             ORDER BY COUNT(DISTINCT s.id) DESC, MAX(s.updated_at) DESC
             LIMIT ?"
        );
        let project_rows = sqlx::query_as::<
            _,
            (
                String,
                i64,
                Option<i64>,
                Option<i64>,
                Option<i64>,
                Option<String>,
            ),
        >(&project_sql)
        .bind(&from)
        .bind(&to)
        .bind(i64::from(query.project_limit))
        .fetch_all(&self.pool)
        .await?;
        let mut by_project = Vec::with_capacity(project_rows.len());
        for (workspace, sessions, events, errors, tokens, last_active) in project_rows {
            let last_active_at = last_active
                .as_deref()
                .map(parse_time)
                .transpose()?
                .unwrap_or(query.to);
            by_project.push(ProjectInsight {
                workspace,
                sessions: nonnegative_u64(sessions)?,
                events: nonnegative_u64(events.unwrap_or(0).max(0))?,
                errors: nonnegative_u64(errors.unwrap_or(0).max(0))?,
                total_tokens: nonnegative_u64(tokens.unwrap_or(0).max(0))?,
                last_active_at,
            });
        }

        // Timeline bucketed by day or week.
        let bucket_format = query.bucket.sqlite_format();
        let timeline_sql = format!(
            "SELECT strftime('{bucket_format}', s.started_at) AS bucket,
                    COUNT(DISTINCT s.id),
                    COUNT(e.id),
                    SUM(CASE WHEN e.level = 'error' OR json_extract(e.payload, '$.failed') = 1 THEN 1 ELSE 0 END)
             FROM capture_sessions s
             LEFT JOIN agent_events e ON e.session_id = s.id
             WHERE s.updated_at BETWEEN ? AND ?{source_clause}{workspace_clause}
             GROUP BY bucket
             ORDER BY bucket ASC"
        );
        let mut timeline_query =
            sqlx::query_as::<_, (Option<String>, i64, Option<i64>, Option<i64>)>(&timeline_sql);
        for value in &base_binds {
            timeline_query = timeline_query.bind(value);
        }
        let timeline_rows = timeline_query.fetch_all(&self.pool).await?;
        let mut timeline = Vec::with_capacity(timeline_rows.len());
        for (bucket, sessions, events, errors) in timeline_rows {
            let Some(bucket) = bucket else { continue };
            timeline.push(TimeBucketPoint {
                bucket,
                sessions: nonnegative_u64(sessions)?,
                events: nonnegative_u64(events.unwrap_or(0).max(0))?,
                errors: nonnegative_u64(errors.unwrap_or(0).max(0))?,
            });
        }

        // Rankings from tool events, honoring the source/workspace filters.
        let ranking_binds = |field: &str| -> (String, Vec<String>) {
            let sql = format!(
                "SELECT json_extract(e.payload, '{field}') AS item_name, COUNT(*) AS occurrences
                 FROM capture_sessions s
                 JOIN agent_events e ON e.session_id = s.id
                 WHERE s.updated_at BETWEEN ? AND ?{source_clause}{workspace_clause}
                   AND e.kind = 'tool_call'
                   AND COALESCE(json_extract(e.payload, '$.toolCategory'), '') != 'wait'
                   AND json_extract(e.payload, '{field}') IS NOT NULL
                   AND TRIM(json_extract(e.payload, '{field}')) != ''
                 GROUP BY json_extract(e.payload, '{field}')
                 ORDER BY occurrences DESC, item_name ASC
                 LIMIT ?"
            );
            let mut binds = base_binds.clone();
            binds.push(query.ranking_limit.to_string());
            (sql, binds)
        };

        let (tools_sql, tools_binds) = ranking_binds("$.toolName");
        let top_tools = ranked(&self.pool, &tools_sql, &tools_binds).await?;
        let (skills_sql, skills_binds) = ranking_binds("$.skillName");
        let top_skills = ranked(&self.pool, &skills_sql, &skills_binds).await?;
        let (mcp_sql, mcp_binds) = ranking_binds("$.mcpServer");
        let top_mcp = ranked(&self.pool, &mcp_sql, &mcp_binds).await?;

        Ok(GlobalInsights {
            from: query.from,
            to: query.to,
            totals,
            by_source,
            by_provider,
            by_base_url,
            by_project,
            timeline,
            top_tools,
            top_skills,
            top_mcp,
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
        application::ports::{
            AnalyticsRepository, CaptureRepository, GovernanceRepository, HistoryRepository,
        },
        domain::{
            analytics::{AnalyticsQuery, TimeBucket},
            event::{EventKind, EventLevel, EventSource},
            governance::AgentDataSettings,
            history::{ImportedEvent, ImportedSession},
            search::{SearchMatchField, SearchQuery, SearchScope},
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
            .list_sessions(10, 0, None, false)
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
            .list_sessions(10, 0, Some(SessionSource::Gemini), false)
            .await
            .expect("gemini");
        assert_eq!(gemini.len(), 1);
        assert_eq!(gemini[0].source, SessionSource::Gemini);
        let all = repository.list_sessions(10, 0, None, false).await.expect("all");
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
            .expect("old persist");
        let recent_id = repository
            .import_session(make(SessionSource::Claude, "recent-session", now))
            .await
            .expect("recent persist")
            .session_id;
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
                .list_sessions(10, 0, None, false)
                .await
                .expect("remaining sessions")
                .iter()
                .any(|session| session.id == recent_id)
        );
    }

    fn sample_query(
        from: chrono::DateTime<Utc>,
        to: chrono::DateTime<Utc>,
        bucket: TimeBucket,
    ) -> AnalyticsQuery {
        AnalyticsQuery {
            source: None,
            workspace: None,
            from,
            to,
            bucket,
            project_limit: 8,
            ranking_limit: 8,
        }
    }

    fn session(
        source: SessionSource,
        external_id: &str,
        workspace: Option<&str>,
        started_at: chrono::DateTime<Utc>,
        updated_at: chrono::DateTime<Utc>,
        events: Vec<ImportedEvent>,
        total_tokens: Option<u64>,
    ) -> ImportedSession {
        ImportedSession {
            source,
            external_id: external_id.into(),
            name: external_id.into(),
            workspace: workspace.map(str::to_string),
            usage: SessionUsage {
                total_tokens,
                input_tokens: total_tokens.map(|value| value / 2),
                output_tokens: total_tokens.map(|value| value / 2),
                ..SessionUsage::default()
            },
            source_path: format!("/tmp/{external_id}.jsonl").into(),
            started_at,
            updated_at,
            events,
        }
    }

    fn tool_event(
        timestamp: chrono::DateTime<Utc>,
        tool_name: &str,
        category: &str,
        skill: Option<&str>,
        mcp: Option<&str>,
    ) -> ImportedEvent {
        let mut payload = json!({
            "toolName": tool_name,
            "toolCategory": category,
        });
        if let Some(skill_name) = skill {
            payload["skillName"] = json!(skill_name);
        }
        if let Some(server) = mcp {
            payload["mcpServer"] = json!(server);
        }
        ImportedEvent {
            timestamp,
            source: EventSource::Tool,
            kind: EventKind::ToolCall,
            level: EventLevel::Info,
            summary: tool_name.into(),
            payload,
        }
    }

    #[tokio::test]
    async fn global_insights_returns_empty_totals_for_empty_range() {
        let repository = SqliteRepository::in_memory().await.expect("database");
        let now = Utc::now();
        let insights = repository
            .global_insights(sample_query(
                now - chrono::Duration::days(1),
                now,
                TimeBucket::Day,
            ))
            .await
            .expect("insights");
        assert_eq!(insights.totals.sessions, 0);
        assert_eq!(insights.totals.events, 0);
        assert!(insights.by_source.is_empty());
        assert!(insights.by_provider.is_empty());
        assert!(insights.timeline.is_empty());
        assert!(insights.top_tools.is_empty());
    }

    #[tokio::test]
    #[allow(clippy::too_many_lines)]
    async fn global_insights_aggregates_across_sources() {
        let repository = SqliteRepository::in_memory().await.expect("database");
        let now = Utc::now();
        let day_ago = now - chrono::Duration::days(1);

        repository
            .import_session({
                let mut s = session(
                    SessionSource::Codex,
                    "codex-1",
                    Some("/tmp/a"),
                    day_ago,
                    day_ago,
                    vec![
                        tool_event(day_ago, "Bash", "command", None, None),
                        ImportedEvent {
                            timestamp: day_ago,
                            source: EventSource::User,
                            kind: EventKind::Message,
                            level: EventLevel::Info,
                            summary: "hello".into(),
                            payload: json!({}),
                        },
                    ],
                    Some(100),
                );
                s.usage.model = Some("gpt-5".into());
                s
            })
            .await
            .expect("import codex");
        repository
            .import_session({
                let mut s = session(
                    SessionSource::Claude,
                    "claude-1",
                    Some("/tmp/b"),
                    day_ago,
                    day_ago,
                    vec![tool_event(
                        day_ago,
                        "Read",
                        "file",
                        Some("code-review"),
                        Some("chrome"),
                    )],
                    Some(200),
                );
                s.usage.model = Some("claude-opus-4".into());
                s
            })
            .await
            .expect("import claude");
        repository
            .import_session(session(
                SessionSource::Gemini,
                "gemini-1",
                Some("/tmp/a"),
                day_ago,
                day_ago,
                vec![],
                Some(50),
            ))
            .await
            .expect("import gemini");

        let insights = repository
            .global_insights(sample_query(
                now - chrono::Duration::days(7),
                now,
                TimeBucket::Day,
            ))
            .await
            .expect("insights");

        assert_eq!(insights.totals.sessions, 3);
        assert!(insights.totals.events >= 3);
        assert_eq!(insights.by_source.len(), 3);
        assert_eq!(
            insights
                .by_source
                .iter()
                .map(|item| item.sessions)
                .sum::<u64>(),
            3
        );
        assert!(
            insights
                .by_project
                .iter()
                .any(|project| project.workspace == "/tmp/a" && project.sessions == 2)
        );
        assert!(
            insights
                .by_provider
                .iter()
                .any(|item| item.provider == "gpt-5" && item.sessions == 1)
        );
        assert!(
            insights
                .by_provider
                .iter()
                .any(|item| item.provider == "claude-opus-4" && item.sessions == 1)
        );
        assert!(
            insights
                .by_provider
                .iter()
                .any(|item| item.provider == "未知模型")
        );
    }

    #[tokio::test]
    async fn global_insights_filters_by_workspace() {
        let repository = SqliteRepository::in_memory().await.expect("database");
        let now = Utc::now();
        let day_ago = now - chrono::Duration::days(1);

        repository
            .import_session(session(
                SessionSource::Codex,
                "ws-a",
                Some("/Users/demo/a"),
                day_ago,
                day_ago,
                vec![tool_event(day_ago, "Bash", "command", None, None)],
                Some(10),
            ))
            .await
            .expect("a");
        repository
            .import_session(session(
                SessionSource::Claude,
                "ws-b",
                Some("/Users/demo/b"),
                day_ago,
                day_ago,
                vec![tool_event(day_ago, "Read", "file", None, None)],
                Some(20),
            ))
            .await
            .expect("b");

        let mut query = sample_query(now - chrono::Duration::days(7), now, TimeBucket::Day);
        query.workspace = Some("/Users/demo/a".into());
        let insights = repository.global_insights(query).await.expect("insights");

        assert_eq!(insights.totals.sessions, 1);
        assert_eq!(insights.totals.tool_calls, 1);
        // by_source intentionally ignores source filter, but still respects workspace.
        assert_eq!(insights.by_source.iter().map(|s| s.sessions).sum::<u64>(), 1);
    }

    #[tokio::test]
    async fn global_insights_time_buckets_by_day_and_week() {
        let repository = SqliteRepository::in_memory().await.expect("database");
        let now = Utc::now();
        let today = now;
        let yesterday = now - chrono::Duration::days(1);
        let last_week = now - chrono::Duration::days(8);

        for (id, stamp) in [("d1", today), ("d2", yesterday), ("d3", last_week)] {
            repository
                .import_session(session(
                    SessionSource::Codex,
                    id,
                    Some("/tmp/x"),
                    stamp,
                    stamp,
                    vec![],
                    None,
                ))
                .await
                .expect("import");
        }

        let day_insights = repository
            .global_insights(sample_query(
                now - chrono::Duration::days(14),
                now + chrono::Duration::hours(1),
                TimeBucket::Day,
            ))
            .await
            .expect("day");
        assert!(day_insights.timeline.len() >= 2);
        assert_eq!(
            day_insights.timeline.iter().map(|p| p.sessions).sum::<u64>(),
            3
        );

        let week_insights = repository
            .global_insights(sample_query(
                now - chrono::Duration::days(14),
                now + chrono::Duration::hours(1),
                TimeBucket::Week,
            ))
            .await
            .expect("week");
        assert!(!week_insights.timeline.is_empty());
        assert_eq!(
            week_insights
                .timeline
                .iter()
                .map(|point| point.sessions)
                .sum::<u64>(),
            3
        );
        assert!(week_insights.timeline.iter().all(|point| point.bucket.contains('W')
            || point.bucket.contains('-')));
    }

    #[tokio::test]
    async fn global_insights_ranks_tools_by_frequency() {
        let repository = SqliteRepository::in_memory().await.expect("database");
        let now = Utc::now();
        let stamp = now - chrono::Duration::hours(2);

        repository
            .import_session(session(
                SessionSource::Claude,
                "tools-1",
                Some("/tmp/tools"),
                stamp,
                stamp,
                vec![
                    tool_event(stamp, "Bash", "command", None, None),
                    tool_event(stamp, "Bash", "command", None, None),
                    tool_event(stamp, "Read", "file", Some("review"), None),
                    tool_event(stamp, "Wait", "wait", None, None),
                    tool_event(stamp, "McpTool", "mcp", None, Some("devtools")),
                ],
                Some(30),
            ))
            .await
            .expect("import");

        let sessions = repository
            .list_sessions(10, 0, None, false)
            .await
            .expect("sessions");
        let session_id = sessions[0].id;
        let events = repository
            .list_events(session_id, 0, 20)
            .await
            .expect("events");
        assert_eq!(events.len(), 5, "events={events:?}");
        let tool_names: Vec<String> = events
            .iter()
            .filter_map(|event| {
                event
                    .payload
                    .get("toolName")
                    .and_then(|value| value.as_str())
                    .map(str::to_string)
            })
            .collect();
        assert_eq!(
            tool_names,
            vec!["Bash", "Bash", "Read", "Wait", "McpTool"],
            "payload tool names should match fixtures; events={events:?}"
        );

        let insights = repository
            .global_insights(sample_query(
                now - chrono::Duration::days(1),
                now,
                TimeBucket::Day,
            ))
            .await
            .expect("insights");

        assert_eq!(
            insights.totals.tool_calls, 4,
            "wait tools excluded from tool_calls; totals={:?}",
            insights.totals
        );
        assert_eq!(insights.top_tools.first().map(|item| item.name.as_str()), Some("Bash"));
        let bash_count = insights
            .top_tools
            .iter()
            .find(|item| item.name == "Bash")
            .map(|item| item.count);
        assert_eq!(bash_count, Some(2), "top_tools={:?}", insights.top_tools);
        assert!(
            insights
                .top_tools
                .iter()
                .any(|item| item.name == "Read" && item.count == 1),
            "top_tools={:?}",
            insights.top_tools
        );
        assert!(
            insights
                .top_tools
                .iter()
                .all(|item| item.name != "Wait"),
            "wait tools must be excluded; top_tools={:?}",
            insights.top_tools
        );
        assert_eq!(
            insights.top_skills.first().map(|item| item.name.as_str()),
            Some("review")
        );
        assert_eq!(
            insights.top_mcp.first().map(|item| item.name.as_str()),
            Some("devtools")
        );
    }

    #[tokio::test]
    async fn global_insights_performance_baseline_is_interactive() {
        let repository = SqliteRepository::in_memory().await.expect("database");
        let now = Utc::now();

        // Seed enough rows for a local interactive baseline without making CI too heavy.
        for index in 0..2_000 {
            let stamp = now - chrono::Duration::minutes(i64::from(index % 1_440));
            let source = match index % 4 {
                0 => SessionSource::Codex,
                1 => SessionSource::Claude,
                2 => SessionSource::Gemini,
                _ => SessionSource::Cursor,
            };
            let events = (0..5)
                .map(|event_index| {
                    tool_event(
                        stamp,
                        if event_index % 2 == 0 { "Bash" } else { "Read" },
                        if event_index % 3 == 0 { "wait" } else { "command" },
                        Some("skill"),
                        Some("mcp"),
                    )
                })
                .collect();
            repository
                .import_session(session(
                    source,
                    &format!("perf-{index}"),
                    Some(&format!("/tmp/project-{}", index % 20)),
                    stamp,
                    stamp,
                    events,
                    Some(100),
                ))
                .await
                .expect("seed");
        }

        let started = std::time::Instant::now();
        let insights = repository
            .global_insights(sample_query(
                now - chrono::Duration::days(2),
                now,
                TimeBucket::Day,
            ))
            .await
            .expect("insights");
        let elapsed = started.elapsed();

        assert!(insights.totals.sessions > 0);
        assert!(
            elapsed.as_millis() < 1_500,
            "global_insights should stay interactive; took {elapsed:?}"
        );
    }

    #[tokio::test]
    async fn preserves_favorite_across_reimport() {
        let repository = SqliteRepository::in_memory().await.expect("database");
        let timestamp = Utc::now();
        let make = |summary: &str| ImportedSession {
            source: SessionSource::Codex,
            external_id: "fav-session".into(),
            name: "Favorite session".into(),
            workspace: Some("/repo".into()),
            usage: SessionUsage::default(),
            source_path: "/tmp/fav.jsonl".into(),
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
            .expect("import")
            .session_id;
        repository
            .set_session_favorite(id, true)
            .await
            .expect("favorite");
        repository
            .import_session(make("updated"))
            .await
            .expect("reimport");
        let favorites = repository
            .list_sessions(10, 0, None, true)
            .await
            .expect("favorites");
        assert_eq!(favorites.len(), 1);
        assert!(favorites[0].is_favorite);
        assert_eq!(
            repository.list_events(id, 0, 10).await.expect("events")[0].summary,
            "updated"
        );
    }

    #[tokio::test]
    async fn search_finds_session_name_and_message() {
        let repository = SqliteRepository::in_memory().await.expect("database");
        let stamp = Utc::now();
        repository
            .import_session(session(
                SessionSource::Claude,
                "search-unique-alpha",
                Some("/tmp/search-ws"),
                stamp,
                stamp,
                vec![ImportedEvent {
                    timestamp: stamp,
                    source: EventSource::User,
                    kind: EventKind::Message,
                    level: EventLevel::Info,
                    summary: "please run cargo test now".into(),
                    payload: json!({}),
                }],
                None,
            ))
            .await
            .expect("import");

        let by_name = repository
            .search(
                SearchQuery::new(
                    "unique-alpha",
                    None,
                    None,
                    SearchScope::Sessions,
                    20,
                    0,
                )
                .expect("query"),
            )
            .await
            .expect("search name");
        assert!(!by_name.hits.is_empty());
        assert_eq!(by_name.hits[0].match_field, SearchMatchField::SessionName);

        let by_message = repository
            .search(
                SearchQuery::new(
                    "cargo test",
                    None,
                    None,
                    SearchScope::Messages,
                    20,
                    0,
                )
                .expect("query"),
            )
            .await
            .expect("search message");
        assert!(!by_message.hits.is_empty());
        assert!(by_message.hits[0].event_id.is_some());
        assert_eq!(by_message.hits[0].match_field, SearchMatchField::Summary);
    }
}
