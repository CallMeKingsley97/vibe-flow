use std::sync::Arc;

use chrono::{DateTime, Duration, Utc};

use crate::domain::{
    analytics::{AnalyticsQuery, GlobalInsights, TimeBucket},
    error::AppError,
    session::SessionSource,
};

use super::ports::AnalyticsRepository;

pub struct AnalyticsService {
    repository: Arc<dyn AnalyticsRepository>,
}

#[derive(Debug, Clone)]
pub struct AnalyticsRequest {
    pub source: Option<SessionSource>,
    pub workspace: Option<String>,
    pub from: Option<DateTime<Utc>>,
    pub to: Option<DateTime<Utc>>,
    pub bucket: TimeBucket,
    pub project_limit: Option<u32>,
    pub ranking_limit: Option<u32>,
}

impl AnalyticsService {
    pub fn new(repository: Arc<dyn AnalyticsRepository>) -> Self {
        Self { repository }
    }

    pub async fn global_insights(
        &self,
        request: AnalyticsRequest,
    ) -> Result<GlobalInsights, AppError> {
        let to = request.to.unwrap_or_else(Utc::now);
        let from = request.from.unwrap_or_else(|| to - Duration::days(30));
        if from > to {
            return Err(AppError::Validation("时间范围起点晚于终点".into()));
        }
        let query = AnalyticsQuery {
            source: request.source,
            workspace: request.workspace.and_then(|value| {
                let trimmed = value.trim();
                if trimmed.is_empty() {
                    None
                } else {
                    Some(trimmed.to_string())
                }
            }),
            from,
            to,
            bucket: request.bucket,
            project_limit: request.project_limit.unwrap_or(8).clamp(1, 50),
            ranking_limit: request.ranking_limit.unwrap_or(8).clamp(1, 50),
        };
        self.repository.global_insights(query).await
    }
}
