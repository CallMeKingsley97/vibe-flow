use chrono::Utc;
use serde::{Deserialize, Serialize};

use crate::domain::{
    analytics::{
        GlobalInsights, ProjectInsight, RankedItem, SourceInsight, TimeBucket, TimeBucketPoint,
        TotalMetrics,
    },
    error::AppError,
    event::AgentEvent,
    governance::{AgentDataSettings, CleanupPreview, CleanupResult, StorageStats},
    session::CaptureSession,
};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DataSettingsDto {
    pub retention_days: u32,
    pub auto_cleanup: bool,
    pub updated_at: String,
}

impl From<AgentDataSettings> for DataSettingsDto {
    fn from(value: AgentDataSettings) -> Self {
        Self {
            retention_days: value.retention_days,
            auto_cleanup: value.auto_cleanup,
            updated_at: value.updated_at.to_rfc3339(),
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateDataSettingsDto {
    pub retention_days: u32,
    pub auto_cleanup: bool,
}

impl From<UpdateDataSettingsDto> for AgentDataSettings {
    fn from(value: UpdateDataSettingsDto) -> Self {
        Self {
            retention_days: value.retention_days,
            auto_cleanup: value.auto_cleanup,
            updated_at: Utc::now(),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageStatsDto {
    pub database_bytes: u64,
    pub session_count: u64,
    pub event_count: u64,
    pub oldest_session_at: Option<String>,
}

impl From<StorageStats> for StorageStatsDto {
    fn from(value: StorageStats) -> Self {
        Self {
            database_bytes: value.database_bytes,
            session_count: value.session_count,
            event_count: value.event_count,
            oldest_session_at: value.oldest_session_at.map(|time| time.to_rfc3339()),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupPreviewDto {
    pub cutoff: String,
    pub session_count: u64,
    pub event_count: u64,
}

impl From<CleanupPreview> for CleanupPreviewDto {
    fn from(value: CleanupPreview) -> Self {
        Self {
            cutoff: value.cutoff.to_rfc3339(),
            session_count: value.session_count,
            event_count: value.event_count,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupResultDto {
    pub deleted_sessions: u64,
    pub reclaimed_database_bytes: u64,
}

impl From<CleanupResult> for CleanupResultDto {
    fn from(value: CleanupResult) -> Self {
        Self {
            deleted_sessions: value.deleted_sessions,
            reclaimed_database_bytes: value.reclaimed_database_bytes,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureSessionDto {
    pub id: String,
    pub name: String,
    pub status: String,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub last_sequence: u64,
    pub source: String,
    pub external_id: Option<String>,
    pub source_path: Option<String>,
    pub workspace: Option<String>,
    pub model: Option<String>,
    pub reasoning_effort: Option<String>,
    pub input_tokens: Option<u64>,
    pub cached_input_tokens: Option<u64>,
    pub output_tokens: Option<u64>,
    pub reasoning_output_tokens: Option<u64>,
    pub total_tokens: Option<u64>,
    pub updated_at: String,
}

impl From<CaptureSession> for CaptureSessionDto {
    fn from(value: CaptureSession) -> Self {
        Self {
            id: value.id.to_string(),
            name: value.name,
            status: value.status.to_string(),
            started_at: value.started_at.to_rfc3339(),
            ended_at: value.ended_at.map(|time| time.to_rfc3339()),
            last_sequence: value.last_sequence,
            source: value.source.to_string(),
            external_id: value.external_id,
            source_path: value.source_path,
            workspace: value.workspace,
            model: value.usage.model,
            reasoning_effort: value.usage.reasoning_effort,
            input_tokens: value.usage.input_tokens,
            cached_input_tokens: value.usage.cached_input_tokens,
            output_tokens: value.usage.output_tokens,
            reasoning_output_tokens: value.usage.reasoning_output_tokens,
            total_tokens: value.usage.total_tokens,
            updated_at: value.updated_at.to_rfc3339(),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentEventDto {
    pub id: String,
    pub session_id: String,
    pub sequence: u64,
    pub timestamp: String,
    pub source: String,
    pub kind: String,
    pub level: String,
    pub summary: String,
    pub payload: serde_json::Value,
}

impl From<AgentEvent> for AgentEventDto {
    fn from(value: AgentEvent) -> Self {
        Self {
            id: value.id.to_string(),
            session_id: value.session_id.to_string(),
            sequence: value.sequence,
            timestamp: value.timestamp.to_rfc3339(),
            source: value.source.to_string(),
            kind: value.kind.to_string(),
            level: value.level.to_string(),
            summary: value.summary,
            payload: value.payload,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthCheckDto {
    pub status: &'static str,
    pub version: &'static str,
    pub database: &'static str,
    pub recovered_database_path: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCheckDto {
    pub current_version: &'static str,
    pub available: bool,
    pub version: Option<String>,
    pub body: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceScanStatusDto {
    pub source: String,
    pub detected: bool,
    pub session_count: usize,
    pub last_scan_at: Option<String>,
    pub error: Option<String>,
}

impl From<crate::domain::history::SourceScanStatus> for SourceScanStatusDto {
    fn from(value: crate::domain::history::SourceScanStatus) -> Self {
        Self {
            source: value.source.to_string(),
            detected: value.detected,
            session_count: value.session_count,
            last_scan_at: value.last_scan_at.map(|time| time.to_rfc3339()),
            error: value.error,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryChangeDto {
    pub source: String,
    pub session_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiErrorDto {
    pub code: &'static str,
    pub message: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GlobalInsightsQueryDto {
    pub source: Option<String>,
    pub workspace: Option<String>,
    pub from: Option<String>,
    pub to: Option<String>,
    pub bucket: Option<String>,
    pub project_limit: Option<u32>,
    pub ranking_limit: Option<u32>,
}

impl GlobalInsightsQueryDto {
    pub fn parse_bucket(&self) -> Result<TimeBucket, AppError> {
        match self.bucket.as_deref().unwrap_or("day") {
            "day" => Ok(TimeBucket::Day),
            "week" => Ok(TimeBucket::Week),
            other => Err(AppError::Validation(format!(
                "unknown time bucket: {other}"
            ))),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TotalMetricsDto {
    pub sessions: u64,
    pub events: u64,
    pub user_messages: u64,
    pub agent_messages: u64,
    pub tool_calls: u64,
    pub commands: u64,
    pub file_changes: u64,
    pub errors: u64,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub total_tokens: u64,
}

impl From<TotalMetrics> for TotalMetricsDto {
    fn from(value: TotalMetrics) -> Self {
        Self {
            sessions: value.sessions,
            events: value.events,
            user_messages: value.user_messages,
            agent_messages: value.agent_messages,
            tool_calls: value.tool_calls,
            commands: value.commands,
            file_changes: value.file_changes,
            errors: value.errors,
            input_tokens: value.input_tokens,
            output_tokens: value.output_tokens,
            total_tokens: value.total_tokens,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceInsightDto {
    pub source: String,
    pub sessions: u64,
    pub events: u64,
    pub tool_calls: u64,
    pub commands: u64,
    pub errors: u64,
    pub total_tokens: u64,
}

impl From<SourceInsight> for SourceInsightDto {
    fn from(value: SourceInsight) -> Self {
        Self {
            source: value.source.to_string(),
            sessions: value.sessions,
            events: value.events,
            tool_calls: value.tool_calls,
            commands: value.commands,
            errors: value.errors,
            total_tokens: value.total_tokens,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectInsightDto {
    pub workspace: String,
    pub sessions: u64,
    pub events: u64,
    pub errors: u64,
    pub total_tokens: u64,
    pub last_active_at: String,
}

impl From<ProjectInsight> for ProjectInsightDto {
    fn from(value: ProjectInsight) -> Self {
        Self {
            workspace: value.workspace,
            sessions: value.sessions,
            events: value.events,
            errors: value.errors,
            total_tokens: value.total_tokens,
            last_active_at: value.last_active_at.to_rfc3339(),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimeBucketPointDto {
    pub bucket: String,
    pub sessions: u64,
    pub events: u64,
    pub errors: u64,
}

impl From<TimeBucketPoint> for TimeBucketPointDto {
    fn from(value: TimeBucketPoint) -> Self {
        Self {
            bucket: value.bucket,
            sessions: value.sessions,
            events: value.events,
            errors: value.errors,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RankedItemDto {
    pub name: String,
    pub count: u64,
}

impl From<RankedItem> for RankedItemDto {
    fn from(value: RankedItem) -> Self {
        Self {
            name: value.name,
            count: value.count,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GlobalInsightsDto {
    pub from: String,
    pub to: String,
    pub totals: TotalMetricsDto,
    pub by_source: Vec<SourceInsightDto>,
    pub by_project: Vec<ProjectInsightDto>,
    pub timeline: Vec<TimeBucketPointDto>,
    pub top_tools: Vec<RankedItemDto>,
    pub top_skills: Vec<RankedItemDto>,
    pub top_mcp: Vec<RankedItemDto>,
}

impl From<GlobalInsights> for GlobalInsightsDto {
    fn from(value: GlobalInsights) -> Self {
        Self {
            from: value.from.to_rfc3339(),
            to: value.to.to_rfc3339(),
            totals: value.totals.into(),
            by_source: value.by_source.into_iter().map(Into::into).collect(),
            by_project: value.by_project.into_iter().map(Into::into).collect(),
            timeline: value.timeline.into_iter().map(Into::into).collect(),
            top_tools: value.top_tools.into_iter().map(Into::into).collect(),
            top_skills: value.top_skills.into_iter().map(Into::into).collect(),
            top_mcp: value.top_mcp.into_iter().map(Into::into).collect(),
        }
    }
}

impl From<AppError> for ApiErrorDto {
    fn from(value: AppError) -> Self {
        let code = match value {
            AppError::Validation(_) => "validation_error",
            AppError::Storage(_) => "storage_error",
            AppError::Internal(_) => "internal_error",
        };
        Self {
            code,
            message: value.to_string(),
        }
    }
}
