//! Linux-specific implementations for Indra daemon

#![cfg(target_os = "linux")]
#![warn(missing_docs)]

/// Asynchronous I/O operations using io_uring
pub mod async_io;

/// D-Bus integration
pub mod dbus;

/// FUSE filesystem implementation
pub mod fuse;

/// Platform-specific operations
pub mod platform;
