//! Indra daemon main entry point

mod fs_provider;
mod grpc;

use anyhow::Result;
use fs_provider::LocalFsProvider;
use indra_core::types::{DaemonConfig, FsEvent};
use indra_core::storage::StorageProvider;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;
use tracing_subscriber;

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env()
                .add_directive(tracing::Level::INFO.into()),
        )
        .init();

    tracing::info!(
        "Starting Indra daemon v{}",
        indra_core::VERSION
    );

    let config = DaemonConfig::default();
    tracing::info!("Configuration: {:?}", config);

    // Register provider in Windows Registry (if Windows)
    #[cfg(target_os = "windows")]
    {
        use indra_windows::registry::{register_provider, ProviderConfig};

        match register_provider(&ProviderConfig::default()) {
            Ok(_) => {
                tracing::info!("Successfully registered Indra provider in Windows Registry");
            }
            Err(e) => {
                tracing::error!("Failed to register provider in Windows Registry: {}", e);
                // Don't abort, just log the error
            }
        }
    }

    // Create/verify the Indra Drive directory
    let indra_drive = if cfg!(target_os = "windows") {
        let username = std::env::var("USERNAME").unwrap_or_else(|_| "User".to_string());
        PathBuf::from(format!(r"C:\Users\{}\Indra Drive", username))
    } else {
        PathBuf::from(std::env::var("HOME").unwrap_or_else(|_| ".".to_string()))
            .join("Indra Drive")
    };

    tracing::info!("Indra Drive path: {:?}", indra_drive);

    // Create the directory if it doesn't exist
    if !indra_drive.exists() {
        match tokio::fs::create_dir_all(&indra_drive).await {
            Ok(_) => {
                tracing::info!("Created Indra Drive directory: {:?}", indra_drive);
            }
            Err(e) => {
                tracing::warn!("Failed to create Indra Drive directory: {}", e);
            }
        }
    } else {
        tracing::info!("Indra Drive directory already exists: {:?}", indra_drive);
    }

    // Initialize LocalFsProvider
    let fs_provider = LocalFsProvider::new(indra_drive.clone());
    tracing::info!("Initialized LocalFsProvider");

    // Initialize SyncEngine
    let db_path = PathBuf::from(&config.db_path);
    if let Some(parent) = db_path.parent() {
        let _ = tokio::fs::create_dir_all(parent).await;
    }

    let engine = match indra_core::engine::SyncEngine::new(fs_provider.clone(), &db_path).await {
        Ok(e) => {
            tracing::info!("Initialized SyncEngine");
            Arc::new(e)
        }
        Err(e) => {
            tracing::error!("Failed to initialize SyncEngine: {}", e);
            return Err(anyhow::anyhow!("SyncEngine initialization failed: {}", e));
        }
    };

    // Start file watcher for the Indra Drive
    let engine_clone = engine.clone();
    let indra_drive_clone = indra_drive.clone();
    let fs_provider_clone = fs_provider.clone();
    tokio::spawn(async move {
        tracing::info!("Starting file watcher for: {:?}", indra_drive_clone);

        match fs_provider_clone.watch_dir(&indra_drive_clone) {
            Ok(mut rx) => {
                tracing::info!("File watcher active on: {:?}", indra_drive_clone);
                while let Some(event) = rx.recv().await {
                    let path = match event {
                        FsEvent::Created(p) | FsEvent::Modified(p) => {
                            tracing::info!("File event: {:?}", p);
                            p
                        }
                        FsEvent::Deleted(p) => {
                            tracing::info!("File deleted: {:?}", p);
                            continue;
                        }
                        FsEvent::Renamed { from: _, to: p } => {
                            tracing::info!("File renamed to: {:?}", p);
                            p
                        }
                    };

                    // Chunk, BLAKE3-hash, and persist the file's sync metadata locally.
                    // (No remote push yet — see docs/plans/24_PLAN_verificacion-e2e-storage.md.)
                    if let Err(e) = engine_clone.process_file(&path).await {
                        tracing::warn!("Failed to process file {:?}: {}", path, e);
                    }
                }
            }
            Err(e) => {
                tracing::error!("Failed to setup file watcher: {}", e);
            }
        }
    });

    // Start gRPC server
    let listen_addr: SocketAddr = format!("{}:{}", config.listen_addr, config.listen_port)
        .parse()?;

    let grpc_engine = engine.clone();
    tokio::spawn(async move {
        if let Err(e) = grpc::start_grpc_server(listen_addr, grpc_engine).await {
            tracing::error!("gRPC server error: {}", e);
        }
    });

    tracing::info!(
        "Indra daemon started successfully - Listening on {}",
        listen_addr
    );

    // Wait for shutdown signal
    tokio::signal::ctrl_c().await?;
    tracing::info!("Shutting down Indra daemon");

    Ok(())
}
