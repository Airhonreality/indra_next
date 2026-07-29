//! BLAKE3 hashing with parallel tree support
//!
//! Provides deterministic, parallelizable BLAKE3 hashing for both raw data and tree structures.
//! Targets >100 MB/s performance on modern CPUs.

use crate::types::Blake3Hash;
use crate::Result;
use std::path::Path;
use tokio::fs::File;
use tokio::io::AsyncReadExt;

/// BLAKE3 hasher wrapper
pub struct Blake3Hasher;

impl Blake3Hasher {
    /// Hash raw bytes
    pub fn hash(data: &[u8]) -> Blake3Hash {
        let hash = blake3::hash(data);
        let mut bytes = [0u8; 32];
        bytes.copy_from_slice(hash.as_bytes());
        Blake3Hash::from_bytes(bytes)
    }

    /// Hash file from filesystem with streaming
    pub async fn hash_file(path: &Path) -> Result<Blake3Hash> {
        let mut file = File::open(path).await?;
        let mut hasher = blake3::Hasher::new();
        let mut buffer = vec![0u8; 64 * 1024]; // 64KB buffer

        loop {
            let n = file.read(&mut buffer).await?;
            if n == 0 {
                break;
            }
            hasher.update(&buffer[..n]);
        }

        let hash = hasher.finalize();
        let mut bytes = [0u8; 32];
        bytes.copy_from_slice(hash.as_bytes());
        Ok(Blake3Hash::from_bytes(bytes))
    }

    /// Hash multiple chunks in parallel (using rayon)
    pub async fn hash_chunks(chunks: &[&[u8]]) -> Result<Vec<Blake3Hash>> {
        use rayon::prelude::*;

        let hashes = chunks
            .par_iter()
            .map(|chunk| {
                let hash = blake3::hash(chunk);
                let mut bytes = [0u8; 32];
                bytes.copy_from_slice(hash.as_bytes());
                Blake3Hash::from_bytes(bytes)
            })
            .collect();

        Ok(hashes)
    }

    /// Create tree hash of multiple Blake3 hashes (Merkle tree)
    pub async fn tree_hash(hashes: &[Blake3Hash]) -> Result<Blake3Hash> {
        if hashes.is_empty() {
            return Ok(Blake3Hash::default());
        }

        if hashes.len() == 1 {
            return Ok(hashes[0]);
        }

        // Build tree bottom-up
        let mut current_level: Vec<Blake3Hash> = hashes.to_vec();

        while current_level.len() > 1 {
            let mut next_level = Vec::new();

            for chunk in current_level.chunks(2) {
                let hash_data = if chunk.len() == 2 {
                    let mut combined = Vec::new();
                    combined.extend_from_slice(chunk[0].as_bytes());
                    combined.extend_from_slice(chunk[1].as_bytes());
                    blake3::hash(&combined)
                } else {
                    blake3::Hash::from(*chunk[0].as_bytes())
                };

                let mut bytes = [0u8; 32];
                bytes.copy_from_slice(hash_data.as_bytes());
                next_level.push(Blake3Hash::from_bytes(bytes));
            }

            current_level = next_level;
        }

        Ok(current_level[0])
    }

    /// Verify hash matches expected value
    pub fn verify(data: &[u8], expected: Blake3Hash) -> bool {
        Self::hash(data) == expected
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_blake3_deterministic() {
        let data = b"hello world";
        let hash1 = Blake3Hasher::hash(data);
        let hash2 = Blake3Hasher::hash(data);

        assert_eq!(hash1, hash2, "Hash should be deterministic");
    }

    #[test]
    fn test_blake3_different_data() {
        let data1 = b"hello";
        let data2 = b"world";

        let hash1 = Blake3Hasher::hash(data1);
        let hash2 = Blake3Hasher::hash(data2);

        assert_ne!(hash1, hash2, "Different data should produce different hashes");
    }

    #[tokio::test]
    async fn test_blake3_file_streaming() {
        use tempfile::NamedTempFile;
        use std::io::Write;

        let mut temp = NamedTempFile::new().unwrap();
        let data = vec![0x42u8; 10000];
        temp.write_all(&data).unwrap();
        temp.flush().unwrap();

        let file_hash = Blake3Hasher::hash_file(temp.path()).await.unwrap();
        let memory_hash = Blake3Hasher::hash(&data);

        assert_eq!(file_hash, memory_hash, "File hash should match memory hash");
    }

    #[tokio::test]
    async fn test_blake3_chunks_parallel() {
        let chunks = vec![
            b"chunk1".as_ref(),
            b"chunk2".as_ref(),
            b"chunk3".as_ref(),
            b"chunk4".as_ref(),
        ];

        let hashes = Blake3Hasher::hash_chunks(&chunks).await.unwrap();

        assert_eq!(hashes.len(), 4, "Should produce same number of hashes as chunks");

        // Each hash should be unique and deterministic
        for (i, chunk) in chunks.iter().enumerate() {
            let individual_hash = Blake3Hasher::hash(chunk);
            assert_eq!(hashes[i], individual_hash, "Parallel hash mismatch");
        }
    }

    #[tokio::test]
    async fn test_tree_hash_single() {
        let hash = Blake3Hasher::hash(b"test");
        let tree_result = Blake3Hasher::tree_hash(&[hash]).await.unwrap();

        assert_eq!(tree_result, hash, "Single hash tree should return same hash");
    }

    #[tokio::test]
    async fn test_tree_hash_multiple() {
        let hashes = vec![
            Blake3Hasher::hash(b"a"),
            Blake3Hasher::hash(b"b"),
            Blake3Hasher::hash(b"c"),
            Blake3Hasher::hash(b"d"),
        ];

        let tree1 = Blake3Hasher::tree_hash(&hashes).await.unwrap();
        let tree2 = Blake3Hasher::tree_hash(&hashes).await.unwrap();

        assert_eq!(tree1, tree2, "Tree hash should be deterministic");
    }

    #[test]
    fn test_blake3_hex_conversion() {
        let hash = Blake3Hasher::hash(b"test");
        let hex = hash.to_hex();

        assert_eq!(hex.len(), 64, "Hex should be 64 characters (256 bits / 4)");
        assert!(hex.chars().all(|c| c.is_ascii_hexdigit()), "Should be valid hex");
    }

    #[test]
    fn test_blake3_verify() {
        let data = b"verify me";
        let hash = Blake3Hasher::hash(data);

        assert!(
            Blake3Hasher::verify(data, hash),
            "Verification should pass for correct hash"
        );
        assert!(
            !Blake3Hasher::verify(b"wrong data", hash),
            "Verification should fail for wrong data"
        );
    }

    #[tokio::test]
    async fn test_tree_hash_empty() {
        let tree = Blake3Hasher::tree_hash(&[]).await.unwrap();

        assert_eq!(tree, Blake3Hash::default(), "Empty tree should be default hash");
    }
}
