//! Local filesystem provider implementation using tokio::fs

use async_trait::async_trait;
use indra_core::storage::StorageProvider;
use indra_core::types::{DirectoryEntry, FileHandle, FileMetadata, FsEvent};
use indra_core::Result;
use notify::{RecommendedWatcher, Watcher, RecursiveMode};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tokio::sync::mpsc::{channel, Receiver};
use tracing::{debug, warn};

/// Local filesystem provider using tokio::fs and notify
#[derive(Clone)]
pub struct LocalFsProvider {
    base_path: PathBuf,
}

impl LocalFsProvider {
    /// Create a new local filesystem provider
    pub fn new(base_path: PathBuf) -> Self {
        Self { base_path }
    }

    /// Get the absolute path
    fn resolve_path(&self, path: &Path) -> PathBuf {
        if path.is_absolute() {
            path.to_path_buf()
        } else {
            self.base_path.join(path)
        }
    }
}

#[async_trait]
impl StorageProvider for LocalFsProvider {
    async fn read_file(&self, path: &Path, range: Option<(u64, u64)>) -> Result<Vec<u8>> {
        let resolved = self.resolve_path(path);
        debug!("Reading file: {:?}", resolved);

        let content = tokio::fs::read(&resolved).await?;

        match range {
            Some((start, end)) => {
                let start = start as usize;
                let end = (end as usize).min(content.len());
                Ok(content[start..end].to_vec())
            }
            None => Ok(content),
        }
    }

    async fn write_file(
        &self,
        path: &Path,
        content: &[u8],
        _metadata: FileMetadata,
    ) -> Result<FileHandle> {
        let resolved = self.resolve_path(path);
        debug!("Writing file: {:?}", resolved);

        // Ensure parent directory exists
        if let Some(parent) = resolved.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }

        tokio::fs::write(&resolved, content).await?;

        // Get the written metadata
        let metadata = self.get_metadata(path).await?;

        Ok(FileHandle {
            path: path.to_path_buf(),
            size: content.len() as u64,
            hash: metadata.content_hash.unwrap_or_default(),
            written_at: std::time::SystemTime::now(),
        })
    }

    async fn delete(&self, path: &Path, recursive: bool) -> Result<()> {
        let resolved = self.resolve_path(path);
        debug!("Deleting: {:?} (recursive: {})", resolved, recursive);

        let metadata = tokio::fs::metadata(&resolved).await?;

        if metadata.is_dir() {
            if recursive {
                tokio::fs::remove_dir_all(&resolved).await?;
            } else {
                tokio::fs::remove_dir(&resolved).await?;
            }
        } else {
            tokio::fs::remove_file(&resolved).await?;
        }

        Ok(())
    }

    async fn list_dir(&self, path: &Path) -> Result<Vec<DirectoryEntry>> {
        let resolved = self.resolve_path(path);
        debug!("Listing directory: {:?}", resolved);

        let mut entries = Vec::new();
        let mut dir = tokio::fs::read_dir(&resolved).await?;

        while let Some(entry) = dir.next_entry().await? {
            let path = entry.path();
            let metadata = self.get_metadata(&path).await?;
            entries.push(DirectoryEntry { path, metadata });
        }

        Ok(entries)
    }

    async fn get_metadata(&self, path: &Path) -> Result<FileMetadata> {
        let resolved = self.resolve_path(path);
        let fs_metadata = tokio::fs::metadata(&resolved).await?;

        Ok(FileMetadata {
            path: path.to_path_buf(),
            size: fs_metadata.len(),
            modified: fs_metadata.modified()?,
            is_dir: fs_metadata.is_dir(),
            permissions: {
                #[cfg(target_os = "windows")]
                {
                    fs_metadata.permissions().readonly() as u32
                }
                #[cfg(not(target_os = "windows"))]
                {
                    use std::os::unix::fs::PermissionsExt;
                    fs_metadata.permissions().mode()
                }
            },
            content_hash: None,
        })
    }

    fn watch_dir(&self, path: &Path) -> Result<Receiver<FsEvent>> {
        let resolved = self.resolve_path(path);
        let (tx, rx) = channel::<FsEvent>(100);

        let watch_path = resolved.clone();
        let tx = Arc::new(Mutex::new(tx));

        // Spawn a background task to watch the directory
        tokio::spawn(async move {
            match setup_watcher(watch_path.clone(), tx.clone()) {
                Ok(_watcher) => {
                    // Keep the watcher alive by sleeping indefinitely
                    // The watcher is held in _watcher scope and will be dropped when this task ends
                    loop {
                        tokio::time::sleep(tokio::time::Duration::from_secs(3600)).await;
                    }
                }
                Err(e) => {
                    warn!("Failed to setup file watcher: {}", e);
                }
            }
        });

        Ok(rx)
    }

    async fn create_dir(&self, path: &Path) -> Result<()> {
        let resolved = self.resolve_path(path);
        debug!("Creating directory: {:?}", resolved);
        tokio::fs::create_dir_all(&resolved).await?;
        Ok(())
    }

    async fn exists(&self, path: &Path) -> Result<bool> {
        let resolved = self.resolve_path(path);
        Ok(resolved.exists())
    }
}

/// Setup a file watcher for a directory
fn setup_watcher(
    path: PathBuf,
    tx: Arc<Mutex<tokio::sync::mpsc::Sender<FsEvent>>>,
) -> std::result::Result<RecommendedWatcher, notify::Error> {
    let path_clone = path.clone();

    let mut watcher = notify::recommended_watcher(
        move |result: std::result::Result<notify::Event, notify::Error>| {
            match result {
                Ok(event) => {
                    use notify::EventKind;

                    for event_path in &event.paths {
                        let fs_event = match event.kind {
                            EventKind::Create(_) => FsEvent::Created(event_path.clone()),
                            EventKind::Modify(_) => FsEvent::Modified(event_path.clone()),
                            EventKind::Remove(_) => FsEvent::Deleted(event_path.clone()),
                            EventKind::Access(_) => continue,
                            EventKind::Any => continue,
                            _ => continue,
                        };

                        if let Ok(sender) = tx.lock() {
                            let _ = sender.try_send(fs_event);
                        }
                    }
                }
                Err(e) => {
                    warn!("Watcher error: {}", e);
                }
            }
        },
    )?;

    watcher.watch(&path_clone, RecursiveMode::Recursive)?;

    Ok(watcher)
}
