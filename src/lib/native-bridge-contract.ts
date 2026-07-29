/**
 * Native Bridge Contract
 *
 * Defines the type contract that a future daemon will implement.
 * This allows the frontend to be prepared for daemon integration without blocking on implementation.
 *
 * TODAY: Returns 'none' status with placeholder responses
 * FUTURE: Daemon will connect via HTTP (Windows) or Unix socket (Linux)
 */

/**
 * Capability indicator for the platform-specific native bridge.
 */
export type NativeBridgeCapability = 'cfapi-windows' | 'fuse-linux' | 'none';

/**
 * Current status of the native bridge daemon.
 * Returned by GET /api/desktop/bridge
 */
export interface NativeBridgeStatus {
  /** Detected capability based on platform and daemon status */
  capability: NativeBridgeCapability;

  /** Whether the daemon is running */
  isRunning: boolean;

  /** ISO timestamp of the last status check */
  lastCheck: string;

  /** Root path where files are synchronized */
  rootPath: string;

  /** Current synchronization state */
  syncStatus: 'idle' | 'syncing' | 'error';

  /** Optional error message if syncStatus is 'error' */
  errorMessage?: string;

  /** Optional message for UI display (e.g., "Native bridge not yet implemented") */
  message?: string;
}

/**
 * Event emitted by the daemon during file sync operations.
 * Format: JSON-line over HTTP POST or Unix socket.
 */
export interface NativeBridgeSyncEvent {
  /** Type of sync event */
  type: 'file-downloaded' | 'file-uploaded' | 'file-deleted' | 'sync-complete' | 'error';

  /** ISO timestamp when the event occurred */
  timestamp: string;

  /** Relative path of the file affected */
  filePath: string;

  /** Name of the storage provider (e.g., 'mega', 'claro', 's3') */
  provider?: string;

  /** File size in bytes (for download/upload events) */
  sizeBytes?: number;

  /** Error message if type is 'error' */
  errorMessage?: string;
}

/**
 * Check the status of the native bridge daemon.
 *
 * TODAY: Always returns { capability: 'none', isRunning: false, ... }
 * FUTURE: Connects to daemon at localhost:9876 (Windows) or /tmp/indra-storage-fuse.sock (Linux)
 *
 * @returns Promise resolving to NativeBridgeStatus
 */
export async function checkNativeBridgeStatus(): Promise<NativeBridgeStatus> {
  try {
    const response = await fetch('/api/desktop/bridge', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    return data as NativeBridgeStatus;
  } catch (error) {
    // Fallback when daemon is not available
    return {
      capability: 'none',
      isRunning: false,
      lastCheck: new Date().toISOString(),
      rootPath: '',
      syncStatus: 'error',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      message: 'Failed to check native bridge status',
    };
  }
}

/**
 * Subscribe to sync events from the native bridge daemon.
 *
 * TODAY: Returns an empty subscription that never fires
 * FUTURE: Opens EventSource (Server-Sent Events) to daemon or WebSocket for real-time events
 *
 * @param callback Function called each time a sync event occurs
 * @returns Promise resolving to unsubscribe function
 */
export async function subscribeToNativeBridgeEvents(
  callback: (event: NativeBridgeSyncEvent) => void
): Promise<() => void> {
  // TODAY: Placeholder implementation
  // In the future, this would:
  // 1. Connect to daemon's event stream
  // 2. Parse incoming JSON-line format
  // 3. Validate against NativeBridgeSyncEventSchema
  // 4. Call callback with each event
  // 5. Return unsubscribe function that closes the stream

  // For now, return a no-op unsubscribe
  return () => {
    // No-op
  };
}
