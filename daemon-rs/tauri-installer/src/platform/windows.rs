//! Windows-specific installation logic

use anyhow::{anyhow, Result};
use std::path::PathBuf;
use std::process::Command;

use crate::commands::InstallationConfig;

const SERVICE_NAME: &str = "IndraStorageSync";
const SERVICE_DISPLAY_NAME: &str = "Indra Storage Sync";

/// Get available disk space in GB for Windows
pub fn get_available_disk_space() -> Result<u64> {
    // Would use Windows API to get disk space
    // For now, estimate from environment
    Ok(100) // Placeholder
}

/// Install service on Windows
pub fn install_service(config: &InstallationConfig, daemon_path: &PathBuf) -> Result<()> {
    tracing::info!("Installing Windows service: {}", SERVICE_NAME);

    let daemon_path_str = daemon_path.to_string_lossy();
    let args = format!(
        r#""--device-name" "{}" "--storage-path" "{}""#,
        config.device_name,
        config.storage_path.display()
    );

    // Create service using sc.exe
    let output = Command::new("sc")
        .args(&[
            "create",
            SERVICE_NAME,
            &format!("binPath={} {}", daemon_path_str, args),
            "DisplayName=Indra Storage Sync",
            "type=own",
            "start=auto",
        ])
        .output()?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(anyhow!("Failed to create service: {}", stderr));
    }

    tracing::info!("Service created successfully");

    // Register COM DLL if needed
    register_com_dll()?;

    // Write registry entries
    write_registry_entries(config)?;

    Ok(())
}

/// Uninstall service on Windows
pub fn uninstall_service() -> Result<()> {
    tracing::info!("Uninstalling Windows service: {}", SERVICE_NAME);

    // Stop service first
    let _ = stop_service();

    // Remove service using sc.exe
    let output = Command::new("sc")
        .args(&["delete", SERVICE_NAME])
        .output()?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(anyhow!("Failed to delete service: {}", stderr));
    }

    // Remove registry entries
    remove_registry_entries()?;

    tracing::info!("Service uninstalled successfully");
    Ok(())
}

/// Start the service
pub fn start_service() -> Result<()> {
    tracing::info!("Starting service: {}", SERVICE_NAME);

    let output = Command::new("sc")
        .args(&["start", SERVICE_NAME])
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

    let output = Command::new("sc")
        .args(&["stop", SERVICE_NAME])
        .output()?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        // Don't error if service is already stopped
        tracing::warn!("Service stop output: {}", stderr);
    }

    Ok(())
}

/// Validate service is running
pub fn validate_service() -> Result<bool> {
    tracing::info!("Validating service: {}", SERVICE_NAME);

    let output = Command::new("sc")
        .args(&["query", SERVICE_NAME])
        .output()?;

    if !output.status.success() {
        return Ok(false);
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(stdout.contains("RUNNING"))
}

/// Get service status
pub fn get_service_status() -> Result<String> {
    let output = Command::new("sc")
        .args(&["query", SERVICE_NAME])
        .output()?;

    let stdout = String::from_utf8_lossy(&output.stdout);

    if stdout.contains("RUNNING") {
        Ok("running".to_string())
    } else if stdout.contains("STOPPED") {
        Ok("stopped".to_string())
    } else if stdout.contains("does not exist") {
        Ok("not_installed".to_string())
    } else {
        Ok("unknown".to_string())
    }
}

// Helper functions

fn register_com_dll() -> Result<()> {
    // Register COM DLL for CFAPI integration
    // This would use regsvr32.exe for COM components
    tracing::info!("Registering COM DLL");

    // Placeholder: actual implementation would register specific DLLs
    // if let Some(dll_path) = find_com_dll() {
    //     Command::new("regsvr32").arg("/s").arg(dll_path).output()?;
    // }

    Ok(())
}

fn write_registry_entries(config: &InstallationConfig) -> Result<()> {
    tracing::info!("Writing registry entries");

    // Write to HKCU\Software\Indra\IndraStorageSync
    // This would use winreg crate to write:
    // - version
    // - state
    // - install_path
    // - device_name

    // Placeholder implementation
    let output = Command::new("reg")
        .args(&[
            "add",
            "HKCU\\Software\\Indra\\IndraStorageSync",
            "/v",
            "DeviceName",
            "/d",
            &config.device_name,
            "/f",
        ])
        .output()?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(anyhow!("Failed to write registry: {}", stderr));
    }

    Ok(())
}

fn remove_registry_entries() -> Result<()> {
    tracing::info!("Removing registry entries");

    let output = Command::new("reg")
        .args(&[
            "delete",
            "HKCU\\Software\\Indra\\IndraStorageSync",
            "/f",
        ])
        .output()?;

    if !output.status.success() {
        // Don't fail if key doesn't exist
        tracing::warn!("Could not delete registry key");
    }

    Ok(())
}
