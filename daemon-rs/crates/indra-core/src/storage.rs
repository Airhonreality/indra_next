//! Storage abstractions for Indra - OS-agnostic filesystem operations

use crate::Result;
use crate::types::{DirectoryEntry, FileHandle, FileMetadata, FsEvent};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::path::Path;
use tokio::sync::mpsc::Receiver;

/// OS-agnostic storage provider trait
#[async_trait]
pub trait StorageProvider: Send + Sync + Clone {
    /// Read file or byte range
    async fn read_file(&self, path: &Path, range: Option<(u64, u64)>) -> Result<Vec<u8>>;

    /// Write file (create or overwrite)
    async fn write_file(
        &self,
        path: &Path,
        content: &[u8],
        metadata: FileMetadata,
    ) -> Result<FileHandle>;

    /// Delete file or directory
    async fn delete(&self, path: &Path, recursive: bool) -> Result<()>;

    /// List directory contents
    async fn list_dir(&self, path: &Path) -> Result<Vec<DirectoryEntry>>;

    /// Get file/directory metadata
    async fn get_metadata(&self, path: &Path) -> Result<FileMetadata>;

    /// Watch directory for changes
    fn watch_dir(&self, path: &Path) -> Result<Receiver<FsEvent>>;

    /// Create directory
    async fn create_dir(&self, path: &Path) -> Result<()>;

    /// Check if path exists
    async fn exists(&self, path: &Path) -> Result<bool>;
}

/// Key-value storage backend (legacy)
pub trait StorageBackend: Send + Sync {
    /// Store a value
    fn store(&self, key: &str, value: &[u8]) -> Result<()>;

    /// Retrieve a value
    fn retrieve(&self, key: &str) -> Result<Option<Vec<u8>>>;

    /// Delete a value
    fn delete(&self, key: &str) -> Result<()>;

    /// List all keys
    fn list_keys(&self) -> Result<Vec<String>>;
}

/// Storage entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StorageEntry {
    /// Key
    pub key: String,
    /// Value
    pub value: Vec<u8>,
    /// Timestamp
    pub timestamp: u64,
}
