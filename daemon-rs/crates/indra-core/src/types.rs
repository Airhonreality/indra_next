//! Common types for Indra sync engine

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::time::SystemTime;

/// System information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemInfo {
    /// OS name
    pub os: String,
    /// Architecture
    pub arch: String,
    /// Hostname
    pub hostname: String,
}

/// Daemon configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DaemonConfig {
    /// Listen address
    pub listen_addr: String,
    /// Listen port
    pub listen_port: u16,
    /// Database path
    pub db_path: String,
    /// Enable TLS
    pub tls_enabled: bool,
}

impl Default for DaemonConfig {
    fn default() -> Self {
        Self {
            listen_addr: "127.0.0.1".to_string(),
            listen_port: 50051,
            db_path: "./data/indra.db".to_string(),
            tls_enabled: false,
        }
    }
}

/// BLAKE3 hash type (256 bits)
#[derive(Clone, Copy, PartialEq, Eq, Debug, Hash, Serialize, Deserialize)]
pub struct Blake3Hash([u8; 32]);

impl Blake3Hash {
    /// Create from array
    pub fn from_bytes(bytes: [u8; 32]) -> Self {
        Blake3Hash(bytes)
    }

    /// Get as slice
    pub fn as_bytes(&self) -> &[u8; 32] {
        &self.0
    }

    /// Convert to hex string
    pub fn to_hex(&self) -> String {
        blake3::Hash::from(self.0).to_hex().to_string()
    }
}

impl Default for Blake3Hash {
    fn default() -> Self {
        Blake3Hash([0u8; 32])
    }
}

/// File chunk from FastCDC
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Chunk {
    /// Offset in original file
    pub offset: u64,
    /// Size of chunk
    pub size: u64,
    /// BLAKE3 hash of chunk
    pub hash: Blake3Hash,
}

/// File metadata
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FileMetadata {
    /// File path
    pub path: PathBuf,
    /// File size in bytes
    pub size: u64,
    /// Last modified time
    pub modified: SystemTime,
    /// Whether this is a directory
    pub is_dir: bool,
    /// File permissions
    pub permissions: u32,
    /// Optional content hash
    pub content_hash: Option<Blake3Hash>,
}

/// Directory entry
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DirectoryEntry {
    /// Entry path
    pub path: PathBuf,
    /// Entry metadata
    pub metadata: FileMetadata,
}

/// Filesystem event
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum FsEvent {
    /// File created
    Created(PathBuf),
    /// File modified
    Modified(PathBuf),
    /// File deleted
    Deleted(PathBuf),
    /// File renamed
    Renamed {
        /// Original path
        from: PathBuf,
        /// New path
        to: PathBuf,
    },
}

/// File handle for completed write operations
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FileHandle {
    /// File path
    pub path: PathBuf,
    /// Size written
    pub size: u64,
    /// Content hash
    pub hash: Blake3Hash,
    /// Timestamp of write
    pub written_at: SystemTime,
}

/// Sync state of a file
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum SyncState {
    /// Local changes pending
    Pending,
    /// Currently syncing
    Syncing {
        /// Progress from 0.0 to 1.0
        progress: f32,
        /// When sync started
        started_at: SystemTime,
    },
    /// Successfully synced
    Synced {
        /// When sync completed
        synced_at: SystemTime,
    },
    /// Error during sync
    Error {
        /// Error description
        reason: String,
        /// Number of retry attempts
        retry_count: u32,
    },
}

/// Sync entry for database storage
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SyncEntry {
    /// File path
    pub path: PathBuf,
    /// Current sync state
    pub state: SyncState,
    /// Local file metadata
    pub local_metadata: FileMetadata,
    /// Remote metadata if available
    pub remote_metadata: Option<FileMetadata>,
    /// Chunks from FastCDC
    pub chunks: Option<Vec<Chunk>>,
    /// Hashes of chunks
    pub chunk_hashes: Option<Vec<Blake3Hash>>,
}

/// Task for sync engine work queues
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SyncTask {
    /// Critical priority: interactive kernel I/O
    FetchData {
        /// File path
        path: PathBuf,
        /// Byte range (start, end)
        range: (u64, u64),
    },
    /// Medium priority: metadata and thumbnails
    ProcessMetadata {
        /// File path
        path: PathBuf,
    },
    /// Low priority: background chunk processing
    BackgroundChunk {
        /// File path
        path: PathBuf,
    },
}

/// Version vector for conflict detection
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct VersionVector {
    /// Clock values by peer ID
    pub clocks: std::collections::HashMap<String, u64>,
}

impl VersionVector {
    /// Create new version vector
    pub fn new() -> Self {
        Self {
            clocks: std::collections::HashMap::new(),
        }
    }

    /// Increment clock for peer
    pub fn increment(&mut self, peer_id: &str) {
        *self.clocks.entry(peer_id.to_string()).or_insert(0) += 1;
    }

    /// Check if this dominates another
    pub fn dominates(&self, other: &VersionVector) -> bool {
        let mut at_least_one_greater = false;
        for (peer_id, clock) in &self.clocks {
            let other_clock = other.clocks.get(peer_id).copied().unwrap_or(0);
            if clock < &other_clock {
                return false;
            }
            if clock > &other_clock {
                at_least_one_greater = true;
            }
        }
        at_least_one_greater
    }

    /// Check for concurrent updates (conflict)
    pub fn concurrent_with(&self, other: &VersionVector) -> bool {
        !self.dominates(other) && !other.dominates(self)
    }
}
