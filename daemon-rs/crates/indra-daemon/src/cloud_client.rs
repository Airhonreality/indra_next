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

        // Parse response and log commands
        match response.json::<serde_json::Value>().await {
            Ok(resp) => {
                if let Some(commands) = resp.get("commands").and_then(|c| c.as_array()) {
                    if !commands.is_empty() {
                        for cmd in commands {
                            let kind = cmd
                                .get("kind")
                                .and_then(|k| k.as_str())
                                .unwrap_or("unknown");
                            info!("Received command: kind={}", kind);
                        }
                        info!("Total commands received: {}", commands.len());
                    }
                }
            }
            Err(e) => {
                warn!("Failed to parse heartbeat response: {}", e);
            }
        }
    }
}

pub fn read_token_from_disk(db_path: &Path) -> Option<String> {
    read_token(db_path)
}
