//! SQLite cache layer with WAL mode for sync state persistence
//!
//! Maintains metadata, chunk records, and version vectors for deduplication and conflict detection.

use crate::types::{Blake3Hash, Chunk, SyncEntry, SyncState, VersionVector};
use crate::{Error, Result};
use parking_lot::Mutex;
use rusqlite::{params, Connection, OptionalExtension};
use std::path::Path;
use std::sync::Arc;
use std::time::SystemTime;

/// SQLite cache manager with WAL support
pub struct SyncDb {
    connection: Arc<Mutex<Connection>>,
}

impl SyncDb {
    /// Initialize database with schema
    pub async fn init(db_path: &Path) -> Result<Self> {
        // Ensure parent directory exists
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent).ok();
        }

        let conn = Connection::open(db_path)
            .map_err(|e| Error::Database(format!("Failed to open database: {}", e)))?;

        // Enable WAL mode for concurrent access
        conn.execute_batch("PRAGMA journal_mode = WAL;")
            .map_err(|e| Error::Database(format!("Failed to enable WAL: {}", e)))?;

        // Enable foreign keys
        conn.execute_batch("PRAGMA foreign_keys = ON;")
            .map_err(|e| Error::Database(format!("Failed to enable foreign keys: {}", e)))?;

        // Create tables
        Self::create_schema(&conn)?;

        Ok(Self {
            connection: Arc::new(Mutex::new(conn)),
        })
    }

    /// Create database schema
    fn create_schema(conn: &Connection) -> Result<()> {
        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS sync_entries (
                path TEXT PRIMARY KEY,
                state TEXT NOT NULL,
                local_size INTEGER NOT NULL,
                modified_at INTEGER NOT NULL,
                synced_at INTEGER,
                error_reason TEXT,
                content_hash BLOB
            );

            CREATE TABLE IF NOT EXISTS chunks (
                id INTEGER PRIMARY KEY,
                path TEXT NOT NULL,
                offset INTEGER NOT NULL,
                size INTEGER NOT NULL,
                hash BLOB NOT NULL,
                FOREIGN KEY (path) REFERENCES sync_entries(path) ON DELETE CASCADE,
                UNIQUE(path, offset)
            );

            CREATE TABLE IF NOT EXISTS version_vectors (
                path TEXT PRIMARY KEY,
                vector BLOB NOT NULL,
                updated_at INTEGER NOT NULL,
                FOREIGN KEY (path) REFERENCES sync_entries(path) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS hash_references (
                hash BLOB NOT NULL,
                path TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                FOREIGN KEY (path) REFERENCES sync_entries(path) ON DELETE CASCADE,
                PRIMARY KEY (hash, path)
            );

            CREATE INDEX IF NOT EXISTS idx_sync_state ON sync_entries(state);
            CREATE INDEX IF NOT EXISTS idx_chunks_path ON chunks(path);
            CREATE INDEX IF NOT EXISTS idx_hash_ref_hash ON hash_references(hash);
            "#,
        )
        .map_err(|e| Error::Database(format!("Failed to create schema: {}", e)))?;

        Ok(())
    }

    /// Insert or update sync entry
    pub async fn upsert_file(&self, entry: &SyncEntry) -> Result<()> {
        let conn = self.connection.lock();

        let state_str = Self::state_to_string(&entry.state);
        let synced_at = match entry.state {
            SyncState::Synced { synced_at } => {
                Some(synced_at.duration_since(SystemTime::UNIX_EPOCH).unwrap().as_secs())
            }
            _ => None,
        };
        let error_reason = match &entry.state {
            SyncState::Error { reason, .. } => Some(reason.clone()),
            _ => None,
        };

        // Stored with millisecond precision: multiple files created/modified within the
        // same second is common in tests, and "most recent" ordering must stay deterministic.
        let modified_at = entry
            .local_metadata
            .modified
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap()
            .as_millis() as i64;

        let content_hash = entry
            .local_metadata
            .content_hash
            .map(|h| h.as_bytes().to_vec());

        conn.execute(
            r#"
            INSERT OR REPLACE INTO sync_entries
            (path, state, local_size, modified_at, synced_at, error_reason, content_hash)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
            "#,
            params![
                entry.path.to_string_lossy().to_string(),
                state_str,
                entry.local_metadata.size as i64,
                modified_at as i64,
                synced_at,
                error_reason,
                content_hash
            ],
        )
        .map_err(|e| Error::Database(format!("Failed to upsert file: {}", e)))?;

        Ok(())
    }

    /// Get sync entry by path
    pub async fn get_file(&self, path: &Path) -> Result<Option<SyncEntry>> {
        let conn = self.connection.lock();
        let path_str = path.to_string_lossy().to_string();

        let result = conn
            .query_row(
                r#"
                SELECT state, local_size, modified_at, content_hash
                FROM sync_entries
                WHERE path = ?1
                "#,
                params![path_str],
                |row| {
                    let state_str: String = row.get(0)?;
                    let size: i64 = row.get(1)?;
                    let modified_at: i64 = row.get(2)?;
                    let content_hash: Option<Vec<u8>> = row.get(3)?;

                    Ok((state_str, size, modified_at, content_hash))
                },
            )
            .optional()
            .map_err(|e| Error::Database(format!("Failed to get file: {}", e)))?;

        if let Some((state_str, size, modified_at, content_hash)) = result {
            let state = Self::string_to_state(&state_str)?;
            let modified = SystemTime::UNIX_EPOCH
                + std::time::Duration::from_millis(modified_at as u64);

            let local_metadata = crate::types::FileMetadata {
                path: path.to_path_buf(),
                size: size as u64,
                modified,
                is_dir: false,
                permissions: 0,
                content_hash: Self::hash_from_blob(content_hash),
            };

            Ok(Some(SyncEntry {
                path: path.to_path_buf(),
                state,
                local_metadata,
                remote_metadata: None,
                chunks: None,
                chunk_hashes: None,
            }))
        } else {
            Ok(None)
        }
    }

    /// List all files with specific state
    pub async fn list_files(&self, state: SyncState) -> Result<Vec<SyncEntry>> {
        let conn = self.connection.lock();
        let state_str = Self::state_to_string(&state);

        let mut stmt = conn
            .prepare(
                r#"
                SELECT path, state, local_size, modified_at, content_hash
                FROM sync_entries
                WHERE state = ?1
                ORDER BY path
                "#,
            )
            .map_err(|e| Error::Database(format!("Failed to prepare statement: {}", e)))?;

        let entries = stmt
            .query_map(params![state_str], |row| {
                let path_str: String = row.get(0)?;
                let state_str: String = row.get(1)?;
                let size: i64 = row.get(2)?;
                let modified_at: i64 = row.get(3)?;
                let content_hash: Option<Vec<u8>> = row.get(4)?;

                Ok((
                    std::path::PathBuf::from(path_str),
                    state_str,
                    size,
                    modified_at,
                    content_hash,
                ))
            })
            .map_err(|e| Error::Database(format!("Failed to query files: {}", e)))?
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(|e| Error::Database(format!("Failed to collect results: {}", e)))?;

        let mut result = Vec::new();
        for (path, state_str, size, modified_at, content_hash) in entries {
            if let Ok(parsed_state) = Self::string_to_state(&state_str) {
                let modified = SystemTime::UNIX_EPOCH
                    + std::time::Duration::from_millis(modified_at as u64);

                let local_metadata = crate::types::FileMetadata {
                    path: path.clone(),
                    size: size as u64,
                    modified,
                    is_dir: false,
                    permissions: 0,
                    content_hash: Self::hash_from_blob(content_hash),
                };

                result.push(SyncEntry {
                    path,
                    state: parsed_state,
                    local_metadata,
                    remote_metadata: None,
                    chunks: None,
                    chunk_hashes: None,
                });
            }
        }

        Ok(result)
    }

    /// List files across all states, most recently modified first
    pub async fn list_recent(&self, limit: i64) -> Result<Vec<SyncEntry>> {
        let conn = self.connection.lock();

        let mut stmt = conn
            .prepare(
                r#"
                SELECT path, state, local_size, modified_at, content_hash
                FROM sync_entries
                ORDER BY modified_at DESC
                LIMIT ?1
                "#,
            )
            .map_err(|e| Error::Database(format!("Failed to prepare statement: {}", e)))?;

        let entries = stmt
            .query_map(params![limit], |row| {
                let path_str: String = row.get(0)?;
                let state_str: String = row.get(1)?;
                let size: i64 = row.get(2)?;
                let modified_at: i64 = row.get(3)?;
                let content_hash: Option<Vec<u8>> = row.get(4)?;

                Ok((
                    std::path::PathBuf::from(path_str),
                    state_str,
                    size,
                    modified_at,
                    content_hash,
                ))
            })
            .map_err(|e| Error::Database(format!("Failed to query recent files: {}", e)))?
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(|e| Error::Database(format!("Failed to collect results: {}", e)))?;

        let mut result = Vec::new();
        for (path, state_str, size, modified_at, content_hash) in entries {
            if let Ok(parsed_state) = Self::string_to_state(&state_str) {
                let modified = SystemTime::UNIX_EPOCH
                    + std::time::Duration::from_millis(modified_at as u64);

                let local_metadata = crate::types::FileMetadata {
                    path: path.clone(),
                    size: size as u64,
                    modified,
                    is_dir: false,
                    permissions: 0,
                    content_hash: Self::hash_from_blob(content_hash),
                };

                result.push(SyncEntry {
                    path,
                    state: parsed_state,
                    local_metadata,
                    remote_metadata: None,
                    chunks: None,
                    chunk_hashes: None,
                });
            }
        }

        Ok(result)
    }

    /// Delete sync entry
    pub async fn delete_file(&self, path: &Path) -> Result<()> {
        let conn = self.connection.lock();
        let path_str = path.to_string_lossy().to_string();

        conn.execute("DELETE FROM sync_entries WHERE path = ?1", params![path_str])
            .map_err(|e| Error::Database(format!("Failed to delete file: {}", e)))?;

        Ok(())
    }

    /// Store chunks for file
    pub async fn store_chunks(&self, path: &Path, chunks: &[Chunk]) -> Result<()> {
        let conn = self.connection.lock();
        let path_str = path.to_string_lossy().to_string();

        // Clear existing chunks
        conn.execute("DELETE FROM chunks WHERE path = ?1", params![&path_str])
            .map_err(|e| Error::Database(format!("Failed to clear chunks: {}", e)))?;

        // Insert new chunks
        for chunk in chunks {
            conn.execute(
                "INSERT INTO chunks (path, offset, size, hash) VALUES (?1, ?2, ?3, ?4)",
                params![
                    &path_str,
                    chunk.offset as i64,
                    chunk.size as i64,
                    chunk.hash.as_bytes().to_vec()
                ],
            )
            .map_err(|e| Error::Database(format!("Failed to store chunk: {}", e)))?;
        }

        Ok(())
    }

    /// Get chunks for file
    pub async fn get_chunks(&self, path: &Path) -> Result<Vec<Chunk>> {
        let conn = self.connection.lock();
        let path_str = path.to_string_lossy().to_string();

        let mut stmt = conn
            .prepare("SELECT offset, size, hash FROM chunks WHERE path = ?1 ORDER BY offset")
            .map_err(|e| Error::Database(format!("Failed to prepare statement: {}", e)))?;

        let chunks = stmt
            .query_map(params![path_str], |row| {
                let offset: i64 = row.get(0)?;
                let size: i64 = row.get(1)?;
                let hash_bytes: Vec<u8> = row.get(2)?;

                let mut hash_array = [0u8; 32];
                hash_array.copy_from_slice(&hash_bytes);

                Ok(Chunk {
                    offset: offset as u64,
                    size: size as u64,
                    hash: Blake3Hash::from_bytes(hash_array),
                })
            })
            .map_err(|e| Error::Database(format!("Failed to query chunks: {}", e)))?
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(|e| Error::Database(format!("Failed to collect chunks: {}", e)))?;

        Ok(chunks)
    }

    /// Store hash reference for deduplication
    pub async fn store_hash_reference(&self, hash: Blake3Hash, path: &Path) -> Result<()> {
        let conn = self.connection.lock();
        let path_str = path.to_string_lossy().to_string();
        let now = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap()
            .as_secs();

        conn.execute(
            "INSERT OR IGNORE INTO hash_references (hash, path, created_at) VALUES (?1, ?2, ?3)",
            params![hash.as_bytes().to_vec(), path_str, now as i64],
        )
        .map_err(|e| Error::Database(format!("Failed to store hash reference: {}", e)))?;

        Ok(())
    }

    /// Find duplicate files by hash
    pub async fn find_duplicates(&self, hash: Blake3Hash) -> Result<Vec<std::path::PathBuf>> {
        let conn = self.connection.lock();

        let mut stmt = conn
            .prepare("SELECT path FROM hash_references WHERE hash = ?1")
            .map_err(|e| Error::Database(format!("Failed to prepare statement: {}", e)))?;

        let paths = stmt
            .query_map(params![hash.as_bytes().to_vec()], |row| {
                let path_str: String = row.get(0)?;
                Ok(std::path::PathBuf::from(path_str))
            })
            .map_err(|e| Error::Database(format!("Failed to query duplicates: {}", e)))?
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(|e| Error::Database(format!("Failed to collect duplicates: {}", e)))?;

        Ok(paths)
    }

    /// Store version vector
    pub async fn store_version_vector(
        &self,
        path: &Path,
        vector: &VersionVector,
    ) -> Result<()> {
        let conn = self.connection.lock();
        let path_str = path.to_string_lossy().to_string();
        let now = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap()
            .as_secs();

        let vector_json = serde_json::to_vec(vector)
            .map_err(|e| Error::Serialization(format!("Failed to serialize version vector: {}", e)))?;

        conn.execute(
            "INSERT OR REPLACE INTO version_vectors (path, vector, updated_at) VALUES (?1, ?2, ?3)",
            params![path_str, vector_json, now as i64],
        )
        .map_err(|e| Error::Database(format!("Failed to store version vector: {}", e)))?;

        Ok(())
    }

    /// Get version vector
    pub async fn get_version_vector(&self, path: &Path) -> Result<Option<VersionVector>> {
        let conn = self.connection.lock();
        let path_str = path.to_string_lossy().to_string();

        let result: Option<Vec<u8>> = conn
            .query_row(
                "SELECT vector FROM version_vectors WHERE path = ?1",
                params![path_str],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| Error::Database(format!("Failed to query version vector: {}", e)))?;

        if let Some(vector_json) = result {
            let vector = serde_json::from_slice(&vector_json)
                .map_err(|e| Error::Serialization(format!("Failed to deserialize version vector: {}", e)))?;
            Ok(Some(vector))
        } else {
            Ok(None)
        }
    }

    fn hash_from_blob(blob: Option<Vec<u8>>) -> Option<Blake3Hash> {
        let bytes = blob?;
        let array: [u8; 32] = bytes.try_into().ok()?;
        Some(Blake3Hash::from_bytes(array))
    }

    fn state_to_string(state: &SyncState) -> String {
        match state {
            SyncState::Pending => "pending".to_string(),
            SyncState::Syncing { .. } => "syncing".to_string(),
            SyncState::Synced { .. } => "synced".to_string(),
            SyncState::Error { .. } => "error".to_string(),
        }
    }

    fn string_to_state(s: &str) -> Result<SyncState> {
        match s {
            "pending" => Ok(SyncState::Pending),
            "syncing" => Ok(SyncState::Syncing {
                progress: 0.0,
                started_at: SystemTime::now(),
            }),
            "synced" => Ok(SyncState::Synced {
                synced_at: SystemTime::now(),
            }),
            "error" => Ok(SyncState::Error {
                reason: "unknown".to_string(),
                retry_count: 0,
            }),
            _ => Err(Error::Database(format!("Unknown state: {}", s))),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    /// chunks/version_vectors/hash_references carry a FK on sync_entries.path,
    /// so tests that exercise them directly need a parent row first.
    fn dummy_entry(path: &std::path::Path) -> SyncEntry {
        SyncEntry {
            path: path.to_path_buf(),
            state: SyncState::Pending,
            local_metadata: crate::types::FileMetadata {
                path: path.to_path_buf(),
                size: 0,
                modified: SystemTime::now(),
                is_dir: false,
                permissions: 0o644,
                content_hash: None,
            },
            remote_metadata: None,
            chunks: None,
            chunk_hashes: None,
        }
    }

    #[tokio::test]
    async fn test_db_init() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("test.db");

        let db = SyncDb::init(&db_path).await.unwrap();
        assert!(db_path.exists(), "Database file should exist");
    }

    #[tokio::test]
    async fn test_upsert_get_file() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("test.db");
        let db = SyncDb::init(&db_path).await.unwrap();

        let entry = SyncEntry {
            path: std::path::PathBuf::from("/test/file.txt"),
            state: SyncState::Pending,
            local_metadata: crate::types::FileMetadata {
                path: std::path::PathBuf::from("/test/file.txt"),
                size: 1000,
                modified: SystemTime::now(),
                is_dir: false,
                permissions: 0o644,
                content_hash: None,
            },
            remote_metadata: None,
            chunks: None,
            chunk_hashes: None,
        };

        db.upsert_file(&entry).await.unwrap();

        let retrieved = db.get_file(&entry.path).await.unwrap();
        assert!(retrieved.is_some(), "File should be retrievable");
        assert_eq!(retrieved.unwrap().path, entry.path);
    }

    #[tokio::test]
    async fn test_chunk_storage() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("test.db");
        let db = SyncDb::init(&db_path).await.unwrap();

        let path = std::path::PathBuf::from("/test/file.txt");
        let chunks = vec![
            Chunk {
                offset: 0,
                size: 65536,
                hash: Blake3Hasher::hash(b"chunk1"),
            },
            Chunk {
                offset: 65536,
                size: 65536,
                hash: Blake3Hasher::hash(b"chunk2"),
            },
        ];

        db.upsert_file(&dummy_entry(&path)).await.unwrap();
        db.store_chunks(&path, &chunks).await.unwrap();

        let retrieved = db.get_chunks(&path).await.unwrap();
        assert_eq!(retrieved.len(), 2);
        assert_eq!(retrieved[0].offset, 0);
        assert_eq!(retrieved[1].offset, 65536);
    }

    use crate::blake3_hasher::Blake3Hasher;

    #[tokio::test]
    async fn test_dedup_lookup() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("test.db");
        let db = SyncDb::init(&db_path).await.unwrap();

        let hash = Blake3Hash::default();
        let path1 = std::path::PathBuf::from("/file1.txt");
        let path2 = std::path::PathBuf::from("/file2.txt");

        db.upsert_file(&dummy_entry(&path1)).await.unwrap();
        db.upsert_file(&dummy_entry(&path2)).await.unwrap();
        db.store_hash_reference(hash, &path1).await.unwrap();
        db.store_hash_reference(hash, &path2).await.unwrap();

        let duplicates = db.find_duplicates(hash).await.unwrap();
        assert_eq!(duplicates.len(), 2);
    }

    #[tokio::test]
    async fn test_version_vector() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("test.db");
        let db = SyncDb::init(&db_path).await.unwrap();

        let mut vector = VersionVector::new();
        vector.increment("peer1");
        vector.increment("peer1");
        vector.increment("peer2");

        let path = std::path::PathBuf::from("/test/file.txt");
        db.upsert_file(&dummy_entry(&path)).await.unwrap();
        db.store_version_vector(&path, &vector)
            .await
            .unwrap();

        let retrieved = db.get_version_vector(&path)
            .await
            .unwrap()
            .unwrap();

        assert_eq!(*retrieved.clocks.get("peer1").unwrap(), 2);
        assert_eq!(*retrieved.clocks.get("peer2").unwrap(), 1);
    }
}
