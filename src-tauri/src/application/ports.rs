use async_trait::async_trait;
use chrono::{DateTime, Utc};
use uuid::Uuid;

use crate::domain::{
    error::AppError,
    event::AgentEvent,
    governance::{AgentDataSettings, CleanupPreview, CleanupResult, StorageStats},
    history::ImportedSession,
    session::CaptureSession,
};

#[async_trait]
pub trait CaptureRepository: Send + Sync {
    async fn list_sessions(&self, limit: u32, offset: u32)
    -> Result<Vec<CaptureSession>, AppError>;
    async fn list_events(
        &self,
        session_id: Uuid,
        after_sequence: u64,
        limit: u32,
    ) -> Result<Vec<AgentEvent>, AppError>;
    async fn ping(&self) -> Result<(), AppError>;
}

pub trait HistoryPublisher: Send + Sync {
    fn publish_imported(&self, source: crate::domain::session::SessionSource, session_id: Uuid);
}

#[derive(Debug, Clone, Copy)]
pub struct ImportOutcome {
    pub session_id: Uuid,
    pub changed: bool,
}

#[async_trait]
pub trait HistoryRepository: Send + Sync {
    async fn import_session(&self, session: ImportedSession) -> Result<ImportOutcome, AppError>;
}

#[async_trait]
pub trait GovernanceRepository: Send + Sync {
    async fn get_data_settings(&self) -> Result<AgentDataSettings, AppError>;
    async fn update_data_settings(
        &self,
        settings: AgentDataSettings,
    ) -> Result<AgentDataSettings, AppError>;
    async fn storage_stats(&self) -> Result<StorageStats, AppError>;
    async fn cleanup_preview(&self, cutoff: DateTime<Utc>) -> Result<CleanupPreview, AppError>;
    async fn cleanup_before(&self, cutoff: DateTime<Utc>) -> Result<CleanupResult, AppError>;
}