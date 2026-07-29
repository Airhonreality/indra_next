use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Vector clock for causal ordering (conflict detection)
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct VersionVector {
    clocks: HashMap<String, u32>,
}

impl VersionVector {
    pub fn new() -> Self {
        Self {
            clocks: HashMap::new(),
        }
    }

    /// Increment the clock for a device
    pub fn increment(&mut self, device_id: &str) {
        self.clocks
            .entry(device_id.to_string())
            .and_modify(|c| *c += 1)
            .or_insert(1);
    }

    /// Merge another version vector
    pub fn merge(&mut self, other: &VersionVector) {
        for (device_id, clock) in &other.clocks {
            let entry = self.clocks.entry(device_id.clone()).or_insert(0);
            *entry = (*entry).max(*clock);
        }
    }

    /// Check if this version vector happens before another
    pub fn happens_before(&self, other: &VersionVector) -> bool {
        let mut found_less = false;

        for (device_id, clock) in &other.clocks {
            let my_clock = *self.clocks.get(device_id).unwrap_or(&0);
            if my_clock > *clock {
                return false; // Concurrent or happens after
            }
            if my_clock < *clock {
                found_less = true;
            }
        }

        // Also check for devices we have that they don't
        for (device_id, my_clock) in &self.clocks {
            if !other.clocks.contains_key(device_id) && *my_clock > 0 {
                return false;
            }
        }

        found_less
    }

    /// Check if this version vector is concurrent with another
    pub fn concurrent_with(&self, other: &VersionVector) -> bool {
        !self.happens_before(other) && !other.happens_before(self)
    }

    /// Get the clock value for a device
    pub fn get_clock(&self, device_id: &str) -> u32 {
        *self.clocks.get(device_id).unwrap_or(&0)
    }

    /// Get all clock values
    pub fn clocks(&self) -> &HashMap<String, u32> {
        &self.clocks
    }
}

impl Default for VersionVector {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Clone, Copy, Debug)]
pub enum ConflictResolution {
    LastWriteWins,
    VersionVector,
    Manual,
}

/// Resolve a conflict between two versions
pub fn resolve_conflict(
    local_modified_ms: i64,
    remote_modified_ms: i64,
    local_version: &VersionVector,
    remote_version: &VersionVector,
    strategy: ConflictResolution,
) -> bool {
    match strategy {
        ConflictResolution::LastWriteWins => remote_modified_ms > local_modified_ms,
        ConflictResolution::VersionVector => {
            if remote_version.happens_before(local_version) {
                true
            } else if local_version.happens_before(remote_version) {
                false
            } else {
                // Concurrent - fall back to last write wins
                remote_modified_ms > local_modified_ms
            }
        }
        ConflictResolution::Manual => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_increment_version() {
        let mut v = VersionVector::new();

        v.increment("device-1");
        assert_eq!(v.get_clock("device-1"), 1);

        v.increment("device-1");
        assert_eq!(v.get_clock("device-1"), 2);

        v.increment("device-2");
        assert_eq!(v.get_clock("device-2"), 1);
    }

    #[test]
    fn test_merge_versions() {
        let mut v1 = VersionVector::new();
        v1.increment("device-1");
        v1.increment("device-1");

        let mut v2 = VersionVector::new();
        v2.increment("device-2");
        v2.increment("device-2");
        v2.increment("device-2");

        v1.merge(&v2);

        assert_eq!(v1.get_clock("device-1"), 2);
        assert_eq!(v1.get_clock("device-2"), 3);
    }

    #[test]
    fn test_happens_before() {
        let mut v1 = VersionVector::new();
        v1.increment("device-1");

        let mut v2 = VersionVector::new();
        v2.increment("device-1");
        v2.increment("device-1");

        assert!(v1.happens_before(&v2));
        assert!(!v2.happens_before(&v1));
    }

    #[test]
    fn test_concurrent() {
        let mut v1 = VersionVector::new();
        v1.increment("device-1");

        let mut v2 = VersionVector::new();
        v2.increment("device-2");

        assert!(v1.concurrent_with(&v2));
        assert!(v2.concurrent_with(&v1));
    }

    #[test]
    fn test_conflict_resolution_last_write_wins() {
        let local_time = 1000;
        let remote_time = 2000;
        let v1 = VersionVector::new();
        let v2 = VersionVector::new();

        let result = resolve_conflict(
            local_time,
            remote_time,
            &v1,
            &v2,
            ConflictResolution::LastWriteWins,
        );

        assert!(result); // Remote should win
    }

    #[test]
    fn test_conflict_resolution_version_vector() {
        let mut v_local = VersionVector::new();
        v_local.increment("device-1");

        let mut v_remote = VersionVector::new();
        v_remote.increment("device-1");
        v_remote.increment("device-1");

        let result = resolve_conflict(
            1000,
            2000,
            &v_local,
            &v_remote,
            ConflictResolution::VersionVector,
        );

        assert!(!result); // Local should win by version
    }
}
