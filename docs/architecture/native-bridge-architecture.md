# Native Bridge Architecture

## Overview

The **Native Bridge** is a platform-specific daemon that handles synchronization between cloud storage providers and the local filesystem using OS-level APIs:

- **Windows**: Cloud Files API (CFAPI) for seamless cloud file integration
- **Linux**: FUSE 3 for virtual filesystem mounting

This document specifies the **contract** that a future daemon must implement. The frontend is prepared but NOT yet connected to a running daemon.

**Status**: Architecture planned, contracts defined, implementation phase pending.

---

## Windows CFAPI Implementation

### Requirements

- **OS**: Windows 10 (build 1909+) or Windows 11
- **Patch**: KB5005326 or later (Cloud Files API support)
- **.NET Framework**: 4.6 or later
- **Permissions**: User must have admin rights to register sync root

### Key APIs

| API | Purpose |
|-----|---------|
| `CfRegisterSyncRoot()` | Register a new sync provider with Windows |
| `CfConnectSyncRoot()` | Connect to an existing sync root |
| `CfQuerySyncRootInfo()` | Retrieve sync root metadata and state |
| `CfUpdateSyncProviderStatus()` | Report sync progress to Windows Explorer |

### Callback Handlers

The daemon must implement these callback handlers:

| Handler | Triggered When | Responsibility |
|---------|---|---|
| `FETCH_DATA` | User opens a placeholder file | Download file from cloud, write to disk |
| `DELETE_PLACEHOLDER` | User deletes a placeholder | Delete remote file or mark as deleted |
| `CANCEL_FETCH` | User cancels file download | Abort in-progress transfer |
| `FETCH_PLACEHOLDERS` | Explorer needs directory listings | Enumerate remote files, create local placeholders |

### Windows Registry Setup

Daemon must register itself in:

```
HKCU\SOFTWARE\SyncEngines\Providers\IndraStorage
├── ProviderVersion: "1.0"
├── SyncRootManagerCLSID: (GUID for COM handler)
└── ProtocolVersion: "1"
```

### Communication Protocol

- **Transport**: HTTP POST to `http://127.0.0.1:9876/api/sync-event`
- **Format**: JSON
- **Events**: See [IPC Protocol](#ipc-protocol) section
- **Port**: 9876 (default, configurable via env var `INDRA_BRIDGE_PORT`)

### State Directory

- **Root**: `$APPDATA\Indra\Native Bridge`
- **Config**: `config.json` (daemon settings, provider list)
- **Logs**: `logs/` (daily rotation)
- **Cache**: `cache/` (temporary file handles, placeholders)

---

## Linux FUSE 3 Implementation

### Requirements

- **Kernel**: Linux 5.0+ with FUSE support enabled
- **Library**: `libfuse3 >= 3.10`
- **Build tools**: `meson`, `ninja` (for compilation)
- **Permissions**: User must have `user_allow_other` in `/etc/fuse.conf`

### Key APIs

| API | Purpose |
|---|---|
| `fuse_main()` | Mount filesystem and enter event loop |
| `fuse_get_context()` | Retrieve current request context (uid, gid, pid) |
| `readdir_plus()` | List directory with stat info (avoids per-file stats) |
| `read()` | Stream file data from cloud |

### Mountpoint Strategy

- **Default mount**: `~/IndraStorage` (user home directory)
- **Namespace**: User is automatically the owner
- **Permissions**: Inherited from underlying cloud ACLs
- **Performance**: Pass-through mode for already-downloaded files

### Communication Protocol

- **Transport**: Unix domain socket at `/tmp/indra-storage-fuse.sock`
  - Fallback: `/run/user/{uid}/indra-storage-fuse.sock` (XDG Runtime Dir)
- **Format**: JSON-line (newline-delimited JSON)
- **Events**: See [IPC Protocol](#ipc-protocol) section
- **Heartbeat**: Daemon must send heartbeat every 5 seconds

### Directory Structure

- **Mount**: `~/IndraStorage/`
  - `providers/` → Cloud storage namespaces
    - `mega/` → MEGA files
    - `claro/` → Claro Drive (WebDAV)
    - `s3/` → S3 / Cloudflare R2
    - `local/` → Local folder syncs

### Caching Strategy

- **Downloaded files**: Cached in `~/.cache/indra/fuse-cache/`
- **Metadata**: Cached in memory with 5-minute TTL
- **Invalidation**: Via heartbeat or explicit invalidation from daemon

---

## IPC Protocol

### Overview

Frontend and daemon communicate via:

1. **HTTP (Windows)**: Frontend polls `GET /api/desktop/bridge` locally
2. **Unix Socket (Linux)**: Frontend reads JSON-line stream
3. **Events**: Daemon sends `POST /api/desktop/bridge/events` (Windows) or writes to socket

### Message Format

#### Status Check Request

```http
GET /api/desktop/bridge HTTP/1.1
Host: localhost:9876
Authorization: Bearer {user-session-token}
```

#### Status Response

```json
{
  "capability": "cfapi-windows",
  "isRunning": true,
  "lastCheck": "2026-07-28T14:23:00Z",
  "rootPath": "C:\\Users\\{user}\\Indra Drive",
  "syncStatus": "syncing",
  "errorMessage": null
}
```

#### Sync Event (JSON-line format)

```json
{"type":"file-downloaded","timestamp":"2026-07-28T14:23:15Z","filePath":"documents/file.pdf","provider":"mega","sizeBytes":1048576}
{"type":"file-uploaded","timestamp":"2026-07-28T14:23:20Z","filePath":"photos/vacation.jpg","provider":"s3","sizeBytes":2097152}
{"type":"sync-complete","timestamp":"2026-07-28T14:24:00Z","filePath":""}
```

### Event Types

| Type | Emitted When | Payload |
|------|---|---|
| `file-downloaded` | File synced from cloud to disk | `filePath`, `provider`, `sizeBytes` |
| `file-uploaded` | File synced from disk to cloud | `filePath`, `provider`, `sizeBytes` |
| `file-deleted` | File removed from cloud or disk | `filePath`, `provider` |
| `sync-complete` | Batch sync finished | (empty fields) |
| `error` | Error during sync | `errorMessage`, `filePath` (optional) |

### Heartbeat

Daemon sends heartbeat every 5 seconds:

```json
{"type":"heartbeat","timestamp":"2026-07-28T14:24:05Z"}
```

Frontend uses heartbeat to detect daemon crashes.

---

## Frontend Integration Points

### Endpoint: `GET /api/desktop/bridge`

**Location**: `src/app/api/desktop/bridge/route.ts`

Returns daemon status. Frontend calls on page load and every 30 seconds.

**Used by**:
- `DesktopPanel.tsx` → Display bridge status
- `native-bridge-contract.ts` → `checkNativeBridgeStatus()`

### Endpoint: `GET /api/desktop/bridge/events`

**Planned**: Server-Sent Events (SSE) stream from daemon.

**Used by**:
- `StorageWidget.tsx` → Show sync progress
- `native-bridge-contract.ts` → `subscribeToNativeBridgeEvents()`

### UI Components

| Component | Displays | Updates Frequency |
|-----------|----------|---|
| `DesktopPanel.tsx` | Bridge status badge | Every 30s |
| `StorageWidget.tsx` | Sync progress bar | On events (5s heartbeat) |
| `ConnectionsPanel.tsx` | Provider sync status | On events |

---

## Daemon Lifecycle

### Startup

1. Daemon starts (system service or user process)
2. Reads config from `config.json`
3. Loads provider credentials from secure vault
4. **Windows**: Registers with CFAPI, creates placeholders
5. **Linux**: Mounts FUSE filesystem at `~/IndraStorage`
6. Begins polling cloud providers for changes
7. Starts IPC listener at port 9876 (Windows) or Unix socket (Linux)

### Steady State

1. Daemon polls each provider every 60 seconds
2. Sends sync events for changes
3. Responds to local file changes immediately
4. Sends heartbeat every 5 seconds
5. Logs all operations to `logs/`

### Shutdown

1. Frontend detects no heartbeat (5s timeout)
2. Displays "Bridge Offline" in UI
3. Queues all local changes
4. On restart, daemon syncs queued changes

---

## Security Considerations

### Credential Storage

- **Daemon**: Stores credentials in OS Credential Manager (Windows) or `libsecret` (Linux)
- **Frontend**: Never stores daemon credentials; uses session auth
- **IPC**: All communication authenticated with session token

### Filesystem Isolation

- **Windows**: CFAPI enforces user namespace (files visible only to owner)
- **Linux**: FUSE enforces UID/GID based access

### Audit Logging

- **Daemon**: Logs all file operations with timestamp, user, action, provider
- **Retention**: 30 days (configurable)
- **Encryption**: Logs are encrypted at rest

---

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `INDRA_BRIDGE_PORT` | `9876` | HTTP port for Windows daemon |
| `INDRA_BRIDGE_SOCKET` | `/tmp/indra-storage-fuse.sock` | Unix socket path for Linux daemon |
| `INDRA_DESKTOP_ROOT_PATH` | `$HOME/Indra Drive` | Local sync root |
| `INDRA_BRIDGE_LOG_LEVEL` | `info` | Daemon logging level |
| `INDRA_BRIDGE_POLL_INTERVAL` | `60` | Provider poll interval (seconds) |

---

## Future Phases

### Phase 5: Daemon Stub
- Create daemon binary skeleton
- Implement HTTP/socket listener
- Add system service registration

### Phase 6: Windows CFAPI
- Implement CFAPI integration
- Register sync provider
- Handle placeholder callbacks

### Phase 7: Linux FUSE
- Implement FUSE filesystem
- Mount point management
- Metadata caching

### Phase 8: Provider Sync
- Implement polling for each provider (MEGA, S3, Claro)
- Real-time sync queue
- Conflict resolution

### Phase 9: Production Hardening
- Error recovery
- Performance optimization
- Security audit

---

## Testing Strategy

### Unit Tests (Frontend)

- `src/__tests__/native-bridge-contract.test.ts`
- `src/__tests__/native-bridge-schema.test.ts`

### Integration Tests (Frontend → API)

- `src/__tests__/api/desktop/bridge.test.ts`
- Verify contract compliance without daemon

### Mock Daemon (for E2E)

- `scripts/mock-daemon.mjs` provides fake responses
- Used in CI/CD for testing without real daemon

### Contract Tests (Daemon ↔ Frontend)

- Daemon must pass contract tests before release
- Test files located in `daemon/` repo

---

## References

- [Windows Cloud Files API Documentation](https://learn.microsoft.com/en-us/windows/win32/cfapi/cloud-files-api-portal)
- [FUSE 3 Specification](https://github.com/libfuse/libfuse)
- [Nextcloud WebDAV Guide](https://docs.nextcloud.com/server/latest/developer_manual/client_apis/WebDAV/index.html)

---

**Last Updated**: 2026-07-28  
**Version**: 1.0  
**Status**: Architecture Documented, Implementation Pending
