//! Windows-specific implementations for Indra daemon

#![cfg(target_os = "windows")]
#![warn(missing_docs)]

/// Cloud Filter API integration
pub mod cfapi;

/// COM components for Windows
pub mod com;

/// Windows API bindings
pub mod bindings;

/// Platform-specific operations
pub mod platform;

/// Windows Registry configuration
pub mod registry;
