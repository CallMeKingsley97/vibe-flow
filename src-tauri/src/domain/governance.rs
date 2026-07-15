use chrono::{DateTime, Utc};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AgentDataSettings {
    pub retention_days: u32,
    pub auto_cleanup: bool,
    pub updated_at: DateTime<Utc>,
}

impl AgentDataSettings {
    pub fn validate(&self) -> Result<(), crate::domain::error::AppError> {
        if !(1..=3650).contains(&self.retention_days) {
            return Err(crate::domain::error::AppError::Validation(
                "保留周期必须在 1 到 3650 天之间".into(),
            ));
        }
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StorageStats {
    pub database_bytes: u64,
    pub session_count: u64,
    pub event_count: u64,
    pub oldest_session_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CleanupPreview {
    pub cutoff: DateTime<Utc>,
    pub session_count: u64,
    pub event_count: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CleanupResult {
    pub deleted_sessions: u64,
    pub reclaimed_database_bytes: u64,
}
