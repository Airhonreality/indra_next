//! Error types for Indra core

use thiserror::Error;

/// Result type for Indra operations
pub type Result<T> = std::result::Result<T, Error>;

/// Core error types
#[derive(Error, Debug)]
pub enum Error {
    /// I/O error
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),

    /// Database error
    #[error("Database error: {0}")]
    Database(String),

    /// Serialization error
    #[error("Serialization error: {0}")]
    Serialization(String),

    /// Invalid configuration
    #[error("Invalid configuration: {0}")]
    InvalidConfig(String),

    /// Storage error
    #[error("Storage error: {0}")]
    Storage(String),

    /// Generic error
    #[error("{0}")]
    Other(String),
}
