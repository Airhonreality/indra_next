//! Sync engine - main orchestrator for file synchronization
//!
//! Coordinates chunking, hashing, deduplication, and work queue processing.

use crate::cache::SyncDb;
use crate::fastcdc::FastCdcChunker;
use crate::state_machine::StateMachine;
use crate::storage::StorageProvider;
use crate::types::{Blake3Hash, SyncEntry, SyncState, SyncTask};
use crate::{blake3_hasher::Blake3Hasher, Error, Result};
use std::path::Path;
use std::sync::Arc;
use tokio::sync::mpsc;
use tracing::{debug, error, info};

/// Main sync engine orchestrator
pub struct SyncEngine<P: StorageProvider> {
    /// Storage provider (OS-agnostic)
    provider: P,
    /// Metadata database
    db: Arc<SyncDb>,
    /// FastCDC chunker
    chunker: FastCdcChunker,
    /// Priority queues
    critical_queue: mpsc::UnboundedSender<SyncTask>,
    medium_queue: mpsc::UnboundedSender<SyncTask>,
    low_queue: mpsc::UnboundedSender<SyncTask>,
    /// Task handle for background workers
    _task_handle: tokio::task::JoinHandle<()>,
}

impl<P: StorageProvider + 'static> SyncEngine<P> {
    /// Create new SyncEngine instance
    pub async fn new(provider: P, db_path: &Path) -> Result<Self> {
        let db = Arc::new(SyncDb::init(db_path).await?);

        let (tx_critical, mut rx_critical) = mpsc::unbounded_channel();
        let (tx_medium, mut rx_medium) = mpsc::unbounded_channel();
        let (tx_low, mut rx_low) = mpsc::unbounded_channel();

        let db_clone = db.clone();
        let provider_clone = provider.clone();
        let chunker = FastCdcChunker::new_standard();

        // Spawn background worker tasks
        let task_handle = tokio::spawn(async move {
            loop {
                tokio::select! {
                    Some(task) = rx_critical.recv() => {
                        if let Err(e) = Self::process_task(&provider_clone, &db_clone, task).await {
                            error!("Error processing critical task: {}", e);
                        }
                    }
                    Some(task) = rx_medium.recv() => {
                        if let Err(e) = Self::process_task(&provider_clone, &db_clone, task).await {
                            error!("Error processing medium task: {}", e);
                        }
                    }
                    Some(task) = rx_low.recv() => {
                        if let Err(e) = Self::process_task(&provider_clone, &db_clone, task).await {
                            error!("Error processing low task: {}", e);
                        }
                    }
                    else => {
                        // All receivers closed
                        break;
                    }
                }
            }
        });

        Ok(Self {
            provider,
            db,
            chunker,
            critical_queue: tx_critical,
            medium_queue: tx_medium,
            low_queue: tx_low,
            _task_handle: task_handle,
        })
    }

    /// Register file for synchronization
    pub async fn sync_file(&self, path: &Path) -> Result<()> {
        debug!("Registering file for sync: {:?}", path);

        // Get file metadata
        let metadata = self.provider.get_metadata(path).await?;

        // Create sync entry
        let mut entry = SyncEntry {
            path: path.to_path_buf(),
            state: SyncState::Pending,
            local_metadata: metadata,
            remote_metadata: None,
            chunks: None,
            chunk_hashes: None,
        };

        // Store in database
        self.db.upsert_file(&entry).await?;

        // Enqueue for processing
        entry.state = StateMachine::start_sync(entry.state)?;
        self.db.upsert_file(&entry).await?;

        self.critical_queue
            .send(SyncTask::FetchData {
                path: path.to_path_buf(),
                range: (0, entry.local_metadata.size),
            })
            .map_err(|e| Error::Other(e.to_string()))?;

        Ok(())
    }

    /// Process file: chunk, hash, store metadata
    pub async fn process_file(&self, path: &Path) -> Result<SyncEntry> {
        info!("Processing file: {:?}", path);

        // Read file
        let content = self.provider.read_file(path, None).await?;

        // Chunk with FastCDC
        let chunks = self.chunker.chunk(&content).await?;
        debug!("Chunked {:?} into {} chunks", path, chunks.len());

        // Extract hashes
        let chunk_hashes: Vec<Blake3Hash> = chunks.iter().map(|c| c.hash).collect();

        // Store chunks
        self.db.store_chunks(path, &chunks).await?;

        // Compute content hash
        let content_hash = Blake3Hasher::hash(&content);

        // Check for duplicates
        let duplicates = self.db.find_duplicates(content_hash).await?;
        if !duplicates.is_empty() {
            debug!("Found {} duplicates for {:?}", duplicates.len(), path);
        }

        // Store hash reference
        self.db
            .store_hash_reference(content_hash, path)
            .await?;

        // Get or create entry
        let mut entry = match self.db.get_file(path).await? {
            Some(e) => e,
            None => SyncEntry {
                path: path.to_path_buf(),
                state: SyncState::Pending,
                local_metadata: self.provider.get_metadata(path).await?,
                remote_metadata: None,
                chunks: None,
                chunk_hashes: None,
            },
        };

        entry.chunks = Some(chunks);
        entry.chunk_hashes = Some(chunk_hashes);
        entry.local_metadata.content_hash = Some(content_hash);

        self.db.upsert_file(&entry).await?;

        Ok(entry)
    }

    /// Start full sync cycle
    pub async fn start_sync_cycle(&self) -> Result<()> {
        info!("Starting sync cycle");

        // Get all pending files
        let pending = self.db.list_files(SyncState::Pending).await?;
        info!("Found {} pending files", pending.len());

        // Enqueue for processing
        for entry in pending {
            self.medium_queue
                .send(SyncTask::ProcessMetadata {
                    path: entry.path,
                })
                .map_err(|e| Error::Other(e.to_string()))?;
        }

        Ok(())
    }

    /// Get sync status for file
    pub async fn get_sync_status(&self, path: &Path) -> Result<SyncState> {
        match self.db.get_file(path).await? {
            Some(entry) => Ok(entry.state),
            None => Ok(SyncState::Pending),
        }
    }

    /// List all pending files
    pub async fn list_pending(&self) -> Result<Vec<SyncEntry>> {
        self.db.list_files(SyncState::Pending).await
    }

    /// Watch directory and sync changes (placeholder for future filesystem event watching)
    pub async fn watch_and_sync(&self, _root: &Path) -> Result<()> {
        info!("Watch and sync not yet implemented");
        Ok(())
    }

    /// Process a single sync task
    async fn process_task(
        provider: &P,
        db: &SyncDb,
        task: SyncTask,
    ) -> Result<()> {
        match task {
            SyncTask::FetchData { path, range } => {
                debug!("Fetching data: {:?} ({}-{})", path, range.0, range.1);
                // Data fetch would be handled by provider
                let _data = provider.read_file(&path, Some(range)).await?;
                Ok(())
            }
            SyncTask::ProcessMetadata { path } => {
                debug!("Processing metadata: {:?}", path);
                if let Some(mut entry) = db.get_file(&path).await? {
                    entry.state = StateMachine::complete_sync(entry.state)?;
                    db.upsert_file(&entry).await?;
                }
                Ok(())
            }
            SyncTask::BackgroundChunk { path } => {
                debug!("Background chunking: {:?}", path);
                let _metadata = provider.get_metadata(&path).await?;
                Ok(())
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::StorageProvider;
    use async_trait::async_trait;
    use std::collections::HashMap;
    use std::sync::Arc;
    use tokio::sync::Mutex;
    use tempfile::tempdir;

    /// Mock storage provider for testing
    #[derive(Clone)]
    struct MockStorageProvider {
        files: Arc<Mutex<HashMap<String, Vec<u8>>>>,
    }

    #[async_trait]
    impl StorageProvider for MockStorageProvider {
        async fn read_file(
            &self,
            path: &Path,
            _range: Option<(u64, u64)>,
        ) -> Result<Vec<u8>> {
            let files = self.files.lock().await;
            Ok(files
                .get(&path.to_string_lossy().to_string())
                .cloned()
                .unwrap_or_default())
        }

        async fn write_file(
            &self,
            path: &Path,
            content: &[u8],
            _metadata: crate::types::FileMetadata,
        ) -> Result<crate::types::FileHandle> {
            self.files
                .lock()
                .await
                .insert(path.to_string_lossy().to_string(), content.to_vec());

            let hash = Blake3Hasher::hash(content);
            Ok(crate::types::FileHandle {
                path: path.to_path_buf(),
                size: content.len() as u64,
                hash,
                written_at: std::time::SystemTime::now(),
            })
        }

        async fn delete(&self, path: &Path, _recursive: bool) -> Result<()> {
            self.files.lock().await.remove(&path.to_string_lossy().to_string());
            Ok(())
        }

        async fn list_dir(&self, _path: &Path) -> Result<Vec<crate::types::DirectoryEntry>> {
            Ok(vec![])
        }

        async fn get_metadata(&self, path: &Path) -> Result<crate::types::FileMetadata> {
            let files = self.files.lock().await;
            let size = files
                .get(&path.to_string_lossy().to_string())
                .map(|f| f.len() as u64)
                .unwrap_or(0);

            Ok(crate::types::FileMetadata {
                path: path.to_path_buf(),
                size,
                modified: std::time::SystemTime::now(),
                is_dir: false,
                permissions: 0o644,
                content_hash: None,
            })
        }

        fn watch_dir(
            &self,
            _path: &Path,
        ) -> Result<tokio::sync::mpsc::Receiver<crate::types::FsEvent>> {
            let (tx, rx) = tokio::sync::mpsc::channel(100);
            drop(tx);
            Ok(rx)
        }

        async fn create_dir(&self, _path: &Path) -> Result<()> {
            Ok(())
        }

        async fn exists(&self, path: &Path) -> Result<bool> {
            Ok(self
                .files
                .lock()
                .await
                .contains_key(&path.to_string_lossy().to_string()))
        }
    }

    #[tokio::test]
    async fn test_sync_engine_creation() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("test.db");

        let provider = MockStorageProvider {
            files: Arc::new(Mutex::new(HashMap::new())),
        };

        let engine = SyncEngine::new(provider, &db_path).await.unwrap();
        assert_ne!(std::mem::discriminant(&engine.db), std::mem::discriminant(&engine.db));
    }

    #[tokio::test]
    async fn test_process_file() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("test.db");

        let mut files = HashMap::new();
        files.insert("/test.txt".to_string(), b"test content".to_vec());

        let provider = MockStorageProvider {
            files: Arc::new(Mutex::new(files)),
        };

        let engine = SyncEngine::new(provider, &db_path).await.unwrap();
        let path = Path::new("/test.txt");

        let entry = engine.process_file(path).await.unwrap();
        assert!(entry.chunks.is_some());
        assert!(entry.chunk_hashes.is_some());
    }

    #[tokio::test]
    async fn test_sync_file() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("test.db");

        let mut files = HashMap::new();
        files.insert("/test.txt".to_string(), b"content".to_vec());

        let provider = MockStorageProvider {
            files: Arc::new(Mutex::new(files)),
        };

        let engine = SyncEngine::new(provider, &db_path).await.unwrap();
        let path = Path::new("/test.txt");

        engine.sync_file(path).await.unwrap();
        let status = engine.get_sync_status(path).await.unwrap();

        assert_eq!(status, SyncState::Syncing { progress: 0.0, started_at: engine.db.get_file(path).await.unwrap().unwrap().state.clone() });
    }
}
