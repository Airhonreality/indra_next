//! gRPC server implementation for SyncService

use std::net::SocketAddr;
use std::sync::Arc;
use tokio_stream::wrappers::ReceiverStream;
use tonic::{transport::Server, Request, Response, Status};
use tracing::{debug, info, warn};

use crate::fs_provider::LocalFsProvider;
use indra_core::engine::SyncEngine;

// Include generated protobuf code
tonic::include_proto!("indra.sync");

use self::sync_service_server::{SyncService, SyncServiceServer};

/// Maximum number of entries returned by a single Pull call (MVP: no pagination yet)
const PULL_LIMIT: i64 = 200;

/// Indra SyncService implementation
#[derive(Clone)]
pub struct IndraSync {
    engine: Arc<SyncEngine<LocalFsProvider>>,
    device_id: String,
}

impl IndraSync {
    /// Create a new SyncService backed by the local sync engine
    pub fn new(engine: Arc<SyncEngine<LocalFsProvider>>) -> Self {
        let device_id = hostname::get()
            .ok()
            .and_then(|h| h.into_string().ok())
            .unwrap_or_else(|| "indra-device".to_string());

        Self { engine, device_id }
    }
}

#[tonic::async_trait]
impl SyncService for IndraSync {
    async fn heartbeat(
        &self,
        request: Request<HeartbeatRequest>,
    ) -> Result<Response<HeartbeatResponse>, Status> {
        let req = request.into_inner();
        debug!(
            device_id = %req.device_id,
            device_name = %req.device_name,
            "Heartbeat received"
        );

        let response = HeartbeatResponse {
            acknowledged: true,
            known_devices: vec![],
        };

        Ok(Response::new(response))
    }

    /// Returns the files known to the local SyncEngine (from the SQLite journal), most
    /// recently modified first, as SyncEvent messages carrying a whole-file BLAKE3 digest.
    ///
    /// `since_version` and `sync_root` are accepted but not yet honored — there is a single
    /// local sync root and no version journal today, so every Pull returns the current
    /// snapshot (see docs/plans/24_PLAN_verificacion-e2e-storage.md, Fase 1).
    async fn pull(
        &self,
        request: Request<PullRequest>,
    ) -> Result<Response<PullResponse>, Status> {
        let req = request.into_inner();
        debug!(
            device_id = %req.device_id,
            since_version = req.since_version,
            "Pull request received"
        );

        let entries = self
            .engine
            .list_recent(PULL_LIMIT)
            .await
            .map_err(|e| Status::internal(format!("Failed to list recent files: {}", e)))?;

        let current_version = entries.len() as i32;

        let events = entries
            .into_iter()
            .map(|entry| {
                let modified_time_ms = entry
                    .local_metadata
                    .modified
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_millis() as i64)
                    .unwrap_or(0);

                let chunks = match entry.local_metadata.content_hash {
                    Some(hash) => vec![ChunkHash {
                        algorithm: "BLAKE3".to_string(),
                        digest: hash.as_bytes().to_vec(),
                    }],
                    None => vec![],
                };

                SyncEvent {
                    event_id: uuid::Uuid::new_v4().to_string(),
                    r#type: EventType::FileUpdated as i32,
                    file: Some(FileMetadata {
                        path: entry.path.to_string_lossy().to_string(),
                        size: entry.local_metadata.size as i64,
                        modified_time_ms,
                        mode: "0644".to_string(),
                        chunks,
                    }),
                    timestamp_ms: modified_time_ms,
                    device_id: self.device_id.clone(),
                    version_vector: 0,
                }
            })
            .collect();

        let response = PullResponse {
            events,
            current_version,
            has_more: false,
        };

        Ok(Response::new(response))
    }

    async fn push(
        &self,
        request: Request<PushRequest>,
    ) -> Result<Response<PushResponse>, Status> {
        let req = request.into_inner();
        warn!(
            device_id = %req.device_id,
            event_count = req.events.len(),
            "Push received but remote ingestion is not implemented yet (see plan 24, Fase 2)"
        );

        let response = PushResponse {
            conflict_event_ids: vec![],
            new_version: 0,
        };

        Ok(Response::new(response))
    }

    type SubscribeStream = ReceiverStream<Result<StreamEvent, Status>>;

    async fn subscribe(
        &self,
        request: Request<PullRequest>,
    ) -> Result<Response<Self::SubscribeStream>, Status> {
        let req = request.into_inner();
        debug!(
            device_id = %req.device_id,
            "Subscribe request received"
        );

        let (_tx, rx) = tokio::sync::mpsc::channel(10);

        // For now, return an empty stream that completes immediately
        let stream = ReceiverStream::new(rx);

        Ok(Response::new(stream))
    }
}

/// Start the gRPC server
pub async fn start_grpc_server(
    addr: SocketAddr,
    engine: Arc<SyncEngine<LocalFsProvider>>,
) -> Result<(), Box<dyn std::error::Error>> {
    info!("Starting gRPC server on {}", addr);

    let sync_service = IndraSync::new(engine);

    Server::builder()
        .add_service(SyncServiceServer::new(sync_service))
        .serve(addr)
        .await?;

    Ok(())
}
