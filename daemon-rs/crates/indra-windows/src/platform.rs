//! Windows platform operations

use indra_core::Result;

/// Windows platform service
pub struct WindowsPlatform;

impl WindowsPlatform {
    /// Initialize Windows platform
    pub fn init() -> Result<Self> {
        tracing::info!("Initializing Windows platform");
        Ok(Self)
    }

    /// Get system information
    pub fn system_info(&self) -> Result<String> {
        Ok("Windows".to_string())
    }
}
