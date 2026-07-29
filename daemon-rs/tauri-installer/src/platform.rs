//! Platform-specific installation and service management

use anyhow::Result;
use std::path::PathBuf;

#[cfg(target_os = "windows")]
pub mod windows;

#[cfg(target_os = "linux")]
pub mod linux;

#[cfg(target_os = "macos")]
pub mod macos;

use crate::commands::InstallationConfig;

/// Get available disk space in GB
pub fn get_available_disk_space() -> Result<u64> {
    #[cfg(target_os = "windows")]
    return windows::get_available_disk_space();

    #[cfg(target_os = "linux")]
    return linux::get_available_disk_space();

    #[cfg(target_os = "macos")]
    return macos::get_available_disk_space();

    #[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos")))]
    {
        return Err(anyhow::anyhow!("Unsupported OS"));
    }
}

/// Start the daemon service
pub fn start_daemon_service() -> Result<()> {
    #[cfg(target_os = "windows")]
    return windows::start_service();

    #[cfg(target_os = "linux")]
    return linux::start_service();

    #[cfg(target_os = "macos")]
    return macos::start_service();

    #[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos")))]
    {
        return Err(anyhow::anyhow!("Unsupported OS"));
    }
}

/// Stop the daemon service
pub fn stop_daemon_service() -> Result<()> {
    #[cfg(target_os = "windows")]
    return windows::stop_service();

    #[cfg(target_os = "linux")]
    return linux::stop_service();

    #[cfg(target_os = "macos")]
    return macos::stop_service();

    #[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos")))]
    {
        return Err(anyhow::anyhow!("Unsupported OS"));
    }
}

/// Validate daemon service is running
pub fn validate_daemon_service() -> Result<bool> {
    #[cfg(target_os = "windows")]
    return windows::validate_service();

    #[cfg(target_os = "linux")]
    return linux::validate_service();

    #[cfg(target_os = "macos")]
    return macos::validate_service();

    #[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos")))]
    {
        return Err(anyhow::anyhow!("Unsupported OS"));
    }
}

/// Get daemon service status
pub fn get_daemon_status() -> Result<String> {
    #[cfg(target_os = "windows")]
    return windows::get_service_status();

    #[cfg(target_os = "linux")]
    return linux::get_service_status();

    #[cfg(target_os = "macos")]
    return macos::get_service_status();

    #[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos")))]
    {
        return Err(anyhow::anyhow!("Unsupported OS"));
    }
}
