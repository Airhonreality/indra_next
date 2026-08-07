//! gRPC server implementation for SyncService

use std::net::SocketAddr;
use tokio_stream::wrappers::ReceiverStream;
use tonic::{transport::Server, Request, Response, Status};
use tracing::{debug, info};

// Include generated protobuf code
tonic::include_proto!("indra.sync");

use self::sync_service_server::{SyncService, SyncServiceServer};

/// Indra SyncService implementation
#[derive(Debug, Clone)]
pub struct IndraSync;

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

        let response = PullResponse {
            events: vec![],
            current_version: 0,
            has_more: false,
        };

        Ok(Response::new(response))
    }

    async fn push(
        &self,
        request: Request<PushRequest>,
    ) -> Result<Response<PushResponse>, Status> {
        let req = request.into_inner();
        debug!(
            device_id = %req.device_id,
            event_count = req.events.len(),
            "Push request received"
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
pub async fn start_grpc_server(addr: SocketAddr) -> Result<(), Box<dyn std::error::Error>> {
    info!("Starting gRPC server on {}", addr);

    let sync_service = IndraSync;

    Server::builder()
        .add_service(SyncServiceServer::new(sync_service))
        .serve(addr)
        .await?;

    Ok(())
}
