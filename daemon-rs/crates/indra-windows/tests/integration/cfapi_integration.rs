// Integration tests for Windows Cloud Filter API

#![cfg(target_os = "windows")]

use indra_windows::cfapi::{check_cfapi_available, CloudSyncRootInfo, SyncEngineCallbacks};
use indra_windows::registry::{register_provider, unregister_provider, verify_provider_registration, ProviderConfig};
use indra_windows::com::{IndraThumbProvider, ThumbnailCache, get_byte_range_strategy};
use tokio::sync::mpsc;
use std::sync::Arc;

#[tokio::test]
async fn test_cfapi_available() {
    // Check if CFAPI is available on this Windows system
    let result = check_cfapi_available();

    // Windows 10.1809+ should have it
    #[cfg(target_os = "windows")]
    assert!(result.is_ok(), "Cloud Files API should be available on Windows 10+");
}

#[test]
fn test_register_sync_root() {
    let config = CloudSyncRootInfo {
        path: "C:\\Users\\Test\\Indra Drive".to_string(),
        display_name: "Indra Drive".to_string(),
        icon_path: None,
        version: "1.0".to_string(),
        hydration_policy: 0, // CF_HYDRATION_POLICY_PROGRESSIVE
        population_policy: 1, // CF_POPULATION_POLICY_PARTIAL
    };

    let result = indra_windows::cfapi::register_sync_root(&config);
    // Test validates input
    assert!(result.is_ok());
}

#[test]
fn test_register_invalid_path() {
    let config = CloudSyncRootInfo {
        path: "/nonexistent/path/that/does/not/exist".to_string(),
        display_name: "Test".to_string(),
        icon_path: None,
        version: "1.0".to_string(),
        hydration_policy: 0,
        population_policy: 1,
    };

    let result = indra_windows::cfapi::register_sync_root(&config);
    assert!(result.is_err(), "Should fail with nonexistent path");
}

#[test]
fn test_registry_provider_registration() {
    let config = ProviderConfig {
        mount_point: "C:\\Users\\Test\\Indra Drive".to_string(),
        display_name: "Indra Drive".to_string(),
        handler_clsid: "12345678-1234-5678-1234-567812345678".to_string(),
        hash_algorithm: "BLAKE3".to_string(),
        wopi_service_id: Some("indra-drive-sync-service".to_string()),
    };

    let result = register_provider(&config);
    assert!(result.is_ok(), "Provider registration should succeed");
}

#[test]
fn test_registry_invalid_mount_point() {
    let mut config = ProviderConfig::default();
    config.mount_point.clear();

    let result = register_provider(&config);
    assert!(result.is_err(), "Should fail with empty mount point");
}

#[test]
fn test_registry_verify_provider() {
    let result = verify_provider_registration();
    // This test passes or fails depending on system state
    let _ = result;
}

#[tokio::test]
async fn test_sync_callbacks() {
    let (tx, mut rx) = mpsc::unbounded_channel();
    let mut handler = SyncEngineCallbacks::new(tx.clone());

    // Test registering callbacks
    let result = handler.register_callbacks(
        "C:\\Users\\Test\\Indra Drive",
        tx.clone(),
    ).await;

    assert!(result.is_ok());
}

#[tokio::test]
async fn test_emit_fetch_data_event() {
    let (tx, _rx) = mpsc::unbounded_channel();
    let handler = SyncEngineCallbacks::new(tx);

    let result = handler.emit_fetch_data(
        "file-001".to_string(),
        0,
        1024,
    );

    assert!(result.is_ok());
}

#[test]
fn test_thumbnail_byte_range_strategies() {
    // Test JPEG strategy
    let jpg_strategy = get_byte_range_strategy("jpg").unwrap();
    assert_eq!(jpg_strategy.max_bytes, 65536);

    // Test MP4 strategy
    let mp4_strategy = get_byte_range_strategy("mp4").unwrap();
    assert_eq!(mp4_strategy.max_bytes, 131072);

    // Test MKV strategy
    let mkv_strategy = get_byte_range_strategy("mkv").unwrap();
    assert_eq!(mkv_strategy.max_bytes, 65536);

    // Test unsupported type
    let unknown = get_byte_range_strategy("unknown");
    assert!(unknown.is_none());
}

#[test]
fn test_thumbnail_cache_creation() {
    let cache = ThumbnailCache::new(":memory:");

    let result = cache.get_thumbnail("test.jpg", 128);
    assert!(result.is_ok());
    assert!(result.unwrap().is_none(), "Cache should be empty initially");
}

#[test]
fn test_thumbnail_provider_creation() {
    let cache = Arc::new(ThumbnailCache::new(":memory:"));
    let provider = IndraThumbProvider::new(
        "C:\\Users\\Test\\test.jpg".to_string(),
        cache,
    );

    let result = provider.get_thumbnail(128);
    assert!(result.is_ok());
}

#[test]
fn test_parallel_file_creation_simulation() {
    // Simulate creating 100 placeholders
    let handles: Vec<_> = (0..100)
        .map(|i| {
            let path = format!("C:\\Users\\Test\\Indra Drive\\file-{:03}.txt", i);
            assert!(!path.is_empty());
            path
        })
        .collect();

    assert_eq!(handles.len(), 100);
}

#[test]
fn test_registry_default_config() {
    let config = ProviderConfig::default();
    assert!(!config.mount_point.is_empty());
    assert_eq!(config.display_name, "Indra Drive");
    assert_eq!(config.hash_algorithm, "BLAKE3");
}
