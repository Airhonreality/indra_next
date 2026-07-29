//! Tauri-based installer for Indra daemon

#![warn(missing_docs)]

/// Installer commands exposed to Tauri frontend
pub mod commands;

/// Daemon installation logic
pub mod installer;

/// Platform-specific installation code
pub mod platform;

// Re-export for convenience
pub use commands::InstallationConfig;
