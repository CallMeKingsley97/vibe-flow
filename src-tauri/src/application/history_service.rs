use std::{
    collections::HashSet,
    path::{Path, PathBuf},
    sync::{Arc, RwLock},
};

use chrono::Utc;

use crate::{
    domain::{error::AppError, history::SourceScanStatus},
    infrastructure::history::{adapter::AgentHistoryAdapter, adapter_for_path},
};

use super::ports::{HistoryPublisher, HistoryRepository};

pub struct HistoryService {
    home: PathBuf,
    adapters: Vec<Arc<dyn AgentHistoryAdapter>>,
    repository: Arc<dyn HistoryRepository>,
    publisher: Arc<dyn HistoryPublisher>,
    statuses: RwLock<Vec<SourceScanStatus>>,
}

impl HistoryService {
    pub fn new(
        home: PathBuf,
        adapters: Vec<Arc<dyn AgentHistoryAdapter>>,
        repository: Arc<dyn HistoryRepository>,
        publisher: Arc<dyn HistoryPublisher>,
    ) -> Self {
        let statuses = adapters
            .iter()
            .map(|adapter| SourceScanStatus {
                source: adapter.source(),
                detected: false,
                session_count: 0,
                last_scan_at: None,
                error: None,
            })
            .collect();
        Self {
            home,
            adapters,
            repository,
            publisher,
            statuses: RwLock::new(statuses),
        }
    }

    pub fn watch_roots(&self) -> Vec<PathBuf> {
        self.adapters
            .iter()
            .flat_map(|adapter| adapter.watch_roots(&self.home))
            .collect()
    }

    pub fn is_relevant_watch_path(&self, path: &Path) -> bool {
        if path.is_dir() {
            return self
                .watch_roots()
                .into_iter()
                .any(|root| path.starts_with(&root) || root.starts_with(path));
        }
        adapter_for_path(&self.adapters, path).is_some()
    }

    pub fn statuses(&self) -> Vec<SourceScanStatus> {
        self.statuses
            .read()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .clone()
    }

    pub async fn scan_all(&self) -> Result<Vec<SourceScanStatus>, AppError> {
        let mut next_statuses = Vec::new();
        for adapter in &self.adapters {
            let adapter = adapter.clone();
            let home = self.home.clone();
            let source = adapter.source();
            let detected = adapter.roots(&home).iter().any(|root| root.exists());
            let parsed = tokio::task::spawn_blocking(move || {
                adapter
                    .discover(&home)
                    .into_iter()
                    .flat_map(|path| match adapter.parse_many(&path) {
                        Ok(sessions) => sessions.into_iter().map(Ok).collect::<Vec<_>>(),
                        Err(error) => vec![Err(error)],
                    })
                    .collect::<Vec<_>>()
            })
            .await
            .map_err(|error| AppError::Internal(error.to_string()))?;

            let mut session_count = 0;
            let mut first_error = None;
            let mut last_session_id = None;
            let mut seen_external_ids = HashSet::new();
            for result in parsed {
                match result {
                    Ok(session) if seen_external_ids.insert(session.external_id.clone()) => {
                        match self.repository.import_session(session).await {
                            Ok(outcome) => {
                                session_count += 1;
                                if outcome.changed {
                                    last_session_id = Some(outcome.session_id);
                                }
                            }
                            Err(error) => {
                                first_error.get_or_insert_with(|| error.to_string());
                            }
                        }
                    }
                    Ok(_) => {}
                    Err(error) => {
                        first_error.get_or_insert_with(|| error.to_string());
                    }
                }
            }
            if let Some(session_id) = last_session_id {
                self.publisher.publish_imported(source, session_id);
            }
            next_statuses.push(SourceScanStatus {
                source,
                detected,
                session_count,
                last_scan_at: Some(Utc::now()),
                error: first_error,
            });
        }
        self.statuses
            .write()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .clone_from(&next_statuses);
        Ok(next_statuses)
    }

    pub async fn sync_path(&self, path: &Path) -> Result<Option<uuid::Uuid>, AppError> {
        if path.is_dir() {
            let mut last_imported = None;
            for adapter in &self.adapters {
                let roots = adapter.watch_roots(&self.home);
                if !roots
                    .iter()
                    .any(|root| path.starts_with(root) || root.starts_with(path))
                {
                    continue;
                }
                let adapter = adapter.clone();
                let home = self.home.clone();
                let directory = path.to_path_buf();
                let source = adapter.source();
                let sessions = tokio::task::spawn_blocking(move || {
                    adapter
                        .discover(&home)
                        .into_iter()
                        .filter(|candidate| candidate.starts_with(&directory))
                        .flat_map(|candidate| match adapter.parse_many(&candidate) {
                            Ok(sessions) => sessions.into_iter().map(Ok).collect::<Vec<_>>(),
                            Err(error) => vec![Err(error)],
                        })
                        .collect::<Result<Vec<_>, _>>()
                })
                .await
                .map_err(|error| AppError::Internal(error.to_string()))??;
                let mut changed_id = None;
                for session in sessions {
                    let outcome = self.repository.import_session(session).await?;
                    last_imported = Some(outcome.session_id);
                    if outcome.changed {
                        changed_id = Some(outcome.session_id);
                    }
                }
                if let Some(session_id) = changed_id {
                    self.publisher.publish_imported(source, session_id);
                }
            }
            return Ok(last_imported);
        }
        if !path.is_file() {
            return Ok(None);
        }
        let Some(adapter) = adapter_for_path(&self.adapters, path).cloned() else {
            return Ok(None);
        };
        let source = adapter.source();
        let path = path.to_path_buf();
        let sessions = tokio::task::spawn_blocking(move || adapter.parse_many(&path))
            .await
            .map_err(|error| AppError::Internal(error.to_string()))??;
        let mut last_session_id = None;
        let mut changed_id = None;
        for session in sessions {
            let outcome = self.repository.import_session(session).await?;
            last_session_id = Some(outcome.session_id);
            if outcome.changed {
                changed_id = Some(outcome.session_id);
            }
        }
        if let Some(session_id) = changed_id {
            self.publisher.publish_imported(source, session_id);
        }
        Ok(last_session_id)
    }
}

#[cfg(test)]
mod tests {
    use std::{
        fs,
        sync::{Arc, Mutex},
    };

    use uuid::Uuid;

    use crate::{
        application::{ports::HistoryPublisher, query_service::QueryService},
        domain::{event::EventKind, session::SessionSource},
        infrastructure::{history::codex::CodexAdapter, persistence::sqlite::SqliteRepository},
    };

    use super::HistoryService;

    #[derive(Default)]
    struct RecordingPublisher {
        imported: Mutex<Vec<Uuid>>,
    }

    impl HistoryPublisher for RecordingPublisher {
        fn publish_imported(&self, _source: SessionSource, session_id: Uuid) {
            self.imported
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner)
                .push(session_id);
        }
    }

    #[tokio::test]
    async fn startup_scan_imports_and_queries_agent_history_end_to_end() {
        let home = std::env::temp_dir().join(format!("vibe-flow-e2e-{}", Uuid::new_v4()));
        let sessions_dir = home.join(".codex/sessions");
        fs::create_dir_all(&sessions_dir).expect("session directory");
        fs::write(
            sessions_dir.join("startup.jsonl"),
            concat!(
                "{\"type\":\"session_meta\",\"timestamp\":\"2026-07-15T00:00:00Z\",\"payload\":{\"id\":\"startup-e2e\",\"cwd\":\"/repo\"}}\n",
                "{\"type\":\"event_msg\",\"timestamp\":\"2026-07-15T00:00:01Z\",\"payload\":{\"type\":\"user_message\",\"message\":\"Build release\"}}\n",
                "{\"type\":\"response_item\",\"timestamp\":\"2026-07-15T00:00:02Z\",\"payload\":{\"type\":\"custom_tool_call\",\"name\":\"exec\",\"call_id\":\"call-1\",\"input\":\"{\\\"cmd\\\":\\\"cargo test\\\"}\"}}\n"
            ),
        )
        .expect("fixture");

        let repository = Arc::new(SqliteRepository::in_memory().await.expect("database"));
        let query = QueryService::new(repository.clone());
        let service = HistoryService::new(
            home.clone(),
            vec![Arc::new(CodexAdapter)],
            repository,
            Arc::new(RecordingPublisher::default()),
        );

        let statuses = service.scan_all().await.expect("scan");
        let sessions = query.list_sessions(10, 0, None).await.expect("sessions");
        let events = query
            .list_events(sessions[0].id, 0, 100)
            .await
            .expect("events");

        assert!(statuses[0].detected);
        assert_eq!(statuses[0].session_count, 1);
        assert_eq!(sessions[0].name, "Build release");
        assert!(events.iter().any(|event| event.kind == EventKind::ToolCall));
        assert!(events.iter().any(|event| {
            event
                .payload
                .get("commands")
                .and_then(serde_json::Value::as_array)
                .is_some_and(|commands| commands.iter().any(|value| value == "cargo test"))
        }));

        let _ = fs::remove_dir_all(home);
    }
}
