use std::sync::RwLock;

use tauri::ipc::Channel;
use uuid::Uuid;

use crate::{application::ports::HistoryPublisher, domain::session::SessionSource};

use super::dto::HistoryChangeDto;

#[derive(Default)]
pub struct HistoryChannelPublisher {
    subscribers: RwLock<Vec<Channel<HistoryChangeDto>>>,
}

impl HistoryChannelPublisher {
    pub fn subscribe(&self, channel: Channel<HistoryChangeDto>) {
        self.subscribers
            .write()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .push(channel);
    }
}

impl HistoryPublisher for HistoryChannelPublisher {
    fn publish_imported(&self, source: SessionSource, session_id: Uuid) {
        let change = HistoryChangeDto {
            source: source.to_string(),
            session_id: session_id.to_string(),
        };
        self.subscribers
            .write()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .retain(|channel| channel.send(change.clone()).is_ok());
    }
}
