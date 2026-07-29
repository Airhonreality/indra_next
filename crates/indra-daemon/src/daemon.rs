use anyhow::Result;
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;
use tokio::time::interval;

use crate::config::DaemonConfig;
use crate::db::EventStore;
use crate::device_pairing::DevicePairingManager;
use crate::filewatcher::FileWatcher;
use crate::sync::sync_service_server::SyncServiceServer;
use crate::sync_service::SyncServiceImpl;

pub struct Daemon {
    config: DaemonConfig,
    event_store: Arc<EventStore>,
    pairing_manager: Arc<DevicePairingManager>,
    file_watcher: FileWatcher,
}

impl Daemon {
    pub async fn new(config: DaemonConfig) -> Result<Self> {
        let event_store = Arc::new(EventStore::new(&config.db_path).await?);
        let pairing_manager = Arc::new(DevicePairingManager::new());

        let file_watcher = {
            let (watcher, _rx) = FileWatcher::new(config.sync_root.clone());
            watcher
        };

        tracing::info!(
            device_id = %config.device_id,
            device_name = %config.device_name,
            sync_root = %config.sync_root.display(),
            listen_port = config.listen_port,
            "Daemon initialized"
        );

        Ok(Self {
            config,
            event_store,
            pairing_manager,
            file_watcher,
        })
    }

    pub async fn start(&self) -> Result<()> {
        let listen_addr = format!("{}:{}", self.config.listen_host, self.config.listen_port)
            .parse::<SocketAddr>()?;

        tracing::info!("Starting gRPC server on {}", listen_addr);

        let sync_service = SyncServiceImpl::new(
            self.config.device_id.clone(),
            self.config.device_name.clone(),
            Arc::clone(&self.event_store),
            Arc::clone(&self.pairing_manager),
        );

        let server = tonic::transport::Server::builder()
            .add_service(SyncServiceServer::new(sync_service))
            .serve(listen_addr);

        tokio::select! {
            result = server => {
                result?;
            }
        }

        Ok(())
    }

    pub async fn start_heartbeat(&self, interval_secs: u64) -> Result<()> {
        let mut ticker = interval(Duration::from_secs(interval_secs));

        loop {
            ticker.tick().await;

            tracing::debug!(
                device_id = %self.config.device_id,
                "Heartbeat"
            );
        }
    }

    pub async fn start_filewatcher(&self) -> Result<()> {
        tracing::info!("Starting file watcher for {}", self.config.sync_root.display());
        self.file_watcher.start().await?;
        Ok(())
    }

    pub fn get_device_id(&self) -> &str {
        &self.config.device_id
    }

    pub fn get_device_name(&self) -> &str {
        &self.config.device_name
    }

    pub fn get_listen_port(&self) -> u16 {
        self.config.listen_port
    }

    pub fn get_event_store(&self) -> Arc<EventStore> {
        Arc::clone(&self.event_store)
    }

    pub fn get_pairing_manager(&self) -> Arc<DevicePairingManager> {
        Arc::clone(&self.pairing_manager)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[tokio::test]
    async fn test_daemon_creation() {
        let temp_dir = TempDir::new().unwrap();
        let config = DaemonConfig {
            device_id: "test-device-1".to_string(),
            device_name: "Test Device".to_string(),
            platform: "test".to_string(),
            sync_root: temp_dir.path().to_path_buf(),
            db_path: temp_dir.path().join("sync.db"),
            listen_host: "127.0.0.1".to_string(),
            listen_port: 19876,
            heartbeat_interval_secs: 5,
            mdns_enabled: false,
            tls_enabled: false,
            trusted_devices: vec![],
        };

        let daemon = Daemon::new(config).await.unwrap();
        assert_eq!(daemon.get_device_id(), "test-device-1");
        assert_eq!(daemon.get_device_name(), "Test Device");
        assert_eq!(daemon.get_listen_port(), 19876);
    }
}
