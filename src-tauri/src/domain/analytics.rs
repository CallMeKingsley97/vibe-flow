use chrono::{DateTime, Utc};

use super::session::SessionSource;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TimeBucket {
    Day,
    Week,
}

impl TimeBucket {
    #[must_use]
    pub fn sqlite_format(self) -> &'static str {
        match self {
            Self::Day => "%Y-%m-%d",
            Self::Week => "%Y-W%W",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AnalyticsQuery {
    pub source: Option<SessionSource>,
    pub workspace: Option<String>,
    pub from: DateTime<Utc>,
    pub to: DateTime<Utc>,
    pub bucket: TimeBucket,
    pub project_limit: u32,
    pub ranking_limit: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct TotalMetrics {
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

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SourceInsight {
    pub source: SessionSource,
    pub sessions: u64,
    pub events: u64,
    pub tool_calls: u64,
    pub commands: u64,
    pub errors: u64,
    pub total_tokens: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProjectInsight {
    pub workspace: String,
    pub sessions: u64,
    pub events: u64,
    pub errors: u64,
    pub total_tokens: u64,
    pub last_active_at: DateTime<Utc>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TimeBucketPoint {
    pub bucket: String,
    pub sessions: u64,
    pub events: u64,
    pub errors: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RankedItem {
    pub name: String,
    pub count: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GlobalInsights {
    pub from: DateTime<Utc>,
    pub to: DateTime<Utc>,
    pub totals: TotalMetrics,
    pub by_source: Vec<SourceInsight>,
    pub by_project: Vec<ProjectInsight>,
    pub timeline: Vec<TimeBucketPoint>,
    pub top_tools: Vec<RankedItem>,
    pub top_skills: Vec<RankedItem>,
    pub top_mcp: Vec<RankedItem>,
}
