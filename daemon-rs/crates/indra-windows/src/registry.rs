//! Windows Registry Configuration for Indra Sync Provider

use anyhow::{anyhow, Result};
use std::ffi::OsStr;
use std::os::windows::ffi::OsStrExt;
use uuid::Uuid;
use windows::Win32::System::Registry::*;
use windows::Win32::Foundation::ERROR_SUCCESS;
use windows::core::PCWSTR;
use tracing::debug;

/// Configuration for the Indra storage provider in Windows Registry
#[derive(Debug, Clone)]
pub struct ProviderConfig {
    /// Mount point path (e.g., "C:\\Users\\username\\Indra Drive")
    pub mount_point: String,
    /// Display name for the provider
    pub display_name: String,
    /// COM CLSID for the thumbnail provider
    pub handler_clsid: String,
    /// Hash algorithm for remote deduplication
    pub hash_algorithm: String,
    /// WOPI service identifier for Office 365 integration
    pub wopi_service_id: Option<String>,
}

impl Default for ProviderConfig {
    fn default() -> Self {
        Self {
            mount_point: format!(
                "C:\\Users\\{}\\Indra Drive",
                std::env::var("USERNAME").unwrap_or_else(|_| "User".to_string())
            ),
            display_name: "Indra Drive".to_string(),
            handler_clsid: Uuid::new_v4().to_string(),
            hash_algorithm: "BLAKE3".to_string(),
            wopi_service_id: Some("indra-drive-sync-service".to_string()),
        }
    }
}

/// Helper: Convert &str to wide null-terminated string for Windows API
fn str_to_wide(s: &str) -> Vec<u16> {
    let os_str: &OsStr = s.as_ref();
    os_str
        .encode_wide()
        .chain(std::iter::once(0))
        .collect()
}

/// Helper: Set a registry value (REG_SZ)
unsafe fn set_registry_string(
    hkey: HKEY,
    value_name: &str,
    value: &str,
) -> Result<()> {
    let mut value_name_wide = str_to_wide(value_name);
    let mut value_wide = str_to_wide(value);

    // Convert the wide string to bytes (excluding null terminator for the data)
    let value_bytes = std::slice::from_raw_parts(
        value_wide.as_ptr() as *const u8,
        (value_wide.len() - 1) * 2,
    );

    let result = RegSetValueExW(
        hkey,
        PCWSTR(value_name_wide.as_mut_ptr()),
        0,
        REG_SZ,
        Some(value_bytes),
    );

    if result == ERROR_SUCCESS {
        debug!("Registry value set: {}", value_name);
        Ok(())
    } else {
        Err(anyhow!(
            "Failed to set registry value {}: error {:#x}",
            value_name,
            result.0
        ))
    }
}

/// Register the Indra provider in Windows Registry
///
/// Creates/updates the registry key:
/// HKCU\\SOFTWARE\\SyncEngines\\Providers\\Indra
///
/// # Arguments
/// * `config` - Provider configuration
///
/// # Returns
/// * `Ok(())` if registration succeeded
/// * `Err` if registration failed
pub fn register_provider(config: &ProviderConfig) -> Result<()> {
    tracing::info!(
        mount_point = %config.mount_point,
        display_name = %config.display_name,
        "Registering Indra provider in Windows Registry"
    );

    if config.mount_point.is_empty() {
        return Err(anyhow!("Mount point cannot be empty"));
    }

    if config.display_name.is_empty() {
        return Err(anyhow!("Display name cannot be empty"));
    }

    unsafe {
        // Open or create the registry key
        let reg_path = r#"SOFTWARE\SyncEngines\Providers\Indra"#;
        let mut reg_path_wide = str_to_wide(reg_path);

        let mut hkey: HKEY = Default::default();
        let result = RegCreateKeyExW(
            HKEY_CURRENT_USER,
            PCWSTR(reg_path_wide.as_mut_ptr()),
            0,
            None,
            REG_OPTION_NON_VOLATILE,
            KEY_WRITE,
            None,
            &mut hkey,
            None,
        );

        if result != ERROR_SUCCESS {
            return Err(anyhow!(
                "Failed to create registry key: error {:#x}",
                result.0
            ));
        }

        // Set registry values
        set_registry_string(hkey, "MountPoint", &config.mount_point)?;
        set_registry_string(hkey, "DisplayName", &config.display_name)?;
        set_registry_string(hkey, "Handler", &config.handler_clsid)?;
        set_registry_string(hkey, "HashAlgorithm", &config.hash_algorithm)?;

        if let Some(ref wopi_service_id) = config.wopi_service_id {
            set_registry_string(hkey, "WOPIServiceId", wopi_service_id)?;
        }

        // Close the registry key
        let _ = RegCloseKey(hkey);

        tracing::info!(
            "Indra provider registered in Windows Registry"
        );

        Ok(())
    }
}

/// Unregister the Indra provider from Windows Registry
pub fn unregister_provider() -> Result<()> {
    tracing::info!("Unregistering Indra provider from Windows Registry");

    unsafe {
        let reg_path = r#"SOFTWARE\SyncEngines\Providers"#;
        let mut reg_path_wide = str_to_wide(reg_path);

        let result = RegDeleteTreeW(HKEY_CURRENT_USER, PCWSTR(reg_path_wide.as_mut_ptr()));

        if result == ERROR_SUCCESS {
            tracing::info!("Indra provider unregistered from Windows Registry");
            Ok(())
        } else {
            Err(anyhow!(
                "Failed to unregister provider: error {:#x}",
                result.0
            ))
        }
    }
}

/// Helper: Read a registry string value
unsafe fn get_registry_string(hkey: HKEY, value_name: &str) -> Result<String> {
    let mut value_name_wide = str_to_wide(value_name);
    let mut buffer: [u8; 512] = [0; 512];
    let mut size: u32 = buffer.len() as u32;

    let result = RegQueryValueExW(
        hkey,
        PCWSTR(value_name_wide.as_mut_ptr()),
        None,
        None,
        Some(buffer.as_mut_ptr()),
        Some(&mut size),
    );

    if result == ERROR_SUCCESS {
        // Convert from UTF-16
        let wide_str = std::slice::from_raw_parts(
            buffer.as_ptr() as *const u16,
            (size as usize) / 2,
        );
        let s = String::from_utf16_lossy(wide_str).to_string();
        // Remove null terminator if present
        Ok(s.trim_end_matches('\0').to_string())
    } else {
        Err(anyhow!(
            "Failed to read registry value {}: error {:#x}",
            value_name,
            result.0
        ))
    }
}

/// Verify that the provider is registered
pub fn verify_provider_registration() -> Result<()> {
    tracing::info!("Verifying Indra provider registration");

    unsafe {
        let reg_path = r#"SOFTWARE\SyncEngines\Providers\Indra"#;
        let mut reg_path_wide = str_to_wide(reg_path);

        let mut hkey: HKEY = Default::default();
        let result = RegOpenKeyExW(
            HKEY_CURRENT_USER,
            PCWSTR(reg_path_wide.as_mut_ptr()),
            0,
            KEY_READ,
            &mut hkey,
        );

        if result != ERROR_SUCCESS {
            return Err(anyhow!(
                "Indra provider not registered: error {:#x}",
                result.0
            ));
        }

        // Check required values exist
        let required_values = ["MountPoint", "DisplayName", "Handler", "HashAlgorithm"];
        for value_name in &required_values {
            if let Err(e) = get_registry_string(hkey, value_name) {
                let _ = RegCloseKey(hkey);
                return Err(anyhow!(
                    "Missing required registry value '{}': {}",
                    value_name,
                    e
                ));
            }
        }

        let _ = RegCloseKey(hkey);
        tracing::info!("Indra provider registration verified");
        Ok(())
    }
}

/// Get current provider configuration from Registry
pub fn get_provider_config() -> Result<ProviderConfig> {
    tracing::info!("Reading Indra provider configuration from Registry");

    unsafe {
        let reg_path = r#"SOFTWARE\SyncEngines\Providers\Indra"#;
        let mut reg_path_wide = str_to_wide(reg_path);

        let mut hkey: HKEY = Default::default();
        let result = RegOpenKeyExW(
            HKEY_CURRENT_USER,
            PCWSTR(reg_path_wide.as_mut_ptr()),
            0,
            KEY_READ,
            &mut hkey,
        );

        if result != ERROR_SUCCESS {
            debug!("Registry key not found, returning default config");
            return Ok(ProviderConfig::default());
        }

        let mount_point = get_registry_string(hkey, "MountPoint")
            .unwrap_or_else(|_| ProviderConfig::default().mount_point);
        let display_name = get_registry_string(hkey, "DisplayName")
            .unwrap_or_else(|_| ProviderConfig::default().display_name);
        let handler_clsid = get_registry_string(hkey, "Handler")
            .unwrap_or_else(|_| Uuid::new_v4().to_string());
        let hash_algorithm = get_registry_string(hkey, "HashAlgorithm")
            .unwrap_or_else(|_| "BLAKE3".to_string());
        let wopi_service_id = get_registry_string(hkey, "WOPIServiceId").ok();

        let _ = RegCloseKey(hkey);

        Ok(ProviderConfig {
            mount_point,
            display_name,
            handler_clsid,
            hash_algorithm,
            wopi_service_id,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = ProviderConfig::default();
        assert!(!config.mount_point.is_empty());
        assert_eq!(config.display_name, "Indra Drive");
        assert_eq!(config.hash_algorithm, "BLAKE3");
    }

    #[test]
    fn test_register_provider_validation() {
        let mut config = ProviderConfig::default();

        // Test with empty mount point
        config.mount_point.clear();
        assert!(register_provider(&config).is_err());

        // Test with valid config
        config.mount_point = "C:\\Users\\Test\\Indra Drive".to_string();
        assert!(register_provider(&config).is_ok());
    }

    #[test]
    fn test_get_provider_config() {
        let result = get_provider_config();
        assert!(result.is_ok());

        let config = result.unwrap();
        assert!(!config.mount_point.is_empty());
        assert_eq!(config.hash_algorithm, "BLAKE3");
    }
}
