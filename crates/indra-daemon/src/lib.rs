// Generated protobuf module
pub mod sync {
    tonic::include_proto!("indra.sync");
}

// Application modules
pub mod config;
pub mod daemon;
pub mod db;
pub mod device_pairing;
pub mod filewatcher;
pub mod security;
pub mod sync_service;
pub mod versioning;

pub use daemon::Daemon;
pub use sync_service::SyncServiceImpl;
