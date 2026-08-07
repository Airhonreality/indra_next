//! Sync state machine with explicit state transitions
//!
//! Manages file synchronization lifecycle with validation of legal transitions.

use crate::types::SyncState;
use crate::{Error, Result};
use std::time::SystemTime;

/// State transition manager
pub struct StateMachine;

impl StateMachine {
    /// Validate and execute transition to Syncing state
    pub fn start_sync(current: SyncState) -> Result<SyncState> {
        match current {
            SyncState::Pending => Ok(SyncState::Syncing {
                progress: 0.0,
                started_at: SystemTime::now(),
            }),
            SyncState::Error { .. } => Ok(SyncState::Syncing {
                progress: 0.0,
                started_at: SystemTime::now(),
            }),
            _ => Err(Error::Other(
                "Cannot start sync from current state".to_string(),
            )),
        }
    }

    /// Validate and execute transition to Synced state
    pub fn complete_sync(current: SyncState) -> Result<SyncState> {
        match current {
            SyncState::Syncing { .. } => Ok(SyncState::Synced {
                synced_at: SystemTime::now(),
            }),
            _ => Err(Error::Other(
                "Can only complete sync from Syncing state".to_string(),
            )),
        }
    }

    /// Validate and execute transition to Error state
    pub fn fail_sync(current: SyncState, reason: String) -> Result<SyncState> {
        match current {
            SyncState::Syncing { .. } => Ok(SyncState::Error {
                reason,
                retry_count: 1,
            }),
            SyncState::Error {
                retry_count, reason: prev_reason,
            } => {
                if retry_count >= 5 {
                    return Err(Error::Other(
                        "Maximum retry count exceeded".to_string(),
                    ));
                }
                Ok(SyncState::Error {
                    reason: format!("{} -> {}", prev_reason, reason),
                    retry_count: retry_count + 1,
                })
            }
            _ => Err(Error::Other(
                "Cannot fail sync from current state".to_string(),
            )),
        }
    }

    /// Update progress during Syncing state
    pub fn update_progress(current: SyncState, progress: f32) -> Result<SyncState> {
        match current {
            SyncState::Syncing { started_at, .. } => {
                let progress = progress.clamp(0.0, 1.0);
                Ok(SyncState::Syncing {
                    progress,
                    started_at,
                })
            }
            _ => Err(Error::Other(
                "Can only update progress during Syncing state".to_string(),
            )),
        }
    }

    /// Reset file to Pending state
    pub fn reset(current: SyncState) -> Result<SyncState> {
        match current {
            SyncState::Error { .. } => Ok(SyncState::Pending),
            SyncState::Synced { .. } => Ok(SyncState::Pending),
            _ => Err(Error::Other(
                "Cannot reset from current state".to_string(),
            )),
        }
    }

    /// Check if state is terminal (no further changes)
    pub fn is_terminal(state: SyncState) -> bool {
        matches!(state, SyncState::Synced { .. })
    }

    /// Check if state is transient (actively changing)
    pub fn is_transient(state: SyncState) -> bool {
        matches!(state, SyncState::Syncing { .. })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pending_to_syncing() {
        let state = SyncState::Pending;
        let new_state = StateMachine::start_sync(state).unwrap();

        match new_state {
            SyncState::Syncing { progress, .. } => {
                assert_eq!(progress, 0.0);
            }
            _ => panic!("Expected Syncing state"),
        }
    }

    #[test]
    fn test_syncing_to_synced() {
        let state = SyncState::Syncing {
            progress: 0.5,
            started_at: SystemTime::now(),
        };
        let new_state = StateMachine::complete_sync(state).unwrap();

        assert!(matches!(new_state, SyncState::Synced { .. }));
    }

    #[test]
    fn test_syncing_to_error() {
        let state = SyncState::Syncing {
            progress: 0.25,
            started_at: SystemTime::now(),
        };
        let new_state = StateMachine::fail_sync(state, "Network error".to_string()).unwrap();

        match new_state {
            SyncState::Error {
                reason,
                retry_count,
            } => {
                assert_eq!(retry_count, 1);
                assert_eq!(reason, "Network error");
            }
            _ => panic!("Expected Error state"),
        }
    }

    #[test]
    fn test_error_retry_sequence() {
        let mut state = SyncState::Error {
            reason: "First error".to_string(),
            retry_count: 1,
        };

        for i in 2..=5 {
            state = StateMachine::fail_sync(state, format!("Error {}", i)).unwrap();
            match state {
                SyncState::Error { retry_count, .. } => {
                    assert_eq!(retry_count, i);
                }
                _ => panic!("Expected Error state"),
            }
        }

        // Should fail after 5 retries
        let result = StateMachine::fail_sync(state, "Final error".to_string());
        assert!(result.is_err());
    }

    #[test]
    fn test_update_progress() {
        let state = SyncState::Syncing {
            progress: 0.0,
            started_at: SystemTime::now(),
        };

        let state = StateMachine::update_progress(state, 0.5).unwrap();
        match state {
            SyncState::Syncing { progress, .. } => {
                assert_eq!(progress, 0.5);
            }
            _ => panic!("Expected Syncing state"),
        }

        // Clamp to max
        let state = StateMachine::update_progress(state, 1.5).unwrap();
        match state {
            SyncState::Syncing { progress, .. } => {
                assert_eq!(progress, 1.0);
            }
            _ => panic!("Expected Syncing state"),
        }
    }

    #[test]
    fn test_invalid_transitions() {
        let state = SyncState::Synced {
            synced_at: SystemTime::now(),
        };

        // Cannot go back to syncing
        assert!(StateMachine::start_sync(state.clone()).is_err());

        // Cannot complete (already synced)
        assert!(StateMachine::complete_sync(state).is_err());
    }

    #[test]
    fn test_reset_synced() {
        let state = SyncState::Synced {
            synced_at: SystemTime::now(),
        };
        let new_state = StateMachine::reset(state).unwrap();

        assert_eq!(new_state, SyncState::Pending);
    }

    #[test]
    fn test_reset_error() {
        let state = SyncState::Error {
            reason: "Some error".to_string(),
            retry_count: 3,
        };
        let new_state = StateMachine::reset(state).unwrap();

        assert_eq!(new_state, SyncState::Pending);
    }

    #[test]
    fn test_is_terminal() {
        assert!(StateMachine::is_terminal(SyncState::Synced {
            synced_at: SystemTime::now()
        }));
        assert!(!StateMachine::is_terminal(SyncState::Pending));
    }

    #[test]
    fn test_is_transient() {
        assert!(StateMachine::is_transient(SyncState::Syncing {
            progress: 0.5,
            started_at: SystemTime::now()
        }));
        assert!(!StateMachine::is_transient(SyncState::Pending));
    }
}
