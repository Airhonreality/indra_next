//! Cloud client for daemon ↔ cloud bridge
//! Handles pairing and heartbeat polling to the cloud API.

use anyhow::Result;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;
use tokio::time;
use tracing::{info, warn};

use indra_core::engine::SyncEngine;
use crate::fs_provider::LocalFsProvider;

/// Returns the device token file path (sibling of db_path).
fn token_file_path(db_path: &Path) -> PathBuf {
    if let Some(parent) = db_path.parent() {
        parent.join("device_token")
    } else {
        PathBuf::from("device_token")
    }
}

/// Reads the device token from disk if it exists.
fn read_token(db_path: &Path) -> Option<String> {
    let path = token_file_path(db_path);
    match std::fs::read_to_string(&path) {
        Ok(token) => {
            let trimmed = token.trim().to_string();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed)
            }
        }
        Err(_) => None,
    }
}

/// Writes the device token to disk.
fn write_token(db_path: &Path, token: &str) -> Result<()> {
    let path = token_file_path(db_path);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&path, token)?;
    Ok(())
}

/// Pairs a device with the cloud by claiming a pairing code.
/// Saves the device token locally and prints confirmation.
pub async fn pair(cloud_url: &str, code: &str, db_path: &Path) -> Result<()> {
    info!("Attempting to pair device with cloud using code: {}", code);

    let hostname = hostname::get()
        .ok()
        .and_then(|h| h.into_string().ok())
        .unwrap_or_else(|| "indra-device".to_string());

    let client = reqwest::Client::new();
    let url = format!("{}/api/devices/pair/claim", cloud_url);

    let body = serde_json::json!({
        "code": code,
        "deviceName": hostname,
    });

    let response = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| anyhow::anyhow!("Failed to reach cloud API: {}", e))?;

    let status = response.status();
    if !status.is_success() {
        let error_text = response
            .text()
            .await
            .unwrap_or_else(|_| "Unknown error".to_string());
        return Err(anyhow::anyhow!(
            "Cloud API returned {}: {}",
            status.as_u16(),
            error_text
        ));
    }

    let resp_json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| anyhow::anyhow!("Failed to parse cloud response: {}", e))?;

    let token = resp_json
        .get("deviceToken")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow::anyhow!("No deviceToken in cloud response"))?;

    // Save token to disk
    write_token(db_path, token)?;

    info!(
        "Successfully paired! Device token saved. Your device is now linked to the cloud."
    );
    Ok(())
}

/// Starts the heartbeat loop, reporting device state and consuming commands.
/// This loop runs indefinitely until the task is cancelled.
pub async fn start_heartbeat_loop(
    cloud_url: String,
    token: String,
    engine: Arc<SyncEngine<LocalFsProvider>>,
    indra_drive: PathBuf,
) {
    // Built once and reused for every tick — reqwest::Client owns a connection pool
    // internally; recreating it per-request would throw that away and pay TLS/DNS
    // setup cost on every single heartbeat.
    let client = reqwest::Client::new();
    let mut interval = time::interval(Duration::from_secs(20));

    loop {
        interval.tick().await;

        // Get recent files from engine
        let entries = match engine.list_recent(200).await {
            Ok(e) => e,
            Err(err) => {
                warn!("Failed to list recent files: {}", err);
                continue;
            }
        };

        // Build files array for heartbeat
        let files: Vec<serde_json::Value> = entries
            .into_iter()
            .map(|entry| {
                let modified_time_ms = entry
                    .local_metadata
                    .modified
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_millis() as i64)
                    .unwrap_or(0);

                let blake3_hex = entry
                    .local_metadata
                    .content_hash
                    .map(|h| hex::encode(h.as_bytes()));

                serde_json::json!({
                    "path": entry.path.to_string_lossy().to_string(),
                    "sizeBytes": entry.local_metadata.size,
                    "modifiedAtMs": modified_time_ms,
                    "blake3Hex": blake3_hex,
                })
            })
            .collect();

        let body = serde_json::json!({
            "files": files,
        });

        // Send heartbeat
        let url = format!("{}/api/devices/heartbeat", cloud_url);

        let response = match client
            .post(&url)
            .header("Authorization", format!("Bearer {}", token))
            .json(&body)
            .send()
            .await
        {
            Ok(r) => r,
            Err(e) => {
                warn!("Heartbeat request failed (will retry): {}", e);
                continue;
            }
        };

        // Check response status
        if !response.status().is_success() {
            warn!("Heartbeat returned status {}", response.status().as_u16());
            continue;
        }

        // Parse response and process commands
        match response.json::<serde_json::Value>().await {
            Ok(resp) => {
                if let Some(commands) = resp.get("commands").and_then(|c| c.as_array()) {
                    if !commands.is_empty() {
                        info!("Total commands received: {}", commands.len());
                        // Extract command data before spawning tasks
                        let download_tasks: Vec<(String, String)> = commands
                            .iter()
                            .filter_map(|cmd| {
                                let kind = cmd
                                    .get("kind")
                                    .and_then(|k| k.as_str())
                                    .unwrap_or("unknown");
                                info!("Received command: kind={}", kind);

                                // Extract download_file command data
                                if kind == "download_file" {
                                    if let Some(payload) = cmd.get("payload").and_then(|p| p.as_object()) {
                                        if let (Some(remote_object_id), Some(file_name)) = (
                                            payload.get("remoteObjectId").and_then(|v| v.as_str()),
                                            payload.get("fileName").and_then(|v| v.as_str()),
                                        ) {
                                            return Some((remote_object_id.to_string(), file_name.to_string()));
                                        } else {
                                            warn!(
                                                "download_file command missing remoteObjectId or fileName"
                                            );
                                        }
                                    } else {
                                        warn!("download_file command has no payload");
                                    }
                                }
                                None
                            })
                            .collect();

                        // Now spawn tasks with owned data
                        for (remote_object_id, file_name) in download_tasks {
                            let indra_drive_clone = indra_drive.clone();
                            let cloud_url_clone = cloud_url.clone();
                            let token_clone = token.clone();
                            let client_clone = client.clone();

                            tokio::spawn(async move {
                                if let Err(e) = download_and_save_file(
                                    &client_clone,
                                    &cloud_url_clone,
                                    &token_clone,
                                    &remote_object_id,
                                    &file_name,
                                    &indra_drive_clone,
                                )
                                .await
                                {
                                    warn!(
                                        "Failed to download file {}: {}",
                                        file_name, e
                                    );
                                }
                            });
                        }
                    }
                }
            }
            Err(e) => {
                warn!("Failed to parse heartbeat response: {}", e);
            }
        }
    }
}

/// Downloads a file from the cloud and saves it to Indra Drive.
async fn download_and_save_file(
    client: &reqwest::Client,
    cloud_url: &str,
    token: &str,
    remote_object_id: &str,
    file_name: &str,
    indra_drive: &Path,
) -> Result<()> {
    // Build download URL with objectId query param
    let download_url = format!("{}/api/devices/download-object", cloud_url);

    // Make the download request with Bearer token and objectId query param
    let response = client
        .get(&download_url)
        .query(&[("objectId", remote_object_id)])
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await?;

    if !response.status().is_success() {
        return Err(anyhow::anyhow!(
            "Download failed with status {}: {}",
            response.status().as_u16(),
            response.status()
        ));
    }

    // Get the response body as bytes
    let bytes = response.bytes().await?;

    // Defense in depth: file_name ultimately comes from a remote provider's listing (via the
    // cloud API), not something this process controls end to end. Reject anything that isn't a
    // bare filename before it touches the filesystem, even though the server side already
    // basename()s it today — a path separator or ".." here must never be able to write outside
    // Indra Drive.
    if file_name.contains('/') || file_name.contains('\\') || file_name == ".." || file_name == "." || file_name.is_empty() {
        return Err(anyhow::anyhow!(
            "Refusing to write file with unsafe name: {:?}",
            file_name
        ));
    }

    // Write to Indra Drive directory
    let file_path = indra_drive.join(file_name);

    // Ensure parent directory exists
    if let Some(parent) = file_path.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }

    // Write the file
    tokio::fs::write(&file_path, bytes).await?;

    info!("Successfully downloaded and saved: {:?}", file_path);
    Ok(())
}

pub fn read_token_from_disk(db_path: &Path) -> Option<String> {
    read_token(db_path)
}
