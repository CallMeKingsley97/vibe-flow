use std::{
    collections::{HashMap, HashSet},
    path::PathBuf,
    sync::{Arc, Mutex},
    time::Duration,
};

use notify::{Config, PollWatcher, RecursiveMode, Watcher};
use tokio::sync::mpsc;

use crate::{application::history_service::HistoryService, domain::error::AppError};

pub struct HistoryWatcher {
    _watcher: PollWatcher,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct FileFingerprint {
    modified_millis: u128,
    len: u64,
}

fn fingerprint(path: &std::path::Path) -> Option<FileFingerprint> {
    let metadata = std::fs::metadata(path).ok()?;
    if !metadata.is_file() {
        return None;
    }
    let modified_millis = metadata
        .modified()
        .ok()?
        .duration_since(std::time::UNIX_EPOCH)
        .ok()?
        .as_millis();
    Some(FileFingerprint {
        modified_millis,
        len: metadata.len(),
    })
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

        let fingerprints = Arc::new(Mutex::new(HashMap::<PathBuf, FileFingerprint>::new()));
        let task = async move {
            while let Some(first_path) = receiver.recv().await {
                let mut paths = HashSet::from([first_path]);
                tokio::time::sleep(Duration::from_millis(350)).await;
                while let Ok(path) = receiver.try_recv() {
                    paths.insert(path);
                }
                for path in paths {
                    // 跳过 sqlite 旁路与临时文件，避免无关键变更触发同步
                    if let Some(name) = path.file_name().and_then(|value| value.to_str()) {
                        let lower = name.to_ascii_lowercase();
                        let is_temp_ext = path
                            .extension()
                            .and_then(|ext| ext.to_str())
                            .is_some_and(|ext| {
                                ext.eq_ignore_ascii_case("tmp") || ext.eq_ignore_ascii_case("temp")
                            });
                        if lower.ends_with("-wal")
                            || lower.ends_with("-shm")
                            || lower.ends_with("-journal")
                            || is_temp_ext
                        {
                            continue;
                        }
                    }
                    if !service.is_relevant_watch_path(&path) {
                        continue;
                    }
                    if path.is_file() {
                        let Some(next) = fingerprint(&path) else {
                            continue;
                        };
                        let changed = {
                            let mut cache = fingerprints
                                .lock()
                                .unwrap_or_else(std::sync::PoisonError::into_inner);
                            match cache.get(&path) {
                                Some(previous) if *previous == next => false,
                                _ => {
                                    cache.insert(path.clone(), next);
                                    true
                                }
                            }
                        };
                        if !changed {
                            continue;
                        }
                    }
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

        let session_path = sessions_dir.join("watch-test.jsonl");
        fs::write(
            &session_path,
            concat!(
                "{\"type\":\"session_meta\",\"timestamp\":\"2026-07-15T00:00:00Z\",\"payload\":{\"id\":\"watched-session\",\"cwd\":\"/repo\"}}\n",
                "{\"type\":\"event_msg\",\"timestamp\":\"2026-07-15T00:00:01Z\",\"payload\":{\"type\":\"user_message\",\"message\":\"Watched prompt\"}}\n"
            ),
        )
        .expect("session fixture should write");

        timeout(Duration::from_secs(5), async {
            loop {
                let sessions = query_service
                    .list_sessions(10, 0, None)
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

        fs::write(
            &session_path,
            concat!(
                "{\"type\":\"session_meta\",\"timestamp\":\"2026-07-15T00:00:00Z\",\"payload\":{\"id\":\"watched-session\",\"cwd\":\"/repo\"}}\n",
                "{\"type\":\"turn_context\",\"timestamp\":\"2026-07-15T00:00:00Z\",\"payload\":{\"model\":\"gpt-5\",\"effort\":\"high\"}}\n",
                "{\"type\":\"event_msg\",\"timestamp\":\"2026-07-15T00:00:01Z\",\"payload\":{\"type\":\"user_message\",\"message\":\"Watched prompt\"}}\n",
                "{\"type\":\"event_msg\",\"timestamp\":\"2026-07-15T00:00:02Z\",\"payload\":{\"type\":\"token_count\",\"info\":{\"total_token_usage\":{\"input_tokens\":900,\"cached_input_tokens\":400,\"output_tokens\":100,\"reasoning_output_tokens\":50,\"total_tokens\":1000}}}}\n"
            ),
        )
        .expect("updated session fixture should write");

        timeout(Duration::from_secs(5), async {
            loop {
                let sessions = query_service
                    .list_sessions(10, 0, None)
                    .await
                    .expect("sessions should refresh");
                if sessions.iter().any(|session| {
                    session.usage.model.as_deref() == Some("gpt-5")
                        && session.usage.total_tokens == Some(1_000)
                }) {
                    break;
                }
                sleep(Duration::from_millis(50)).await;
            }
        })
        .await
        .expect("watcher should refresh model and token usage");

        let _ = fs::remove_dir_all(home);
    }
}
