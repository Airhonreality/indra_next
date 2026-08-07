//! FastCDC (Content-Defined Chunking) implementation
//!
//! Implements dynamic content chunking using Gear rolling hash with optional SIMD acceleration.
//! Parameters: min=16KB, avg=64KB, max=1MB

use crate::types::{Blake3Hash, Chunk};
use crate::Result;
use std::path::Path;
use tokio::fs::File;
use tokio::io::AsyncReadExt;

/// Gear rolling hash table size
const GEAR_TABLE_SIZE: usize = 256;

/// FastCDC chunker with Gear rolling hash
pub struct FastCdcChunker {
    /// Minimum chunk size
    min_chunk_size: usize,
    /// Average (target) chunk size
    avg_chunk_size: usize,
    /// Maximum chunk size
    max_chunk_size: usize,
    /// Mask for boundary detection
    chunk_mask: u64,
    /// Precomputed Gear hash table
    gear_table: [u64; GEAR_TABLE_SIZE],
}

impl FastCdcChunker {
    /// Create new chunker with standard parameters (16KB, 64KB, 1MB)
    pub fn new_standard() -> Self {
        Self::new(16 * 1024, 64 * 1024, 1024 * 1024)
    }

    /// Create new chunker with custom parameters
    pub fn new(min_chunk_size: usize, avg_chunk_size: usize, max_chunk_size: usize) -> Self {
        let gear_table = Self::generate_gear_table();
        let chunk_mask = (avg_chunk_size as u64 - 1) as u64;

        Self {
            min_chunk_size,
            avg_chunk_size,
            max_chunk_size,
            chunk_mask,
            gear_table,
        }
    }

    /// Generate Gear hash table
    fn generate_gear_table() -> [u64; GEAR_TABLE_SIZE] {
        let mut table = [0u64; GEAR_TABLE_SIZE];
        let mut rng: u64 = 3935559000370003845;

        for i in 0..GEAR_TABLE_SIZE {
            table[i] = rng;
            // Simple LCG for pseudo-random values
            rng = rng.wrapping_mul(2654435761).wrapping_add(2246822519);
        }

        table
    }

    /// Chunk data in memory
    pub async fn chunk(&self, data: &[u8]) -> Result<Vec<Chunk>> {
        if data.is_empty() {
            return Ok(vec![]);
        }

        let mut chunks = Vec::new();
        let mut offset = 0u64;
        let mut chunk_start = 0usize;
        let mut gear_hash = 0u64;
        let mut chunk_len = 0usize;

        // Sliding window for rolling hash (32 bytes)
        let mut window = [0u8; 32];
        let mut window_pos = 0usize;

        // Guard on the actual index read below (chunk_start + chunk_len), not just
        // chunk_start: for data shorter than min_chunk_size, chunk_len grows every
        // iteration while chunk_start stays put, so `chunk_start < data.len()` alone
        // stays true past the end of the buffer and panics on the index read.
        while chunk_start + chunk_len < data.len() {
            let byte = data[chunk_start + chunk_len];
            gear_hash = gear_hash.wrapping_shl(1);
            gear_hash = gear_hash.wrapping_add(self.gear_table[byte as usize]);

            window[window_pos] = byte;
            window_pos = (window_pos + 1) % 32;
            chunk_len += 1;

            // Check if we found a chunk boundary
            let is_boundary = if chunk_len >= self.min_chunk_size {
                (gear_hash & self.chunk_mask) == 0 || chunk_len >= self.max_chunk_size
            } else {
                false
            };

            if is_boundary {
                let chunk_data = &data[chunk_start..chunk_start + chunk_len];
                let hash = blake3::hash(chunk_data);
                let mut hash_bytes = [0u8; 32];
                hash_bytes.copy_from_slice(hash.as_bytes());

                chunks.push(Chunk {
                    offset: offset + chunk_start as u64,
                    size: chunk_len as u64,
                    hash: Blake3Hash::from_bytes(hash_bytes),
                });

                chunk_start += chunk_len;
                chunk_len = 0;
                gear_hash = 0;
                window_pos = 0;
            }
        }

        // Handle remaining data as final chunk
        if chunk_len > 0 {
            let chunk_data = &data[chunk_start..chunk_start + chunk_len];
            let hash = blake3::hash(chunk_data);
            let mut hash_bytes = [0u8; 32];
            hash_bytes.copy_from_slice(hash.as_bytes());

            chunks.push(Chunk {
                offset: offset + chunk_start as u64,
                size: chunk_len as u64,
                hash: Blake3Hash::from_bytes(hash_bytes),
            });
        }

        Ok(chunks)
    }

    /// Chunk file from filesystem
    pub async fn chunk_file(&self, path: &Path) -> Result<Vec<Chunk>> {
        let mut file = File::open(path).await?;
        let mut buffer = vec![0u8; 1024 * 1024]; // 1MB buffer
        let mut all_data = Vec::new();

        loop {
            let n = file.read(&mut buffer).await?;
            if n == 0 {
                break;
            }
            all_data.extend_from_slice(&buffer[..n]);
        }

        self.chunk(&all_data).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_fastcdc_consistent_boundaries() {
        let chunker = FastCdcChunker::new_standard();
        let data = vec![0x42u8; 1000000]; // 1MB of same byte

        let chunks1 = chunker.chunk(&data).await.unwrap();
        let chunks2 = chunker.chunk(&data).await.unwrap();

        assert_eq!(chunks1.len(), chunks2.len(), "Chunks not consistent");

        for (c1, c2) in chunks1.iter().zip(chunks2.iter()) {
            assert_eq!(c1.offset, c2.offset, "Chunk offset mismatch");
            assert_eq!(c1.size, c2.size, "Chunk size mismatch");
            assert_eq!(c1.hash, c2.hash, "Chunk hash mismatch");
        }
    }

    #[tokio::test]
    async fn test_fastcdc_min_max_sizes() {
        let chunker = FastCdcChunker::new_standard();
        let mut data = Vec::new();
        for i in 0..=255 {
            data.extend(vec![i as u8; 1000]);
        }

        let chunks = chunker.chunk(&data).await.unwrap();

        for chunk in chunks.iter() {
            assert!(
                chunk.size >= chunker.min_chunk_size as u64,
                "Chunk below min size: {}",
                chunk.size
            );
            assert!(
                chunk.size <= chunker.max_chunk_size as u64,
                "Chunk above max size: {}",
                chunk.size
            );
        }
    }

    #[tokio::test]
    async fn test_fastcdc_empty_file() {
        let chunker = FastCdcChunker::new_standard();
        let data = vec![];

        let chunks = chunker.chunk(&data).await.unwrap();

        assert!(chunks.is_empty(), "Empty file should produce no chunks");
    }

    #[tokio::test]
    async fn test_fastcdc_small_file() {
        let chunker = FastCdcChunker::new_standard();
        let data = vec![0x42u8; 100];

        let chunks = chunker.chunk(&data).await.unwrap();

        assert_eq!(chunks.len(), 1, "Small file should produce single chunk");
        assert_eq!(chunks[0].size, 100);
    }

    #[test]
    fn test_gear_table_calculation() {
        let chunker = FastCdcChunker::new_standard();

        // Table should be populated
        assert!(chunker.gear_table.iter().any(|&h| h != 0), "Gear table not initialized");

        // Different entries should differ
        let unique_count = chunker
            .gear_table
            .iter()
            .collect::<std::collections::HashSet<_>>()
            .len();
        assert!(unique_count > 200, "Gear table has too many duplicates");
    }

    #[tokio::test]
    async fn test_fastcdc_chunk_coverage() {
        let chunker = FastCdcChunker::new_standard();
        let data = vec![0x42u8; 500000];

        let chunks = chunker.chunk(&data).await.unwrap();

        let total_size: u64 = chunks.iter().map(|c| c.size).sum();
        assert_eq!(total_size, data.len() as u64, "Chunks don't cover entire file");

        let mut sorted = chunks.clone();
        sorted.sort_by_key(|c| c.offset);
        for (i, chunk) in sorted.iter().enumerate() {
            if i > 0 {
                assert_eq!(
                    sorted[i - 1].offset + sorted[i - 1].size,
                    chunk.offset,
                    "Chunk gap or overlap detected"
                );
            }
        }
    }
}
