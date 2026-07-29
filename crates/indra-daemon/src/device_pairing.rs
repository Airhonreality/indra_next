use anyhow::Result;
use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use std::sync::Arc;

use crate::security::DeviceTrust;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PairedDevice {
    pub device_id: String,
    pub device_name: String,
    pub platform: String,
    pub ip_address: String,
    pub port: u16,
    pub trusted: bool,
    pub last_seen_ms: i64,
}

pub struct DevicePairingManager {
    paired_devices: Arc<DashMap<String, PairedDevice>>,
    device_trusts: Arc<DashMap<String, DeviceTrust>>,
}

impl DevicePairingManager {
    pub fn new() -> Self {
        Self {
            paired_devices: Arc::new(DashMap::new()),
            device_trusts: Arc::new(DashMap::new()),
        }
    }

    /// Register a new paired device
    pub fn register_device(&self, device: PairedDevice) -> Result<()> {
        self.paired_devices
            .insert(device.device_id.clone(), device);
        Ok(())
    }

    /// Get a paired device by ID
    pub fn get_device(&self, device_id: &str) -> Option<PairedDevice> {
        self.paired_devices
            .get(device_id)
            .map(|ref_multi| ref_multi.clone())
    }

    /// List all paired devices
    pub fn list_devices(&self) -> Vec<PairedDevice> {
        self.paired_devices
            .iter()
            .map(|ref_multi| ref_multi.value().clone())
            .collect()
    }

    /// Remove a paired device
    pub fn remove_device(&self, device_id: &str) -> Result<()> {
        self.paired_devices.remove(device_id);
        self.device_trusts.remove(device_id);
        Ok(())
    }

    /// Store trust info for a device
    pub fn store_trust(&self, device_id: String, trust: DeviceTrust) -> Result<()> {
        self.device_trusts.insert(device_id, trust);
        Ok(())
    }

    /// Get trust info for a device
    pub fn get_trust(&self, device_id: &str) -> Option<DeviceTrust> {
        self.device_trusts
            .get(device_id)
            .map(|ref_multi| ref_multi.clone())
    }

    /// Mark device as trusted
    pub fn trust_device(&self, device_id: &str) -> Result<()> {
        if let Some(mut device) = self.paired_devices.get_mut(device_id) {
            device.trusted = true;
        }
        Ok(())
    }

    /// Update last seen time
    pub fn update_last_seen(&self, device_id: &str, timestamp_ms: i64) -> Result<()> {
        if let Some(mut device) = self.paired_devices.get_mut(device_id) {
            device.last_seen_ms = timestamp_ms;
        }
        Ok(())
    }

    /// Check if device is trusted
    pub fn is_trusted(&self, device_id: &str) -> bool {
        self.paired_devices
            .get(device_id)
            .map(|device| device.trusted)
            .unwrap_or(false)
    }

    /// Get peer address for a device
    pub fn get_peer_address(&self, device_id: &str) -> Option<SocketAddr> {
        self.paired_devices.get(device_id).and_then(|device| {
            format!("{}:{}", device.ip_address, device.port)
                .parse::<SocketAddr>()
                .ok()
        })
    }
}

impl Default for DevicePairingManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_register_and_get_device() {
        let manager = DevicePairingManager::new();

        let device = PairedDevice {
            device_id: "device-1".to_string(),
            device_name: "My Device".to_string(),
            platform: "windows".to_string(),
            ip_address: "192.168.1.100".to_string(),
            port: 9876,
            trusted: false,
            last_seen_ms: 1625000000000,
        };

        manager.register_device(device.clone()).unwrap();

        let retrieved = manager.get_device("device-1").unwrap();
        assert_eq!(retrieved.device_id, "device-1");
        assert_eq!(retrieved.device_name, "My Device");
    }

    #[test]
    fn test_list_devices() {
        let manager = DevicePairingManager::new();

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
            port: 9876,
            trusted: true,
            last_seen_ms: 1625000000000,
        };

        manager.register_device(device1).unwrap();
        manager.register_device(device2).unwrap();

        let devices = manager.list_devices();
        assert_eq!(devices.len(), 2);
    }

    #[test]
    fn test_trust_device() {
        let manager = DevicePairingManager::new();

        let device = PairedDevice {
            device_id: "device-1".to_string(),
            device_name: "Device 1".to_string(),
            platform: "windows".to_string(),
            ip_address: "192.168.1.1".to_string(),
            port: 9876,
            trusted: false,
            last_seen_ms: 1625000000000,
        };

        manager.register_device(device).unwrap();
        assert!(!manager.is_trusted("device-1"));

        manager.trust_device("device-1").unwrap();
        assert!(manager.is_trusted("device-1"));
    }

    #[test]
    fn test_remove_device() {
        let manager = DevicePairingManager::new();

        let device = PairedDevice {
            device_id: "device-1".to_string(),
            device_name: "Device 1".to_string(),
            platform: "windows".to_string(),
            ip_address: "192.168.1.1".to_string(),
            port: 9876,
            trusted: false,
            last_seen_ms: 1625000000000,
        };

        manager.register_device(device).unwrap();
        assert!(manager.get_device("device-1").is_some());

        manager.remove_device("device-1").unwrap();
        assert!(manager.get_device("device-1").is_none());
    }

    #[test]
    fn test_get_peer_address() {
        let manager = DevicePairingManager::new();

        let device = PairedDevice {
            device_id: "device-1".to_string(),
            device_name: "Device 1".to_string(),
            platform: "windows".to_string(),
            ip_address: "192.168.1.100".to_string(),
            port: 9876,
            trusted: false,
            last_seen_ms: 1625000000000,
        };

        manager.register_device(device).unwrap();

        let addr = manager.get_peer_address("device-1").unwrap();
        assert_eq!(addr.ip().to_string(), "192.168.1.100");
        assert_eq!(addr.port(), 9876);
    }
}
