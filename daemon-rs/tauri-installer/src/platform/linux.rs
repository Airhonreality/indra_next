//! Linux-specific installation logic

use anyhow::{anyhow, Result};
use std::path::PathBuf;
use std::process::Command;
use std::fs;

use crate::commands::InstallationConfig;

const SERVICE_NAME: &str = "indra-storage-sync";
const DBUS_SERVICE_NAME: &str = "com.indra.StorageSync";

/// Get available disk space in GB for Linux
pub fn get_available_disk_space() -> Result<u64> {
    let output = Command::new("df")
        .args(&["-BG", "/"])
        .output()?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let lines: Vec<&str> = stdout.lines().collect();

    if lines.len() > 1 {
        let parts: Vec<&str> = lines[1].split_whitespace().collect();
        if parts.len() >= 4 {
            if let Ok(available) = parts[3].trim_end_matches('G').parse::<u64>() {
                return Ok(available);
            }
        }
    }

    Ok(100) // Fallback
}

/// Install service on Linux
pub fn install_service(config: &InstallationConfig, daemon_path: &PathBuf) -> Result<()> {
    tracing::info!("Installing Linux service: {}", SERVICE_NAME);

    let daemon_path_str = daemon_path.to_string_lossy();
    let home_dir = dirs::home_dir().ok_or_else(|| anyhow!("Could not determine home directory"))?;

    // Create systemd user service directory
    let systemd_dir = home_dir.join(".config/systemd/user");
    fs::create_dir_all(&systemd_dir)?;

    // Write systemd service file
    let service_content = format!(
        r#"[Unit]
Description=Indra Storage Sync
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart={} --device-name "{}" --storage-path "{}"
Restart=on-failure
RestartSec=10s

[Install]
WantedBy=default.target
"#,
        daemon_path_str,
        config.device_name,
        config.storage_path.display()
    );

    let service_file = systemd_dir.join(&format!("{}.service", SERVICE_NAME));
    fs::write(&service_file, service_content)?;

    tracing::info!("Wrote systemd service to: {:?}", service_file);

    // Register D-Bus service
    register_dbus_service()?;

    // Enable service
    Command::new("systemctl")
        .args(&["--user", "daemon-reload"])
        .output()?;

    Command::new("systemctl")
        .args(&["--user", "enable", &format!("{}.service", SERVICE_NAME)])
        .output()?;

    tracing::info!("Service installed and enabled successfully");
    Ok(())
}

/// Uninstall service on Linux
pub fn uninstall_service() -> Result<()> {
    tracing::info!("Uninstalling Linux service: {}", SERVICE_NAME);

    // Stop and disable service
    Command::new("systemctl")
        .args(&["--user", "stop", &format!("{}.service", SERVICE_NAME)])
        .output()
        .ok();

    Command::new("systemctl")
        .args(&["--user", "disable", &format!("{}.service", SERVICE_NAME)])
        .output()
        .ok();

    // Remove service file
    let home_dir = dirs::home_dir().ok_or_else(|| anyhow!("Could not determine home directory"))?;
    let service_file = home_dir.join(&format!(
        ".config/systemd/user/{}.service",
        SERVICE_NAME
    ));

    if service_file.exists() {
        fs::remove_file(&service_file)?;
    }

    // Reload systemd
    Command::new("systemctl")
        .args(&["--user", "daemon-reload"])
        .output()
        .ok();

    // Remove D-Bus service
    remove_dbus_service().ok();

    tracing::info!("Service uninstalled successfully");
    Ok(())
}

/// Start the service
pub fn start_service() -> Result<()> {
    tracing::info!("Starting service: {}", SERVICE_NAME);

    let output = Command::new("systemctl")
        .args(&["--user", "start", &format!("{}.service", SERVICE_NAME)])
        .output()?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(anyhow!("Failed to start service: {}", stderr));
    }

    Ok(())
}

/// Stop the service
pub fn stop_service() -> Result<()> {
    tracing::info!("Stopping service: {}", SERVICE_NAME);

    Command::new("systemctl")
        .args(&["--user", "stop", &format!("{}.service", SERVICE_NAME)])
        .output()
        .ok();

    Ok(())
}

/// Validate service is running
pub fn validate_service() -> Result<bool> {
    tracing::info!("Validating service: {}", SERVICE_NAME);

    let output = Command::new("systemctl")
        .args(&["--user", "is-active", &format!("{}.service", SERVICE_NAME)])
        .output()?;

    Ok(output.status.success())
}

/// Get service status
pub fn get_service_status() -> Result<String> {
    let output = Command::new("systemctl")
        .args(&["--user", "is-active", &format!("{}.service", SERVICE_NAME)])
        .output()?;

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();

    if stdout == "active" {
        Ok("running".to_string())
    } else if stdout == "inactive" {
        Ok("stopped".to_string())
    } else {
        Ok(stdout)
    }
}

// Helper functions

fn register_dbus_service() -> Result<()> {
    tracing::info!("Registering D-Bus service");

    let home_dir = dirs::home_dir().ok_or_else(|| anyhow!("Could not determine home directory"))?;
    let dbus_dir = home_dir.join(".local/share/dbus-1/services");
    fs::create_dir_all(&dbus_dir)?;

    let service_content = format!(
        r#"[D-BUS Service]
Name={}
Exec=
"#,
        DBUS_SERVICE_NAME
    );

    let service_file = dbus_dir.join(&format!("{}.service", DBUS_SERVICE_NAME));
    fs::write(&service_file, service_content)?;

    tracing::info!("D-Bus service registered at: {:?}", service_file);
    Ok(())
}

fn remove_dbus_service() -> Result<()> {
    tracing::info!("Removing D-Bus service");

    let home_dir = dirs::home_dir().ok_or_else(|| anyhow!("Could not determine home directory"))?;
    let service_file = home_dir.join(&format!(
        ".local/share/dbus-1/services/{}.service",
        DBUS_SERVICE_NAME
    ));

    if service_file.exists() {
        fs::remove_file(&service_file)?;
    }

    Ok(())
}
