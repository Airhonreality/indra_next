//! Indra Core: OS-agnostic sync engine
//!
//! A high-performance, platform-independent file synchronization engine that abstracts
//! filesystem operations and provides advanced chunking, hashing, and state management.

#![warn(missing_docs)]

/// Version info
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

/// Error types
pub mod error;

/// Common types for sync engine
pub mod types;

/// OS-agnostic storage abstractions
pub mod storage;

/// FastCDC content-defined chunking
pub mod fastcdc;

/// BLAKE3 hashing with parallel support
pub mod blake3_hasher;

/// SQLite cache layer with WAL
pub mod cache;

/// Sync state machine
pub mod state_machine;

/// Main sync engine orchestrator
pub mod engine;

pub use error::{Error, Result};
pub use types::{Blake3Hash, Chunk, FileMetadata, SyncEntry, SyncState, VersionVector};
pub use storage::StorageProvider;
pub use fastcdc::FastCdcChunker;
pub use blake3_hasher::Blake3Hasher;
pub use cache::SyncDb;
pub use state_machine::StateMachine;
pub use engine::SyncEngine;
