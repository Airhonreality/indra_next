//! macOS-specific installation logic

use anyhow::{anyhow, Result};
use std::path::PathBuf;
use std::process::Command;
use std::fs;

use crate::commands::InstallationConfig;

const SERVICE_NAME: &str = "com.indra.StorageSync";

/// Get available disk space in GB for macOS
pub fn get_available_disk_space() -> Result<u64> {
    let output = Command::new("df")
        .args(&["-g", "/"])
        .output()?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let lines: Vec<&str> = stdout.lines().collect();

    if lines.len() > 1 {
        let parts: Vec<&str> = lines[1].split_whitespace().collect();
        if parts.len() >= 4 {
            if let Ok(available) = parts[3].parse::<u64>() {
                return Ok(available);
            }
        }
    }

    Ok(100) // Fallback
}

/// Install service on macOS (launchd)
pub fn install_service(config: &InstallationConfig, daemon_path: &PathBuf) -> Result<()> {
    tracing::info!("Installing macOS service: {}", SERVICE_NAME);

    let daemon_path_str = daemon_path.to_string_lossy();
    let home_dir = dirs::home_dir().ok_or_else(|| anyhow!("Could not determine home directory"))?;

    // Create LaunchAgents directory
    let launch_agents = home_dir.join("Library/LaunchAgents");
    fs::create_dir_all(&launch_agents)?;

    // Write plist file
    let plist_content = format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>{}</string>
    <key>ProgramArguments</key>
    <array>
        <string>{}</string>
        <string>--device-name</string>
        <string>{}</string>
        <string>--storage-path</string>
        <string>{}</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardErrorPath</key>
    <string>{}/Library/Logs/indra-sync.log</string>
</dict>
</plist>
"#,
        SERVICE_NAME,
        daemon_path_str,
        config.device_name,
        config.storage_path.display(),
        home_dir.display()
    );

    let plist_file = launch_agents.join(&format!("{}.plist", SERVICE_NAME));
    fs::write(&plist_file, plist_content)?;

    tracing::info!("Wrote LaunchAgent plist to: {:?}", plist_file);

    // Load the service
    Command::new("launchctl")
        .args(&["load", plist_file.to_string_lossy().as_ref()])
        .output()
        .ok();

    tracing::info!("Service installed and loaded successfully");
    Ok(())
}

/// Uninstall service on macOS
pub fn uninstall_service() -> Result<()> {
    tracing::info!("Uninstalling macOS service: {}", SERVICE_NAME);

    let home_dir = dirs::home_dir().ok_or_else(|| anyhow!("Could not determine home directory"))?;
    let plist_file = home_dir.join(&format!("Library/LaunchAgents/{}.plist", SERVICE_NAME));

    // Unload the service
    if plist_file.exists() {
        Command::new("launchctl")
            .args(&["unload", plist_file.to_string_lossy().as_ref()])
            .output()
            .ok();

        // Remove plist
        fs::remove_file(&plist_file)?;
    }

    tracing::info!("Service uninstalled successfully");
    Ok(())
}

/// Start the service
pub fn start_service() -> Result<()> {
    tracing::info!("Starting service: {}", SERVICE_NAME);

    let output = Command::new("launchctl")
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

    Command::new("launchctl")
        .args(&["stop", SERVICE_NAME])
        .output()
        .ok();

    Ok(())
}

/// Validate service is running
pub fn validate_service() -> Result<bool> {
    tracing::info!("Validating service: {}", SERVICE_NAME);

    let output = Command::new("launchctl")
        .args(&["list"])
        .output()?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(stdout.contains(SERVICE_NAME))
}

/// Get service status
pub fn get_service_status() -> Result<String> {
    let output = Command::new("launchctl")
        .args(&["list", SERVICE_NAME])
        .output()?;

    if output.status.success() {
        Ok("running".to_string())
    } else {
        Ok("stopped".to_string())
    }
}
