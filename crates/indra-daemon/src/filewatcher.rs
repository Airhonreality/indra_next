use anyhow::Result;
use notify::{watcher, DebouncedEvent, RecursiveMode, Watcher};
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::mpsc;
use uuid::Uuid;

#[derive(Clone, Debug)]
pub struct FileChange {
    pub event_id: String,
    pub change_type: ChangeType,
    pub path: PathBuf,
    pub timestamp_ms: i64,
}

#[derive(Clone, Debug, PartialEq)]
pub enum ChangeType {
    Created,
    Modified,
    Deleted,
    Renamed { from: PathBuf, to: PathBuf },
}

pub struct FileWatcher {
    watch_root: PathBuf,
    tx: mpsc::Sender<FileChange>,
}

impl FileWatcher {
    pub fn new(watch_root: PathBuf) -> (Self, mpsc::Receiver<FileChange>) {
        let (tx, rx) = mpsc::channel(1000);

        let watcher = FileWatcher { watch_root, tx };
        (watcher, rx)
    }

    pub async fn start(&self) -> Result<()> {
        let watch_root = self.watch_root.clone();
        let tx = self.tx.clone();

        tokio::task::spawn_blocking(move || {
            let (tx_notify, rx_notify) = std::sync::mpsc::channel();

            let mut watcher =
                watcher(tx_notify, Duration::from_millis(500)).expect("Failed to create watcher");

            watcher
                .watch(&watch_root, RecursiveMode::Recursive)
                .expect("Failed to watch directory");

            let rt = tokio::runtime::Handle::current();

            while let Ok(event) = rx_notify.recv() {
                let change = match event {
                    DebouncedEvent::Create(path) => {
                        tracing::debug!(?path, "File created");
                        FileChange {
                            event_id: Uuid::new_v4().to_string(),
                            change_type: ChangeType::Created,
                            path,
                            timestamp_ms: chrono::Local::now().timestamp_millis(),
                        }
                    }
                    DebouncedEvent::Write(path) => {
                        tracing::debug!(?path, "File modified");
                        FileChange {
                            event_id: Uuid::new_v4().to_string(),
                            change_type: ChangeType::Modified,
                            path,
                            timestamp_ms: chrono::Local::now().timestamp_millis(),
                        }
                    }
                    DebouncedEvent::Remove(path) => {
                        tracing::debug!(?path, "File deleted");
                        FileChange {
                            event_id: Uuid::new_v4().to_string(),
                            change_type: ChangeType::Deleted,
                            path,
                            timestamp_ms: chrono::Local::now().timestamp_millis(),
                        }
                    }
                    DebouncedEvent::Rename(from, to) => {
                        tracing::debug!(?from, ?to, "File renamed");
                        FileChange {
                            event_id: Uuid::new_v4().to_string(),
                            change_type: ChangeType::Renamed { from, to },
                            path: PathBuf::new(),
                            timestamp_ms: chrono::Local::now().timestamp_millis(),
                        }
                    }
                    _ => continue,
                };

                rt.block_on(async {
                    if let Err(e) = tx.send(change).await {
                        tracing::error!("Failed to send file change: {}", e);
                    }
                });
            }
        });

        Ok(())
    }

    pub async fn emit_change(&self, change: FileChange) -> Result<()> {
        self.tx.send(change).await?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_change_type_created() {
        let change = FileChange {
            event_id: "test-1".to_string(),
            change_type: ChangeType::Created,
            path: PathBuf::from("/test/file.txt"),
            timestamp_ms: 1625000000000,
        };

        assert_eq!(change.change_type, ChangeType::Created);
    }
}
