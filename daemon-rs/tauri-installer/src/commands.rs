//! Installer commands exposed to frontend

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use crate::installer::{self, InstallationProgress};
use crate::platform;

#[derive(Serialize, Deserialize, Debug)]
pub struct SystemRequirements {
    pub os: String,
    pub arch: String,
    pub min_disk_space_gb: u64,
    pub available_disk_space_gb: u64,
    pub is_compatible: bool,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct InstallationConfig {
    pub device_name: String,
    pub storage_path: PathBuf,
}

/// Check system requirements before installation
#[tauri::command]
pub async fn check_requirements() -> Result<SystemRequirements, String> {
    tracing::info!("Checking system requirements");

    let os = std::env::consts::OS.to_string();
    let arch = std::env::consts::ARCH.to_string();
    let min_disk_space_gb = 10;

    let available = platform::get_available_disk_space()
        .map_err(|e| e.to_string())?;

    let is_compatible = matches!(os.as_str(), "windows" | "linux" | "macos")
        && available > min_disk_space_gb;

    Ok(SystemRequirements {
        os,
        arch,
        min_disk_space_gb,
        available_disk_space_gb: available,
        is_compatible,
    })
}

/// Download daemon binary with checksum validation
#[tauri::command]
pub async fn download_daemon(
    daemon_version: String,
    on_progress: tauri::ipc::Channel<InstallationProgress>,
) -> Result<PathBuf, String> {
    tracing::info!("Downloading daemon version: {}", daemon_version);

    installer::download_daemon(&daemon_version, on_progress)
        .await
        .map_err(|e| e.to_string())
}

/// Install daemon and register with system
#[tauri::command]
pub async fn install_daemon(
    config: InstallationConfig,
    daemon_path: PathBuf,
    on_progress: tauri::ipc::Channel<InstallationProgress>,
) -> Result<(), String> {
    tracing::info!("Installing daemon to: {:?}", config.storage_path);

    installer::install_daemon(&config, &daemon_path, on_progress)
        .await
        .map_err(|e| e.to_string())
}

/// Create and initialize storage folder structure
#[tauri::command]
pub async fn create_storage_folder(
    path: PathBuf,
) -> Result<(), String> {
    tracing::info!("Creating storage folder at: {:?}", path);

    installer::create_storage_folder(&path)
        .map_err(|e| e.to_string())
}

/// Validate installation integrity
#[tauri::command]
pub async fn validate_installation() -> Result<bool, String> {
    tracing::info!("Validating installation");

    platform::validate_daemon_service()
        .map_err(|e| e.to_string())
}

/// Uninstall daemon and clean up system registration
#[tauri::command]
pub async fn uninstall_daemon(
    on_progress: tauri::ipc::Channel<InstallationProgress>,
) -> Result<(), String> {
    tracing::info!("Uninstalling daemon");

    installer::uninstall_daemon(on_progress)
        .await
        .map_err(|e| e.to_string())
}

/// Get current installation status
#[tauri::command]
pub async fn get_installation_status() -> Result<String, String> {
    tracing::info!("Getting installation status");

    match platform::get_daemon_status() {
        Ok(status) => Ok(status),
        Err(e) => Err(e.to_string()),
    }
}
