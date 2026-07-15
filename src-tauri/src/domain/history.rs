use std::path::PathBuf;

use chrono::{DateTime, Utc};
use serde_json::Value;

use super::{
    event::{EventKind, EventLevel, EventSource},
    session::{SessionSource, SessionUsage},
};

#[derive(Debug, Clone, PartialEq)]
pub struct ImportedEvent {
    pub timestamp: DateTime<Utc>,
    pub source: EventSource,
    pub kind: EventKind,
    pub level: EventLevel,
    pub summary: String,
    pub payload: Value,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ImportedSession {
    pub source: SessionSource,
    pub external_id: String,
    pub name: String,
    pub workspace: Option<String>,
    pub usage: SessionUsage,
    pub source_path: PathBuf,
    pub started_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub events: Vec<ImportedEvent>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SourceScanStatus {
    pub source: SessionSource,
    pub detected: bool,
    pub session_count: usize,
    pub last_scan_at: Option<DateTime<Utc>>,
    pub error: Option<String>,
}
