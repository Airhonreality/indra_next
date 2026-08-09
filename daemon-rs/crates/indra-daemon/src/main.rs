//! Indra daemon main entry point

mod fs_provider;
mod grpc;
mod cloud_client;

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

    // Check for diagnostic/pairing commands
    let args: Vec<String> = std::env::args().collect();
    if args.len() > 1 {
        let cmd = &args[1];

        // --pair: establish cloud connection
        if cmd == "--pair" {
            if args.len() < 3 {
                eprintln!("Usage: indra-daemon --pair <CODE>");
                return Err(anyhow::anyhow!("Missing pairing code"));
            }
            let code = &args[2];
            let config = DaemonConfig::default();
            let db_path = PathBuf::from(&config.db_path);
            let cloud_url = std::env::var("INDRA_CLOUD_URL")
                .unwrap_or_else(|_| "https://indra-next.vercel.app".to_string());
            match cloud_client::pair(&cloud_url, code, &db_path).await {
                Ok(_) => {
                    println!("Device successfully paired with cloud!");
                    return Ok(());
                }
                Err(e) => {
                    eprintln!("Failed to pair device: {}", e);
                    return Err(e);
                }
            }
        }

        // --status: check local and remote pairing status
        if cmd == "--status" {
            let config = DaemonConfig::default();
            let db_path = PathBuf::from(&config.db_path);

            match cloud_client::read_token_from_disk(&db_path) {
                None => {
                    println!("Emparejado: NO — correr indra-daemon.exe --pair <CODIGO>");
                    return Ok(());
                }
                Some(token) => {
                    println!("Emparejado: SÍ (token local: {}…)", &token[..8.min(token.len())]);

                    let cloud_url = std::env::var("INDRA_CLOUD_URL")
                        .unwrap_or_else(|_| "https://indra-next.vercel.app".to_string());

                    match cloud_client::fetch_whoami(&cloud_url, &token).await {
                        Ok(json) => {
                            if let (Some(device_name), Some(paired_at), Some(last_seen)) = (
                                json.get("deviceName").and_then(|v| v.as_str()),
                                json.get("pairedAt").and_then(|v| v.as_str()),
                                json.get("lastSeenAt").and_then(|v| v.as_str()),
                            ) {
                                println!("Servidor: VERIFICADO");
                                println!("  Device Name: {}", device_name);
                                println!("  Paired At: {}", paired_at);
                                println!("  Last Seen: {}", last_seen);
                            } else {
                                println!("Servidor: VERIFICADO (pero falta información)");
                            }
                        }
                        Err(e) => {
                            let err_msg = e.to_string();
                            if err_msg.contains("REVOKED") {
                                println!("Servidor: REVOCADO — el token fue revocado o es inválido");
                                println!("Acción: re-emparejar con `indra-daemon.exe --pair <CODIGO>`");
                            } else {
                                println!("Servidor: NO VERIFICADO (sin conexión?) — {}", err_msg);
                            }
                        }
                    }
                    return Ok(());
                }
            }
        }

        // --list-providers: show connected providers
        if cmd == "--list-providers" {
            let config = DaemonConfig::default();
            let db_path = PathBuf::from(&config.db_path);

            match cloud_client::read_token_from_disk(&db_path) {
                None => {
                    println!("Emparejado: NO — correr indra-daemon.exe --pair <CODIGO>");
                    return Ok(());
                }
                Some(token) => {
                    let cloud_url = std::env::var("INDRA_CLOUD_URL")
                        .unwrap_or_else(|_| "https://indra-next.vercel.app".to_string());

                    match cloud_client::fetch_providers(&cloud_url, &token).await {
                        Ok(json) => {
                            if let Some(providers) = json.get("providers").and_then(|v| v.as_array()) {
                                println!("{:<25} {:<10} {}", "ID", "Status", "Error");
                                println!("{:-<25} {:-<10} {}", "", "", "");
                                for provider in providers {
                                    let id = provider.get("id").and_then(|v| v.as_str()).unwrap_or("unknown");
                                    let status = provider.get("status").and_then(|v| v.as_str()).unwrap_or("unknown");
                                    let error = provider.get("error").and_then(|v| v.as_str()).unwrap_or("");
                                    println!("{:<25} {:<10} {}", id, status, error);
                                }
                            } else {
                                println!("No providers found or empty response");
                            }
                        }
                        Err(e) => {
                            let err_msg = e.to_string();
                            if err_msg.contains("REVOKED") {
                                eprintln!("Servidor: REVOCADO — re-emparejar con `indra-daemon.exe --pair <CODIGO>`");
                            } else {
                                eprintln!("Failed to fetch providers: {}", err_msg);
                            }
                            return Err(e);
                        }
                    }
                    return Ok(());
                }
            }
        }

        // --list-files: show recently tracked files
        if cmd == "--list-files" {
            let config = DaemonConfig::default();
            let db_path = PathBuf::from(&config.db_path);

            // Construct Indra Drive path (same as normal daemon initialization)
            let indra_drive = if cfg!(target_os = "windows") {
                let username = std::env::var("USERNAME").unwrap_or_else(|_| "User".to_string());
                PathBuf::from(format!(r"C:\Users\{}\Indra Drive", username))
            } else {
                PathBuf::from(std::env::var("HOME").unwrap_or_else(|_| ".".to_string()))
                    .join("Indra Drive")
            };

            // Initialize only LocalFsProvider and SyncEngine (no gRPC, no watcher, no heartbeat)
            let fs_provider = LocalFsProvider::new(indra_drive);

            match indra_core::engine::SyncEngine::new(fs_provider, &db_path).await {
                Ok(engine) => {
                    match engine.list_recent(200).await {
                        Ok(entries) => {
                            println!("{:<60} {:<15} {:<20}", "Path", "State", "Size (bytes)");
                            println!("{:-<60} {:-<15} {:-<20}", "", "", "");
                            for entry in entries {
                                // Truncate by chars, not bytes — byte-index slicing (e.g.
                                // `&s[..60]`) panics if the cut lands inside a multi-byte
                                // UTF-8 character, which real filenames (tildes, ñ) can hit.
                                let path_str: String =
                                    entry.path.to_string_lossy().chars().take(60).collect();
                                let state_str = format!("{:?}", entry.state);
                                let size_str = format!("{}", entry.local_metadata.size);
                                println!("{:<60} {:<15} {:<20}",
                                    path_str,
                                    &state_str[..15.min(state_str.len())],
                                    size_str
                                );
                            }
                        }
                        Err(e) => {
                            eprintln!("Failed to list files: {}", e);
                            return Err(anyhow::anyhow!("Failed to list files: {}", e));
                        }
                    }
                }
                Err(e) => {
                    eprintln!("Failed to initialize SyncEngine: {}", e);
                    return Err(anyhow::anyhow!("Failed to initialize SyncEngine: {}", e));
                }
            }
            return Ok(());
        }
    }

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

    // Check for cloud token and start heartbeat if paired
    let db_path = PathBuf::from(&config.db_path);
    if let Some(token) = cloud_client::read_token_from_disk(&db_path) {
        let cloud_url = std::env::var("INDRA_CLOUD_URL")
            .unwrap_or_else(|_| "https://indra-next.vercel.app".to_string());
        let heartbeat_engine = engine.clone();
        let indra_drive_clone = indra_drive.clone();
        tokio::spawn(async move {
            cloud_client::start_heartbeat_loop(cloud_url, token, heartbeat_engine, indra_drive_clone).await;
        });
        tracing::info!("Cloud sync enabled - heartbeat loop started");
    } else {
        tracing::warn!("No emparejado con la nube — correr `indra-daemon.exe --pair <CODIGO>` para habilitar sync");
    }

    tracing::info!(
        "Indra daemon started successfully - Listening on {}",
        listen_addr
    );

    // Wait for shutdown signal
    tokio::signal::ctrl_c().await?;
    tracing::info!("Shutting down Indra daemon");

    Ok(())
}
