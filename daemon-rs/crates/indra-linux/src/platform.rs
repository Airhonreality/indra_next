//! Linux platform operations

use indra_core::Result;

/// Linux platform service
pub struct LinuxPlatform;

impl LinuxPlatform {
    /// Initialize Linux platform
    pub fn init() -> Result<Self> {
        tracing::info!("Initializing Linux platform");
        Ok(Self)
    }

    /// Get system information
    pub fn system_info(&self) -> Result<String> {
        Ok("Linux".to_string())
    }
}
