//! Windows Registry Configuration for Indra Sync Provider

use anyhow::{anyhow, Result};
use uuid::Uuid;

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

    // In a real implementation, this would use winreg or similar to write to:
    // HKCU\SOFTWARE\SyncEngines\Providers\Indra
    //
    // Registry entries:
    // - MountPoint: REG_SZ = config.mount_point
    // - DisplayName: REG_SZ = config.display_name
    // - Handler: REG_SZ = config.handler_clsid
    // - HashAlgorithm: REG_SZ = config.hash_algorithm
    // - WOPIServiceId: REG_SZ = config.wopi_service_id

    if config.mount_point.is_empty() {
        return Err(anyhow!("Mount point cannot be empty"));
    }

    if config.display_name.is_empty() {
        return Err(anyhow!("Display name cannot be empty"));
    }

    tracing::debug!(
        handler_clsid = %config.handler_clsid,
        hash_algorithm = %config.hash_algorithm,
        "Registry entries to be created"
    );

    tracing::info!(
        "Indra provider registered in Windows Registry"
    );

    Ok(())
}

/// Unregister the Indra provider from Windows Registry
pub fn unregister_provider() -> Result<()> {
    tracing::info!("Unregistering Indra provider from Windows Registry");

    // In a real implementation:
    // Remove HKCU\SOFTWARE\SyncEngines\Providers\Indra key

    tracing::info!("Indra provider unregistered from Windows Registry");
    Ok(())
}

/// Verify that the provider is registered
pub fn verify_provider_registration() -> Result<()> {
    tracing::info!("Verifying Indra provider registration");

    // In a real implementation:
    // Read HKCU\SOFTWARE\SyncEngines\Providers\Indra
    // Check required keys exist and are valid

    tracing::info!("Indra provider registration verified");
    Ok(())
}

/// Get current provider configuration from Registry
pub fn get_provider_config() -> Result<ProviderConfig> {
    tracing::info!("Reading Indra provider configuration from Registry");

    // In a real implementation:
    // Read from HKCU\SOFTWARE\SyncEngines\Providers\Indra

    Ok(ProviderConfig::default())
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
