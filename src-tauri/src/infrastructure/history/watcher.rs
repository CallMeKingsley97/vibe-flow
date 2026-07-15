use std::{collections::HashSet, path::PathBuf, sync::Arc, time::Duration};

use notify::{Config, PollWatcher, RecursiveMode, Watcher};
use tokio::sync::mpsc;

use crate::{application::history_service::HistoryService, domain::error::AppError};

pub struct HistoryWatcher {
    _watcher: PollWatcher,
}

impl HistoryWatcher {
    pub fn start(service: Arc<HistoryService>) -> Result<Self, AppError> {
        let (sender, mut receiver) = mpsc::unbounded_channel::<PathBuf>();
        let mut watcher = PollWatcher::new(
            move |result: notify::Result<notify::Event>| {
                if let Ok(event) = result {
                    for path in event.paths {
                        let _ = sender.send(path);
                    }
                }
            },
            Config::default().with_poll_interval(Duration::from_secs(2)),
        )
        .map_err(|error| AppError::Internal(error.to_string()))?;

        for root in service
            .watch_roots()
            .into_iter()
            .filter(|root| root.exists())
        {
            watcher
                .watch(&root, RecursiveMode::Recursive)
                .map_err(|error| AppError::Internal(error.to_string()))?;
        }

        let task = async move {
            while let Some(first_path) = receiver.recv().await {
                let mut paths = HashSet::from([first_path]);
                tokio::time::sleep(Duration::from_millis(350)).await;
                while let Ok(path) = receiver.try_recv() {
                    paths.insert(path);
                }
                for path in paths {
                    if let Err(error) = service.sync_path(&path).await {
                        tracing::warn!(%error, path = %path.display(), "history sync failed");
                    }
                }
            }
        };
        if let Ok(runtime) = tokio::runtime::Handle::try_current() {
            runtime.spawn(task);
        } else {
            tauri::async_runtime::spawn(task);
        }

        Ok(Self { _watcher: watcher })
    }
}

#[cfg(test)]
mod tests {
    use std::{
        fs,
        sync::{Arc, Mutex},
        time::Duration,
    };

    use tokio::time::{sleep, timeout};
    use uuid::Uuid;

    use crate::{
        application::{
            history_service::HistoryService, ports::HistoryPublisher, query_service::QueryService,
        },
        domain::session::SessionSource,
        infrastructure::{history::codex::CodexAdapter, persistence::sqlite::SqliteRepository},
    };

    use super::HistoryWatcher;

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
    async fn imports_a_new_session_file_from_the_watcher() {
        let home = std::env::temp_dir().join(format!("vibe-flow-watch-{}", Uuid::new_v4()));
        let sessions_dir = home.join(".codex/sessions");
        fs::create_dir_all(&sessions_dir).expect("watch directory should exist");
        let repository = Arc::new(
            SqliteRepository::in_memory()
                .await
                .expect("database should initialize"),
        );
        let query_service = QueryService::new(repository.clone());
        let service = Arc::new(HistoryService::new(
            home.clone(),
            vec![Arc::new(CodexAdapter)],
            repository,
            Arc::new(RecordingPublisher::default()),
        ));
        let _watcher = HistoryWatcher::start(service).expect("watcher should start");
        sleep(Duration::from_millis(100)).await;

        fs::write(
            sessions_dir.join("watch-test.jsonl"),
            concat!(
                "{\"type\":\"session_meta\",\"timestamp\":\"2026-07-15T00:00:00Z\",\"payload\":{\"id\":\"watched-session\",\"cwd\":\"/repo\"}}\n",
                "{\"type\":\"event_msg\",\"timestamp\":\"2026-07-15T00:00:01Z\",\"payload\":{\"type\":\"user_message\",\"message\":\"Watched prompt\"}}\n"
            ),
        )
        .expect("session fixture should write");

        timeout(Duration::from_secs(5), async {
            loop {
                let sessions = query_service
                    .list_sessions(10, 0)
                    .await
                    .expect("sessions should load");
                if sessions
                    .iter()
                    .any(|session| session.source == SessionSource::Codex)
                {
                    break;
                }
                sleep(Duration::from_millis(50)).await;
            }
        })
        .await
        .expect("watcher should import the new file");

        let _ = fs::remove_dir_all(home);
    }
}
