use criterion::{criterion_group, criterion_main, Criterion};
use indra_core::{SyncDb, SyncEntry, SyncState, FileMetadata};
use std::path::PathBuf;
use std::time::SystemTime;
use tempfile::tempdir;

#[tokio::main]
async fn bench_db_upsert(c: &mut Criterion) {
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("bench.db");
    let db = SyncDb::init(&db_path).await.unwrap();

    c.bench_function("db_upsert_1k_files", |b| {
        b.to_async(tokio::runtime::Runtime::new().unwrap())
            .iter(|| async {
                for i in 0..1000 {
                    let entry = SyncEntry {
                        path: PathBuf::from(format!("/test/file_{}.txt", i)),
                        state: SyncState::Pending,
                        local_metadata: FileMetadata {
                            path: PathBuf::from(format!("/test/file_{}.txt", i)),
                            size: 1000 + i as u64,
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
                }
            });
    });
}

#[tokio::main]
async fn bench_db_query_pending(c: &mut Criterion) {
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("bench.db");
    let db = SyncDb::init(&db_path).await.unwrap();

    // Insert test data
    for i in 0..100 {
        let entry = SyncEntry {
            path: PathBuf::from(format!("/test/file_{}.txt", i)),
            state: SyncState::Pending,
            local_metadata: FileMetadata {
                path: PathBuf::from(format!("/test/file_{}.txt", i)),
                size: 1000 + i as u64,
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
    }

    c.bench_function("db_query_pending_100_files", |b| {
        b.to_async(tokio::runtime::Runtime::new().unwrap()).iter(|| async {
            db.list_files(SyncState::Pending).await.unwrap()
        });
    });
}

criterion_group!(benches, bench_db_upsert, bench_db_query_pending);
criterion_main!(benches);
