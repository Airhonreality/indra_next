use anyhow::Result;
use hmac::{Hmac, Mac};
use rand::Rng;
use sha2::Sha256;

type HmacSha256 = Hmac<Sha256>;

#[derive(Clone, Debug)]
pub struct DeviceTrust {
    device_id: String,
    shared_secret: Vec<u8>,
}

impl DeviceTrust {
    /// Generate a random 256-bit shared secret
    pub fn generate_shared_secret() -> Vec<u8> {
        let mut rng = rand::thread_rng();
        let mut secret = vec![0u8; 32];
        rng.fill(&mut secret[..]);
        secret
    }

    /// Create a new device trust with device ID and shared secret
    pub fn new(device_id: String, shared_secret: Vec<u8>) -> Self {
        Self {
            device_id,
            shared_secret,
        }
    }

    /// Sign a message using HMAC-SHA256
    pub fn sign_message(&self, message: &[u8]) -> Result<Vec<u8>> {
        let mut mac = HmacSha256::new_from_slice(&self.shared_secret)?;
        mac.update(message);
        Ok(mac.finalize().into_bytes().to_vec())
    }

    /// Verify a message signature
    pub fn verify_message(&self, message: &[u8], signature: &[u8]) -> Result<bool> {
        let mut mac = HmacSha256::new_from_slice(&self.shared_secret)?;
        mac.update(message);
        match mac.verify_slice(signature) {
            Ok(()) => Ok(true),
            Err(_) => Ok(false),
        }
    }

    /// Generate a QR code string for device pairing
    pub fn generate_pairing_qr_code(&self) -> String {
        format!(
            "indra://pair?device_id={}&secret={}",
            self.device_id,
            hex::encode(&self.shared_secret)
        )
    }

    /// Parse a pairing string from QR code
    pub fn from_pairing_string(pairing_str: &str) -> Result<Self> {
        if !pairing_str.starts_with("indra://pair?") {
            anyhow::bail!("Invalid pairing string format");
        }

        let params = pairing_str.strip_prefix("indra://pair?").unwrap();
        let mut device_id = String::new();
        let mut secret = String::new();

        for param in params.split('&') {
            if let Some((key, value)) = param.split_once('=') {
                match key {
                    "device_id" => device_id = value.to_string(),
                    "secret" => secret = value.to_string(),
                    _ => {}
                }
            }
        }

        if device_id.is_empty() || secret.is_empty() {
            anyhow::bail!("Missing required pairing parameters");
        }

        let shared_secret = hex::decode(&secret)?;
        if shared_secret.len() != 32 {
            anyhow::bail!("Invalid secret length (expected 32 bytes)");
        }

        Ok(Self {
            device_id,
            shared_secret,
        })
    }

    pub fn device_id(&self) -> &str {
        &self.device_id
    }

    pub fn shared_secret(&self) -> &[u8] {
        &self.shared_secret
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_shared_secret() {
        let secret = DeviceTrust::generate_shared_secret();
        assert_eq!(secret.len(), 32);
    }

    #[test]
    fn test_sign_and_verify() {
        let device_id = "device-1".to_string();
        let secret = DeviceTrust::generate_shared_secret();
        let trust = DeviceTrust::new(device_id, secret);

        let message = b"test message";
        let signature = trust.sign_message(message).unwrap();

        let is_valid = trust.verify_message(message, &signature).unwrap();
        assert!(is_valid);

        let is_invalid = trust.verify_message(b"wrong message", &signature).unwrap();
        assert!(!is_invalid);
    }

    #[test]
    fn test_generate_pairing_qr_code() {
        let device_id = "device-1".to_string();
        let secret = DeviceTrust::generate_shared_secret();
        let trust = DeviceTrust::new(device_id, secret);

        let qr = trust.generate_pairing_qr_code();
        assert!(qr.starts_with("indra://pair?"));
        assert!(qr.contains("device_id=device-1"));
        assert!(qr.contains("secret="));
    }

    #[test]
    fn test_parse_pairing_string() {
        let device_id = "device-1".to_string();
        let secret = DeviceTrust::generate_shared_secret();
        let trust1 = DeviceTrust::new(device_id, secret);

        let qr = trust1.generate_pairing_qr_code();
        let trust2 = DeviceTrust::from_pairing_string(&qr).unwrap();

        assert_eq!(trust1.device_id(), trust2.device_id());
        assert_eq!(trust1.shared_secret(), trust2.shared_secret());
    }
}
