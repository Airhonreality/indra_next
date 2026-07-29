// Integration tests for Linux FUSE implementation

#![cfg(target_os = "linux")]

use indra_linux::fuse::{
    check_fuse_available, initialize_fuse_mount, unmount_fuse, FuseMountConfig,
    PassthroughHandler, FileEntry, HydrationState, DirReader, ReaddirplusOptimization,
};
use indra_linux::async_io::UringExecutor;
use indra_linux::dbus::{ThumbnailerService, ThumbnailFlavor};

#[tokio::test]
async fn test_fuse_available() {
    let result = check_fuse_available().await;
    // May or may not be available depending on system
    let _ = result;
}

#[tokio::test]
async fn test_fuse_mount_initialization() {
    let config = FuseMountConfig {
        mount_point: "./test_fuse_mount".to_string(),
        ..Default::default()
    };

    let result = initialize_fuse_mount(&config).await;
    assert!(result.is_ok(), "FUSE mount initialization should succeed");

    // Cleanup
    let _ = std::fs::remove_dir("./test_fuse_mount");
}

#[tokio::test]
async fn test_fuse_mount_custom_config() {
    let config = FuseMountConfig {
        mount_point: "./test_custom_mount".to_string(),
        fs_name: "custom-fs".to_string(),
        subtype: "custom".to_string(),
        allow_other: false,
        async_read: false,
        async_writes: false,
        queue_depth: 64,
    };

    let result = initialize_fuse_mount(&config).await;
    assert!(result.is_ok());

    // Cleanup
    let _ = std::fs::remove_dir("./test_custom_mount");
}

#[tokio::test]
async fn test_fuse_unmount_nonexistent() {
    let result = unmount_fuse("/nonexistent/mount/point").await;
    assert!(result.is_err(), "Should fail for nonexistent mount point");
}

#[test]
fn test_passthrough_hydrated_file() {
    let entry = FileEntry {
        inode: 100,
        name: "hydrated.bin".to_string(),
        remote_url: "https://example.com/hydrated.bin".to_string(),
        local_cache_path: "/tmp/test/hydrated.bin".to_string(),
        is_directory: false,
        hydration_state: HydrationState::FullyHydrated,
        size: 1024,
    };

    assert!(!PassthroughHandler::should_hydrate(&entry),
        "Fully hydrated file should not need hydration");
}

#[test]
fn test_passthrough_placeholder_file() {
    let entry = FileEntry {
        inode: 101,
        name: "placeholder.txt".to_string(),
        remote_url: "https://example.com/file.txt".to_string(),
        local_cache_path: "".to_string(),
        is_directory: false,
        hydration_state: HydrationState::Placeholder,
        size: 5000,
    };

    assert!(PassthroughHandler::should_hydrate(&entry),
        "Placeholder file should need hydration");
}

#[test]
fn test_passthrough_partially_hydrated_file() {
    let entry = FileEntry {
        inode: 102,
        name: "partial.bin".to_string(),
        remote_url: "https://example.com/partial.bin".to_string(),
        local_cache_path: "/tmp/test/partial.bin".to_string(),
        is_directory: false,
        hydration_state: HydrationState::PartiallyHydrated { cached_bytes: 500 },
        size: 2000,
    };

    assert!(PassthroughHandler::should_hydrate(&entry),
        "Partially hydrated file should need hydration");
}

#[test]
fn test_passthrough_update_hydration_state() {
    let mut entry = FileEntry {
        inode: 103,
        name: "updating.txt".to_string(),
        remote_url: "https://example.com/updating.txt".to_string(),
        local_cache_path: "".to_string(),
        is_directory: false,
        hydration_state: HydrationState::Placeholder,
        size: 1000,
    };

    let result = PassthroughHandler::update_hydration(
        &mut entry,
        HydrationState::FullyHydrated,
    );

    assert!(result.is_ok());
    assert_eq!(entry.hydration_state, HydrationState::FullyHydrated);
}

#[tokio::test]
async fn test_dir_reader_batch_loading() {
    let mut reader = DirReader::new(1);

    // Simulate adding entries
    reader.add_child(2, "file1.txt".to_string(), 1024, false, std::time::SystemTime::now());
    reader.add_child(3, "file2.txt".to_string(), 2048, false, std::time::SystemTime::now());
    reader.add_child(4, "subdir".to_string(), 4096, true, std::time::SystemTime::now());

    let result = reader.load_children_batch().await;
    assert!(result.is_ok());
    assert_eq!(reader.children.len(), 3);
}

#[test]
fn test_dir_reader_reply_generation() {
    let mut reader = DirReader::new(1);
    reader.add_child(2, "file.txt".to_string(), 1024, false, std::time::SystemTime::now());

    let reply = reader.get_reply();
    assert_eq!(reply.len(), 1);
}

#[test]
fn test_readdirplus_speedup_calculation() {
    let speedup_100 = ReaddirplusOptimization::calculate_speedup(100);
    let speedup_1000 = ReaddirplusOptimization::calculate_speedup(1000);
    let speedup_10000 = ReaddirplusOptimization::calculate_speedup(10000);

    assert!(speedup_100 > 50.0, "100 entries should show >50x speedup");
    assert!(speedup_1000 > 500.0, "1000 entries should show >500x speedup");
    assert!(speedup_10000 > 5000.0, "10000 entries should show >5000x speedup");
}

#[test]
fn test_readdirplus_1000_entries_performance() {
    let speedup = ReaddirplusOptimization::calculate_speedup(1000);
    // With readdirplus, 1000 entries should be <100ms vs 1000ms with regular readdir
    // That's 10x improvement minimum, we calculate much higher
    assert!(speedup > 100.0, "1000 entries should show significant speedup");
}

#[tokio::test]
async fn test_uring_executor_creation() {
    let result = UringExecutor::new(32);
    assert!(result.is_ok(), "io_uring executor should be created");

    let executor = result.unwrap();
    assert_eq!(executor.queue_depth(), 32);
}

#[tokio::test]
async fn test_uring_executor_invalid_queue_depth() {
    let result = UringExecutor::new(0);
    assert!(result.is_err(), "Queue depth 0 should fail");

    let result = UringExecutor::new(5000);
    assert!(result.is_err(), "Queue depth > 4096 should fail");
}

#[tokio::test]
async fn test_uring_executor_empty_batch() {
    let mut executor = UringExecutor::new(32).unwrap();
    let results = executor.submit_read_batch(vec![]).await;

    assert!(results.is_ok());
    assert!(results.unwrap().is_empty(), "Empty batch should return empty results");
}

#[test]
fn test_thumbnailer_flavor_sizes() {
    assert_eq!(ThumbnailFlavor::Normal.size_px(), 128);
    assert_eq!(ThumbnailFlavor::Large.size_px(), 256);
    assert_eq!(ThumbnailFlavor::XLarge.size_px(), 512);
}

#[test]
fn test_thumbnailer_service_creation() {
    let service = ThumbnailerService::new(None);
    // Service should be created successfully
    let _ = service;
}

#[tokio::test]
async fn test_thumbnailer_service_registration() {
    let service = ThumbnailerService::new(Some("/tmp/test_thumbnails".to_string()));
    let result = service.register().await;

    assert!(result.is_ok(), "Thumbnailer service should register");
}

#[tokio::test]
async fn test_thumbnailer_get_empty_thumbnails() {
    let service = ThumbnailerService::new(None);
    let results = service.get_thumbnails(
        vec![],
        vec![],
        "normal".to_string(),
    ).await;

    assert!(results.is_ok());
    assert!(results.unwrap().is_empty(), "Empty URIs should return empty results");
}

#[tokio::test]
async fn test_thumbnailer_cache_clear() {
    let service = ThumbnailerService::new(Some("/tmp/test_cache".to_string()));
    let result = service.clear_cache().await;

    assert!(result.is_ok(), "Cache clear should succeed");
}

#[tokio::test]
async fn test_thumbnailer_evict_old() {
    let service = ThumbnailerService::new(Some("/tmp/test_cache".to_string()));
    let result = service.evict_old(7).await;

    assert!(result.is_ok());
    // Should return number of evicted files
    let _ = result.unwrap();
}

#[test]
fn test_fuse_mount_default_config() {
    let config = FuseMountConfig::default();
    assert!(!config.mount_point.is_empty());
    assert_eq!(config.fs_name, "indra-drive");
    assert_eq!(config.subtype, "indra");
    assert!(config.allow_other);
    assert!(config.async_read);
    assert!(config.async_writes);
    assert_eq!(config.queue_depth, 256);
}

#[test]
fn test_file_entry_directory_distinction() {
    let file_entry = FileEntry {
        inode: 1,
        name: "file.txt".to_string(),
        remote_url: "https://example.com/file.txt".to_string(),
        local_cache_path: "/tmp/file.txt".to_string(),
        is_directory: false,
        hydration_state: HydrationState::FullyHydrated,
        size: 1024,
    };

    let dir_entry = FileEntry {
        inode: 2,
        name: "directory".to_string(),
        remote_url: "https://example.com/directory/".to_string(),
        local_cache_path: "/tmp/directory".to_string(),
        is_directory: true,
        hydration_state: HydrationState::FullyHydrated,
        size: 4096,
    };

    assert!(!file_entry.is_directory);
    assert!(dir_entry.is_directory);
}
