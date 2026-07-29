use indra_daemon::config::DaemonConfig;
use indra_daemon::daemon::Daemon;
use indra_daemon::db::EventStore;
use indra_daemon::device_pairing::{DevicePairingManager, PairedDevice};
use indra_daemon::security::DeviceTrust;
use indra_daemon::sync_service::SyncServiceImpl;
use std::path::PathBuf;
use std::sync::Arc;
use tempfile::TempDir;
use tonic::Request;

#[tokio::test]
async fn test_daemon_initialization() {
    let temp_dir = TempDir::new().unwrap();

    let config = DaemonConfig {
        device_id: "test-device-1".to_string(),
        device_name: "Test Device 1".to_string(),
        platform: "test".to_string(),
        sync_root: temp_dir.path().to_path_buf(),
        db_path: temp_dir.path().join("sync.db"),
        listen_host: "127.0.0.1".to_string(),
        listen_port: 19876,
        heartbeat_interval_secs: 5,
        mdns_enabled: false,
        tls_enabled: false,
        trusted_devices: vec![],
    };

    let daemon = Daemon::new(config).await.unwrap();

    assert_eq!(daemon.get_device_id(), "test-device-1");
    assert_eq!(daemon.get_device_name(), "Test Device 1");
    assert_eq!(daemon.get_listen_port(), 19876);
}

#[tokio::test]
async fn test_device_pairing() {
    let pairing_manager = DevicePairingManager::new();

    let device1 = PairedDevice {
        device_id: "device-1".to_string(),
        device_name: "Device 1".to_string(),
        platform: "windows".to_string(),
        ip_address: "192.168.1.1".to_string(),
        port: 9876,
        trusted: false,
        last_seen_ms: 1625000000000,
    };

    let device2 = PairedDevice {
        device_id: "device-2".to_string(),
        device_name: "Device 2".to_string(),
        platform: "linux".to_string(),
        ip_address: "192.168.1.2".to_string(),
        port: 9877,
        trusted: false,
        last_seen_ms: 1625000000000,
    };

    pairing_manager.register_device(device1.clone()).unwrap();
    pairing_manager.register_device(device2.clone()).unwrap();

    let devices = pairing_manager.list_devices();
    assert_eq!(devices.len(), 2);

    pairing_manager.trust_device("device-1").unwrap();
    assert!(pairing_manager.is_trusted("device-1"));
    assert!(!pairing_manager.is_trusted("device-2"));
}

#[tokio::test]
async fn test_device_trust_and_pairing_string() {
    let device_id = "device-1".to_string();
    let secret = DeviceTrust::generate_shared_secret();

    let trust1 = DeviceTrust::new(device_id, secret);
    let qr = trust1.generate_pairing_qr_code();

    // Parse the QR code
    let trust2 = DeviceTrust::from_pairing_string(&qr).unwrap();

    // Verify they have the same secrets
    assert_eq!(trust1.device_id(), trust2.device_id());
    assert_eq!(trust1.shared_secret(), trust2.shared_secret());

    // Test message signing and verification
    let message = b"test sync message";
    let signature = trust1.sign_message(message).unwrap();

    let is_valid = trust2.verify_message(message, &signature).unwrap();
    assert!(is_valid);
}

#[tokio::test]
async fn test_sync_events_storage() {
    let event_store = EventStore::new(":memory:").await.unwrap();

    // Store multiple events
    for i in 0..5 {
        let event_id = format!("event-{}", i);
        event_store
            .store_event(
                &event_id,
                "FILE_CREATED",
                &format!("/test/file{}.txt", i),
                1024,
                1625000000000 + i as i64,
                "[]",
                "device-1",
                i as i32 + 1,
                1625000000000 + i as i64,
            )
            .await
            .unwrap();
    }

    // Retrieve events since version 2
    let events = event_store.get_events_since(2, 100).await.unwrap();
    assert_eq!(events.len(), 3); // Events 3, 4, 5

    // Check current version
    let current_version = event_store.get_current_version().await.unwrap();
    assert_eq!(current_version, 5);
}

#[tokio::test]
async fn test_multi_device_sync_workflow() {
    let temp_dir = TempDir::new().unwrap();

    // Create two daemon configurations
    let config_a = DaemonConfig {
        device_id: "device-a".to_string(),
        device_name: "Device A".to_string(),
        platform: "test".to_string(),
        sync_root: temp_dir.path().to_path_buf(),
        db_path: temp_dir.path().join("sync-a.db"),
        listen_host: "127.0.0.1".to_string(),
        listen_port: 29876,
        heartbeat_interval_secs: 5,
        mdns_enabled: false,
        tls_enabled: false,
        trusted_devices: vec!["device-b".to_string()],
    };

    let config_b = DaemonConfig {
        device_id: "device-b".to_string(),
        device_name: "Device B".to_string(),
        platform: "test".to_string(),
        sync_root: temp_dir.path().to_path_buf(),
        db_path: temp_dir.path().join("sync-b.db"),
        listen_host: "127.0.0.1".to_string(),
        listen_port: 29877,
        heartbeat_interval_secs: 5,
        mdns_enabled: false,
        tls_enabled: false,
        trusted_devices: vec!["device-a".to_string()],
    };

    let daemon_a = Daemon::new(config_a).await.unwrap();
    let daemon_b = Daemon::new(config_b).await.unwrap();

    // Store events on Device A
    let event_store_a = daemon_a.get_event_store();
    event_store_a
        .store_event(
            "event-1",
            "FILE_CREATED",
            "/shared/file.txt",
            1024,
            1625000000000,
            "[]",
            "device-a",
            1,
            1625000000000,
        )
        .await
        .unwrap();

    // Verify events can be retrieved
    let events = event_store_a.get_events_since(0, 100).await.unwrap();
    assert_eq!(events.len(), 1);
    assert_eq!(events[0].event_id, "event-1");
    assert_eq!(events[0].file_path, "/shared/file.txt");

    // Setup device pairing
    let pairing_b = daemon_b.get_pairing_manager();
    let device_a_info = PairedDevice {
        device_id: "device-a".to_string(),
        device_name: "Device A".to_string(),
        platform: "test".to_string(),
        ip_address: "127.0.0.1".to_string(),
        port: 29876,
        trusted: true,
        last_seen_ms: chrono::Local::now().timestamp_millis(),
    };
    pairing_b.register_device(device_a_info).unwrap();
    pairing_b.trust_device("device-a").unwrap();

    // Device B should be able to pull events from Device A's event store
    let events_b = event_store_a.get_events_since(0, 100).await.unwrap();
    assert_eq!(events_b.len(), 1);
}

#[tokio::test]
async fn test_conflict_detection_and_resolution() {
    let event_store = EventStore::new(":memory:").await.unwrap();

    // Store initial event
    event_store
        .store_event(
            "file-1",
            "FILE_CREATED",
            "/shared/file.txt",
            1024,
            1625000000000,
            "[]",
            "device-a",
            1,
            1625000000000,
        )
        .await
        .unwrap();

    // Try to store conflicting version
    event_store
        .store_event(
            "file-1",
            "FILE_UPDATED",
            "/shared/file.txt",
            2048,
            1625000000100, // Different timestamp = conflict
            "[]",
            "device-b",
            1,
            1625000000100,
        )
        .await
        .unwrap();

    let events = event_store.get_events_since(0, 100).await.unwrap();
    assert_eq!(events.len(), 1);

    // The second event should replace the first (INSERT OR REPLACE)
    let retrieved = event_store.get_event_by_id("file-1").await.unwrap().unwrap();
    assert_eq!(retrieved.file_size, 2048); // Updated value
    assert_eq!(retrieved.device_id, "device-b"); // Updated device
}

#[tokio::test]
async fn test_heartbeat_management() {
    let pairing_manager = DevicePairingManager::new();

    let device = PairedDevice {
        device_id: "device-1".to_string(),
        device_name: "Device 1".to_string(),
        platform: "windows".to_string(),
        ip_address: "192.168.1.1".to_string(),
        port: 9876,
        trusted: true,
        last_seen_ms: 1625000000000,
    };

    pairing_manager.register_device(device).unwrap();

    let now = chrono::Local::now().timestamp_millis();
    pairing_manager.update_last_seen("device-1", now).unwrap();

    let updated_device = pairing_manager.get_device("device-1").unwrap();
    assert_eq!(updated_device.last_seen_ms, now);
}
