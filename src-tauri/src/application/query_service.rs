use std::sync::Arc;

use uuid::Uuid;

use crate::domain::{
    error::AppError,
    event::AgentEvent,
    search::{SearchQuery, SearchResult},
    session::{CaptureSession, SessionSource},
};

use super::ports::CaptureRepository;

pub struct QueryService {
    repository: Arc<dyn CaptureRepository>,
}

impl QueryService {
    pub fn new(repository: Arc<dyn CaptureRepository>) -> Self {
        Self { repository }
    }

    pub async fn list_sessions(
        &self,
        limit: u32,
        offset: u32,
        source: Option<SessionSource>,
        favorite_only: bool,
    ) -> Result<Vec<CaptureSession>, AppError> {
        self.repository
            .list_sessions(limit.clamp(1, 2_000), offset, source, favorite_only)
            .await
    }

    pub async fn list_events(
        &self,
        session_id: Uuid,
        after_sequence: u64,
        limit: u32,
    ) -> Result<Vec<AgentEvent>, AppError> {
        self.repository
            .list_events(session_id, after_sequence, limit.clamp(1, 1_000))
            .await
    }

    pub async fn set_session_favorite(
        &self,
        session_id: Uuid,
        favorite: bool,
    ) -> Result<CaptureSession, AppError> {
        self.repository
            .set_session_favorite(session_id, favorite)
            .await
    }

    pub async fn search(&self, query: SearchQuery) -> Result<SearchResult, AppError> {
        self.repository.search(query).await
    }

    pub async fn ping(&self) -> Result<(), AppError> {
        self.repository.ping().await
    }
}
