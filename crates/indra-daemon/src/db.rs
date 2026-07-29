use anyhow::Result;
use sqlx::sqlite::{SqliteConnectOptions, SqlitePool, SqlitePoolOptions};
use std::path::Path;
use std::str::FromStr;

#[derive(Clone, Debug)]
pub struct SyncEvent {
    pub event_id: String,
    pub event_type: String,
    pub file_path: String,
    pub file_size: i64,
    pub modified_time_ms: i64,
    pub chunks_json: String,
    pub device_id: String,
    pub version_vector: i32,
    pub timestamp_ms: i64,
}

#[derive(Clone)]
pub struct EventStore {
    pool: SqlitePool,
}

impl EventStore {
    pub async fn new(db_path: impl AsRef<Path>) -> Result<Self> {
        let db_path = db_path.as_ref();

        // Create parent directories if needed
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let connect_options = SqliteConnectOptions::from_str(
            &format!("sqlite:{}", db_path.display()),
        )?
        .create_if_missing(true);

        let pool = SqlitePoolOptions::new()
            .connect_with(connect_options)
            .await?;

        // Create tables
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS sync_events (
                event_id TEXT PRIMARY KEY,
                event_type TEXT NOT NULL,
                file_path TEXT NOT NULL,
                file_size INTEGER,
                modified_time_ms INTEGER,
                chunks_json TEXT,
                device_id TEXT NOT NULL,
                version_vector INTEGER NOT NULL,
                timestamp_ms INTEGER NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
            "#,
        )
        .execute(&pool)
        .await?;

        // Create index for efficient queries
        sqlx::query(
            "CREATE INDEX IF NOT EXISTS idx_version ON sync_events(version_vector)"
        )
        .execute(&pool)
        .await?;

        sqlx::query(
            "CREATE INDEX IF NOT EXISTS idx_device_id ON sync_events(device_id)"
        )
        .execute(&pool)
        .await?;

        Ok(Self { pool })
    }

    pub async fn store_event(
        &self,
        event_id: &str,
        event_type: &str,
        file_path: &str,
        file_size: i64,
        modified_time_ms: i64,
        chunks_json: &str,
        device_id: &str,
        version_vector: i32,
        timestamp_ms: i64,
    ) -> Result<()> {
        sqlx::query(
            r#"
            INSERT OR REPLACE INTO sync_events
            (event_id, event_type, file_path, file_size, modified_time_ms,
             chunks_json, device_id, version_vector, timestamp_ms)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(event_id)
        .bind(event_type)
        .bind(file_path)
        .bind(file_size)
        .bind(modified_time_ms)
        .bind(chunks_json)
        .bind(device_id)
        .bind(version_vector)
        .bind(timestamp_ms)
        .execute(&self.pool)
        .await?;

        tracing::debug!(event_id, event_type, file_path, "Event stored");

        Ok(())
    }

    pub async fn get_events_since(&self, version: i32, limit: i32) -> Result<Vec<SyncEvent>> {
        let rows = sqlx::query_as::<_, (String, String, String, i64, i64, String, String, i32, i64)>(
            "SELECT event_id, event_type, file_path, file_size, modified_time_ms, chunks_json, device_id, version_vector, timestamp_ms FROM sync_events WHERE version_vector > ? ORDER BY version_vector ASC LIMIT ?"
        )
        .bind(version)
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;

        let events = rows
            .into_iter()
            .map(|(event_id, event_type, file_path, file_size, modified_time_ms, chunks_json, device_id, version_vector, timestamp_ms)| {
                SyncEvent {
                    event_id,
                    event_type,
                    file_path,
                    file_size,
                    modified_time_ms,
                    chunks_json,
                    device_id,
                    version_vector,
                    timestamp_ms,
                }
            })
            .collect();

        Ok(events)
    }

    pub async fn get_current_version(&self) -> Result<i32> {
        let row: (Option<i32>,) = sqlx::query_as(
            "SELECT COALESCE(MAX(version_vector), 0) FROM sync_events"
        )
        .fetch_one(&self.pool)
        .await?;

        Ok(row.0.unwrap_or(0))
    }

    pub async fn increment_version(&self) -> Result<i32> {
        let current = self.get_current_version().await?;
        Ok(current + 1)
    }

    pub async fn get_event_by_id(&self, event_id: &str) -> Result<Option<SyncEvent>> {
        let row = sqlx::query_as::<_, (String, String, String, i64, i64, String, String, i32, i64)>(
            "SELECT event_id, event_type, file_path, file_size, modified_time_ms, chunks_json, device_id, version_vector, timestamp_ms FROM sync_events WHERE event_id = ?"
        )
        .bind(event_id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(|(event_id, event_type, file_path, file_size, modified_time_ms, chunks_json, device_id, version_vector, timestamp_ms)| {
            SyncEvent {
                event_id,
                event_type,
                file_path,
                file_size,
                modified_time_ms,
                chunks_json,
                device_id,
                version_vector,
                timestamp_ms,
            }
        }))
    }

    pub async fn delete_event(&self, event_id: &str) -> Result<()> {
        sqlx::query("DELETE FROM sync_events WHERE event_id = ?")
            .bind(event_id)
            .execute(&self.pool)
            .await?;

        Ok(())
    }

    pub async fn count_events(&self) -> Result<i64> {
        let (count,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM sync_events")
            .fetch_one(&self.pool)
            .await?;

        Ok(count)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_store_and_retrieve_event() {
        let store = EventStore::new(":memory:").await.unwrap();

        store
            .store_event(
                "test-event-1",
                "FILE_CREATED",
                "/tmp/test.txt",
                1024,
                1625000000000,
                "[]",
                "device-1",
                1,
                1625000000000,
            )
            .await
            .unwrap();

        let events = store.get_events_since(0, 100).await.unwrap();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].event_id, "test-event-1");
    }

    #[tokio::test]
    async fn test_version_tracking() {
        let store = EventStore::new(":memory:").await.unwrap();

        let v1 = store.get_current_version().await.unwrap();
        assert_eq!(v1, 0);

        store
            .store_event("evt1", "FILE_CREATED", "/test1.txt", 100, 1000, "[]", "dev1", 1, 1000)
            .await
            .unwrap();

        let v2 = store.get_current_version().await.unwrap();
        assert_eq!(v2, 1);
    }
}
