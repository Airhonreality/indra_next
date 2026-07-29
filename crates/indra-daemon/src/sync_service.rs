use std::sync::Arc;
use tonic::{Request, Response, Status};
use uuid::Uuid;

use crate::db::{EventStore, SyncEvent};
use crate::device_pairing::DevicePairingManager;
use crate::sync::sync_service_server::SyncService;
use crate::sync::*;
use crate::versioning::VersionVector;

pub struct SyncServiceImpl {
    device_id: String,
    device_name: String,
    event_store: Arc<EventStore>,
    pairing_manager: Arc<DevicePairingManager>,
}

impl SyncServiceImpl {
    pub fn new(
        device_id: String,
        device_name: String,
        event_store: Arc<EventStore>,
        pairing_manager: Arc<DevicePairingManager>,
    ) -> Self {
        Self {
            device_id,
            device_name,
            event_store,
            pairing_manager,
        }
    }
}

#[tonic::async_trait]
impl SyncService for SyncServiceImpl {
    async fn pull(
        &self,
        request: Request<PullRequest>,
    ) -> Result<Response<PullResponse>, Status> {
        let req = request.into_inner();

        tracing::info!(
            device_id = %req.device_id,
            since_version = req.since_version,
            "Pull request"
        );

        // Check if requester is trusted
        if !self.pairing_manager.is_trusted(&req.device_id) {
            return Err(Status::permission_denied("Device not trusted"));
        }

        let current_version = self
            .event_store
            .get_current_version()
            .await
            .map_err(|e| Status::internal(format!("Database error: {}", e)))?;

        let events = self
            .event_store
            .get_events_since(req.since_version, 1000)
            .await
            .map_err(|e| Status::internal(format!("Database error: {}", e)))?;

        let sync_events = events
            .into_iter()
            .map(|e| SyncEvent {
                event_id: e.event_id,
                r#type: match e.event_type.as_str() {
                    "FILE_CREATED" => EventType::FileCreated as i32,
                    "FILE_UPDATED" => EventType::FileUpdated as i32,
                    "FILE_DELETED" => EventType::FileDeleted as i32,
                    "FILE_RENAMED" => EventType::FileRenamed as i32,
                    "FOLDER_CREATED" => EventType::FolderCreated as i32,
                    "FOLDER_DELETED" => EventType::FolderDeleted as i32,
                    "SYNC_COMPLETE" => EventType::SyncComplete as i32,
                    _ => EventType::EventTypeUnspecified as i32,
                },
                file: Some(FileMetadata {
                    path: e.file_path,
                    size: e.file_size,
                    modified_time_ms: e.modified_time_ms,
                    mode: "0644".to_string(),
                    chunks: vec![],
                }),
                timestamp_ms: e.timestamp_ms,
                device_id: e.device_id,
                version_vector: e.version_vector,
            })
            .collect();

        let pull_response = PullResponse {
            events: sync_events,
            current_version,
            has_more: false,
        };

        Ok(Response::new(pull_response))
    }

    async fn push(
        &self,
        request: Request<PushRequest>,
    ) -> Result<Response<PushResponse>, Status> {
        let req = request.into_inner();

        tracing::info!(
            device_id = %req.device_id,
            event_count = req.events.len(),
            "Push request"
        );

        // Check if requester is trusted
        if !self.pairing_manager.is_trusted(&req.device_id) {
            return Err(Status::permission_denied("Device not trusted"));
        }

        let mut conflict_event_ids = vec![];

        for event in &req.events {
            let event_id = &event.event_id;

            // Check for conflicts with existing events
            if let Ok(Some(existing)) = self.event_store.get_event_by_id(event_id).await {
                if existing.modified_time_ms != event.timestamp_ms {
                    conflict_event_ids.push(event_id.clone());
                    continue;
                }
            }

            // Store the event
            let event_type = match EventType::try_from(event.r#type) {
                Ok(t) => match t {
                    EventType::FileCreated => "FILE_CREATED",
                    EventType::FileUpdated => "FILE_UPDATED",
                    EventType::FileDeleted => "FILE_DELETED",
                    EventType::FileRenamed => "FILE_RENAMED",
                    EventType::FolderCreated => "FOLDER_CREATED",
                    EventType::FolderDeleted => "FOLDER_DELETED",
                    EventType::SyncComplete => "SYNC_COMPLETE",
                    EventType::EventTypeUnspecified => "UNKNOWN",
                },
                Err(_) => "UNKNOWN",
            };

            let file_path = event
                .file
                .as_ref()
                .map(|f| f.path.clone())
                .unwrap_or_default();
            let file_size = event.file.as_ref().map(|f| f.size).unwrap_or(0);
            let modified_time_ms = event.file.as_ref().map(|f| f.modified_time_ms).unwrap_or(0);

            if let Err(e) = self
                .event_store
                .store_event(
                    event_id,
                    event_type,
                    &file_path,
                    file_size,
                    modified_time_ms,
                    "[]",
                    &req.device_id,
                    event.version_vector,
                    event.timestamp_ms,
                )
                .await
            {
                tracing::error!("Failed to store event: {}", e);
                conflict_event_ids.push(event_id.clone());
            }
        }

        let new_version = self
            .event_store
            .get_current_version()
            .await
            .map_err(|e| Status::internal(format!("Database error: {}", e)))?;

        Ok(Response::new(PushResponse {
            conflict_event_ids,
            new_version,
        }))
    }

    async fn subscribe(
        &self,
        request: Request<PullRequest>,
    ) -> Result<Response<tonic::Streaming<StreamEvent>>, Status> {
        let req = request.into_inner();

        // Check if requester is trusted
        if !self.pairing_manager.is_trusted(&req.device_id) {
            return Err(Status::permission_denied("Device not trusted"));
        }

        let (tx, rx) = tokio::sync::mpsc::channel(100);

        let event_store = Arc::clone(&self.event_store);
        let device_id = self.device_id.clone();
        let device_name = self.device_name.clone();
        let platform = if cfg!(windows) {
            "windows"
        } else if cfg!(target_os = "linux") {
            "linux"
        } else {
            "macos"
        }
        .to_string();

        tokio::spawn(async move {
            let mut current_version = req.since_version;

            loop {
                if let Ok(events) = event_store.get_events_since(current_version, 100).await {
                    for event in events {
                        if let Ok(new_version) = event_store.get_current_version().await {
                            current_version = current_version.max(event.version_vector);

                            let stream_event = StreamEvent {
                                event: Some(SyncEvent {
                                    event_id: event.event_id,
                                    r#type: match event.event_type.as_str() {
                                        "FILE_CREATED" => EventType::FileCreated as i32,
                                        "FILE_UPDATED" => EventType::FileUpdated as i32,
                                        "FILE_DELETED" => EventType::FileDeleted as i32,
                                        _ => EventType::EventTypeUnspecified as i32,
                                    },
                                    file: Some(FileMetadata {
                                        path: event.file_path,
                                        size: event.file_size,
                                        modified_time_ms: event.modified_time_ms,
                                        mode: "0644".to_string(),
                                        chunks: vec![],
                                    }),
                                    timestamp_ms: event.timestamp_ms,
                                    device_id: event.device_id,
                                    version_vector: event.version_vector,
                                }),
                                source_device: Some(Device {
                                    device_id: device_id.clone(),
                                    device_name: device_name.clone(),
                                    platform: platform.clone(),
                                    last_seen_ms: chrono::Local::now().timestamp_millis(),
                                    ip_address: "127.0.0.1".to_string(),
                                    port: 9876,
                                    trusted: true,
                                    public_key_hmac: vec![],
                                }),
                            };

                            if tx.send(Ok(stream_event)).await.is_err() {
                                break;
                            }
                        }
                    }
                }

                tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
            }
        });

        Ok(Response::new(tonic::Streaming::new(rx)))
    }

    async fn heartbeat(
        &self,
        request: Request<HeartbeatRequest>,
    ) -> Result<Response<HeartbeatResponse>, Status> {
        let req = request.into_inner();

        tracing::info!(
            device_id = %req.device_id,
            device_name = %req.device_name,
            ip_address = %req.ip_address,
            port = req.port,
            "Heartbeat received"
        );

        // Update last seen time
        let timestamp_ms = chrono::Local::now().timestamp_millis();
        let _ = self
            .pairing_manager
            .update_last_seen(&req.device_id, timestamp_ms);

        let known_devices = self
            .pairing_manager
            .list_devices()
            .into_iter()
            .filter(|d| d.device_id != req.device_id)
            .map(|d| Device {
                device_id: d.device_id,
                device_name: d.device_name,
                platform: d.platform,
                last_seen_ms: d.last_seen_ms,
                ip_address: d.ip_address,
                port: d.port as i32,
                trusted: d.trusted,
                public_key_hmac: vec![],
            })
            .collect();

        Ok(Response::new(HeartbeatResponse {
            acknowledged: true,
            known_devices,
        }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_heartbeat() {
        let event_store = Arc::new(EventStore::new(":memory:").await.unwrap());
        let pairing_manager = Arc::new(DevicePairingManager::new());

        let service = SyncServiceImpl::new(
            "device-server".to_string(),
            "Server Device".to_string(),
            event_store,
            pairing_manager.clone(),
        );

        // Register client as trusted
        pairing_manager
            .register_device(crate::device_pairing::PairedDevice {
                device_id: "device-client".to_string(),
                device_name: "Client Device".to_string(),
                platform: "windows".to_string(),
                ip_address: "192.168.1.100".to_string(),
                port: 9877,
                trusted: true,
                last_seen_ms: 0,
            })
            .unwrap();

        let request = Request::new(HeartbeatRequest {
            device_id: "device-client".to_string(),
            device_name: "Client Device".to_string(),
            ip_address: "192.168.1.100".to_string(),
            port: 9877,
        });

        let response = service.heartbeat(request).await;
        assert!(response.is_ok());

        let resp = response.unwrap();
        assert!(resp.get_ref().acknowledged);
    }
}
