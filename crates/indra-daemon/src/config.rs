use std::path::PathBuf;
use uuid::Uuid;

#[derive(Clone, Debug)]
pub struct DaemonConfig {
    pub device_id: String,
    pub device_name: String,
    pub platform: String,
    pub sync_root: PathBuf,
    pub db_path: PathBuf,
    pub listen_host: String,
    pub listen_port: u16,
    pub heartbeat_interval_secs: u64,
    pub mdns_enabled: bool,
    pub tls_enabled: bool,
    pub trusted_devices: Vec<String>,
}

impl Default for DaemonConfig {
    fn default() -> Self {
        let platform = if cfg!(windows) {
            "windows"
        } else if cfg!(target_os = "linux") {
            "linux"
        } else {
            "macos"
        };

        let device_name = hostname::get()
            .ok()
            .and_then(|h| h.into_string().ok())
            .unwrap_or_else(|| "indra-device".to_string());

        let sync_root = std::env::var("INDRA_SYNC_ROOT")
            .ok()
            .map(PathBuf::from)
            .unwrap_or_else(|_| {
                if cfg!(windows) {
                    PathBuf::from(format!(
                        "C:\\Users\\{}\\AppData\\Local\\Indra",
                        std::env::var("USERNAME").unwrap_or_default()
                    ))
                } else {
                    PathBuf::from(format!(
                        "{}/.indra",
                        std::env::var("HOME").unwrap_or_default()
                    ))
                }
            });

        let db_path = sync_root.join("sync.db");

        Self {
            device_id: Uuid::new_v4().to_string(),
            device_name,
            platform: platform.to_string(),
            sync_root,
            db_path,
            listen_host: std::env::var("INDRA_LISTEN_HOST")
                .unwrap_or_else(|_| "127.0.0.1".to_string()),
            listen_port: std::env::var("INDRA_LISTEN_PORT")
                .ok()
                .and_then(|p| p.parse().ok())
                .unwrap_or(9876),
            heartbeat_interval_secs: 5,
            mdns_enabled: true,
            tls_enabled: true,
            trusted_devices: vec![],
        }
    }
}

impl DaemonConfig {
    pub fn from_env() -> Self {
        let mut config = Self::default();

        if let Ok(device_id) = std::env::var("INDRA_DEVICE_ID") {
            config.device_id = device_id;
        }

        if let Ok(device_name) = std::env::var("INDRA_DEVICE_NAME") {
            config.device_name = device_name;
        }

        config
    }
}
