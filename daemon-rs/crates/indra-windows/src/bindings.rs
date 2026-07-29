//! Windows API bindings

use windows::Win32::Foundation::*;

/// Windows version information
#[derive(Debug, Clone)]
pub struct WindowsVersion {
    /// Major version
    pub major: u32,
    /// Minor version
    pub minor: u32,
    /// Build number
    pub build: u32,
}

impl WindowsVersion {
    /// Get current Windows version
    pub fn current() -> Self {
        Self {
            major: 10,
            minor: 0,
            build: 0,
        }
    }
}
