use std::sync::Arc;

use crate::{
    application::{
        analytics_service::AnalyticsService, governance_service::GovernanceService,
        history_service::HistoryService, query_service::QueryService,
    },
    interfaces::channels::HistoryChannelPublisher,
};

pub struct AppState {
    pub query_service: Arc<QueryService>,
    pub history_service: Arc<HistoryService>,
    pub history_publisher: Arc<HistoryChannelPublisher>,
    pub governance_service: Arc<GovernanceService>,
    pub analytics_service: Arc<AnalyticsService>,
    pub recovered_database_path: Option<String>,
}
