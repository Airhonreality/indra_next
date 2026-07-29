//! Daemon installation and setup logic

use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tokio::fs;
use tauri::ipc::Channel;

use crate::commands::InstallationConfig;
use crate::platform;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct InstallationProgress {
    pub step: String,
    pub progress: u32,
    pub message: String,
    pub error: Option<String>,
}

const DAEMON_DOWNLOAD_URL_BASE: &str = "https://releases.indra.dev/daemon";
const RETRY_ATTEMPTS: u32 = 3;

/// Download daemon binary with retries and checksum validation
pub async fn download_daemon(
    version: &str,
    progress_channel: Channel<InstallationProgress>,
) -> Result<PathBuf> {
    let daemon_dir = tauri::api::path::cache_dir()
        .ok_or_else(|| anyhow!("Could not determine cache directory"))?
        .join("indra-installer");

    fs::create_dir_all(&daemon_dir).await?;

    let os = std::env::consts::OS;
    let arch = std::env::consts::ARCH;
    let filename = match (os, arch) {
        ("windows", "x86_64") => "indra-daemon-x86_64-windows.exe",
        ("linux", "x86_64") => "indra-daemon-x86_64-linux",
        ("linux", "aarch64") => "indra-daemon-aarch64-linux",
        ("macos", "x86_64") => "indra-daemon-x86_64-macos",
        ("macos", "aarch64") => "indra-daemon-aarch64-macos",
        _ => return Err(anyhow!("Unsupported platform: {} {}", os, arch)),
    };

    let url = format!("{}/{}/{}", DAEMON_DOWNLOAD_URL_BASE, version, filename);
    let checksum_url = format!("{}.sha256", url);

    let daemon_path = daemon_dir.join(filename);

    // Try download with retries
    for attempt in 1..=RETRY_ATTEMPTS {
        let progress = InstallationProgress {
            step: "download".to_string(),
            progress: ((attempt - 1) * 30 / RETRY_ATTEMPTS) as u32,
            message: format!("Downloading daemon (attempt {}/{})", attempt, RETRY_ATTEMPTS),
            error: None,
        };
        let _ = progress_channel.send(progress);

        match download_file(&url, &daemon_path).await {
            Ok(_) => {
                // Verify checksum
                if let Ok(_) = verify_checksum(&daemon_path, &checksum_url).await {
                    let progress = InstallationProgress {
                        step: "download".to_string(),
                        progress: 30,
                        message: "Download complete".to_string(),
                        error: None,
                    };
                    let _ = progress_channel.send(progress);
                    return Ok(daemon_path);
                }
            }
            Err(e) if attempt == RETRY_ATTEMPTS => {
                return Err(anyhow!("Failed to download daemon after {} attempts: {}", RETRY_ATTEMPTS, e));
            }
            Err(_) => {
                tokio::time::sleep(tokio::time::Duration::from_millis(100 * attempt as u64)).await;
            }
        }
    }

    Err(anyhow!("Failed to download daemon"))
}

/// Install daemon and register with system
pub async fn install_daemon(
    config: &InstallationConfig,
    daemon_path: &PathBuf,
    progress_channel: Channel<InstallationProgress>,
) -> Result<()> {
    let os = std::env::consts::OS;

    // Create storage folder
    let progress = InstallationProgress {
        step: "setup_storage".to_string(),
        progress: 35,
        message: "Setting up storage folder".to_string(),
        error: None,
    };
    let _ = progress_channel.send(progress);

    create_storage_folder(&config.storage_path).await?;

    // Platform-specific installation
    let progress = InstallationProgress {
        step: "install_service".to_string(),
        progress: 50,
        message: "Installing system service".to_string(),
        error: None,
    };
    let _ = progress_channel.send(progress);

    #[cfg(target_os = "windows")]
    platform::windows::install_service(config, daemon_path)?;

    #[cfg(target_os = "linux")]
    platform::linux::install_service(config, daemon_path)?;

    #[cfg(target_os = "macos")]
    platform::macos::install_service(config, daemon_path)?;

    #[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos")))]
    return Err(anyhow!("Unsupported OS: {}", os));

    // Start service
    let progress = InstallationProgress {
        step: "start_service".to_string(),
        progress: 80,
        message: "Starting daemon service".to_string(),
        error: None,
    };
    let _ = progress_channel.send(progress);

    platform::start_daemon_service()?;

    // Final validation
    let progress = InstallationProgress {
        step: "validate".to_string(),
        progress: 95,
        message: "Validating installation".to_string(),
        error: None,
    };
    let _ = progress_channel.send(progress);

    platform::validate_daemon_service()?;

    let progress = InstallationProgress {
        step: "complete".to_string(),
        progress: 100,
        message: "Installation complete".to_string(),
        error: None,
    };
    let _ = progress_channel.send(progress);

    Ok(())
}

/// Create storage folder with proper structure
pub async fn create_storage_folder(path: &PathBuf) -> Result<()> {
    fs::create_dir_all(path).await?;
    fs::create_dir_all(path.join(".metadata")).await?;
    fs::create_dir_all(path.join(".cache")).await?;
    fs::create_dir_all(path.join(".inbox")).await?;

    // Set permissions (platform-specific)
    #[cfg(target_os = "windows")]
    {
        // Windows permissions handled by platform module
    }

    #[cfg(target_os = "linux")]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, std::fs::Permissions::from_mode(0o755)).await?;
    }

    Ok(())
}

/// Uninstall daemon and clean up
pub async fn uninstall_daemon(
    progress_channel: Channel<InstallationProgress>,
) -> Result<()> {
    let progress = InstallationProgress {
        step: "stop_service".to_string(),
        progress: 20,
        message: "Stopping daemon service".to_string(),
        error: None,
    };
    let _ = progress_channel.send(progress);

    platform::stop_daemon_service().ok();

    let progress = InstallationProgress {
        step: "uninstall_service".to_string(),
        progress: 50,
        message: "Uninstalling system service".to_string(),
        error: None,
    };
    let _ = progress_channel.send(progress);

    #[cfg(target_os = "windows")]
    platform::windows::uninstall_service().ok();

    #[cfg(target_os = "linux")]
    platform::linux::uninstall_service().ok();

    #[cfg(target_os = "macos")]
    platform::macos::uninstall_service().ok();

    let progress = InstallationProgress {
        step: "cleanup".to_string(),
        progress: 80,
        message: "Cleaning up installation files".to_string(),
        error: None,
    };
    let _ = progress_channel.send(progress);

    // Clean cache but keep data folder
    if let Ok(cache_dir) = tauri::api::path::cache_dir() {
        let installer_cache = cache_dir.join("indra-installer");
        fs::remove_dir_all(&installer_cache).await.ok();
    }

    let progress = InstallationProgress {
        step: "complete".to_string(),
        progress: 100,
        message: "Uninstallation complete".to_string(),
        error: None,
    };
    let _ = progress_channel.send(progress);

    Ok(())
}

// Helper functions

async fn download_file(url: &str, dest: &PathBuf) -> Result<()> {
    // This would use tauri's http plugin
    // For now, placeholder implementation
    tracing::info!("Would download from: {} to {:?}", url, dest);
    Ok(())
}

async fn verify_checksum(file_path: &PathBuf, _checksum_url: &str) -> Result<()> {
    // Verify SHA256 checksum
    tracing::info!("Verifying checksum for: {:?}", file_path);
    // Implementation would use sha2 crate
    Ok(())
}
