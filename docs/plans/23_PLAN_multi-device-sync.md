---
plan: 23_PLAN_multi-device-sync
estado: BORRADOR
ejecutor: codex
depende_de: [19, 12B]
---

# 23 - Sincronización Multi-Dispositivo (gRPC + Daemon Local)

## Contexto

La arquitectura de Fase 2 (Plan 19) estableció un cliente desktop con raíz local gestionada y sincronización básica contra proveedores remotos (S3/R2, Claro). El siguiente escalón es habilitar la **sincronización bidireccional entre múltiples dispositivos** sin depender de un servidor central externo.

**Estado Actual**:
- ✅ Cliente desktop funcional con raíz local (`src/lib/desktop-root.ts`)
- ✅ Exploradores sincronizados contra proveedores remotos
- ✅ Metadatos locales almacenados en SQLite
- ❌ Sin comunicación inter-dispositivo
- ❌ Sin daemon local permanente
- ❌ Sin detección de cambios en tiempo real (file watcher)

**Referencia técnica**: Arquitectura de Concurrencia (sección 4 de `docs/research/Local drive integration.md.txt`):
- Tres colas de prioridad (I/O crítica, metadatos, background)
- gRPC sobre QUIC/HTTP3 (multiplexado)
- Async/await en Rust sin mutexes (lock-free)

## Objetivo Real

Permitir que:

1. Un **daemon local** (`indra-daemon`) escuche cambios de filesystem y exponga una API gRPC
2. Dos dispositivos en la **misma LAN** detecten automáticamente sus presencias (mDNS)
3. Se realice **pairing seguro** con establecimiento de confianza (HMAC-SHA256)
4. Los cambios se **sincronicen bidireccionalamente en <5s** dentro de LAN
5. Se resolvan **conflictos** de forma determinística (last-write-wins con vectores de versión)
6. Los datos en tránsito estén **cifrados** (TLS 1.3)

## Secuencia del Trabajo

### Fase 1 – Contrato gRPC y Protocol Buffers

Definir la API de sincronización como un contrato rígido en Protocol Buffers v3.

### Fase 2 – Daemon Local Básico

Implementar un ejecutable que escuche en un puerto local, mantenga heartbeat y reconexión.

### Fase 3 – Device Pairing y Trust Establishment

Agregar lógica de detección, emparejamiento y autenticación inter-dispositivo.

### Fase 4 – Sync State Machine

Implementar pull/push de cambios, conflict resolution y offline queue.

### Fase 5 – Integración con Cliente Desktop

Conectar el cliente web/desktop al daemon local.

### Fase 6 – Verificación E2E

Pruebas reales con dos máquinas.

## Operaciones

### Fase 1 – Contrato gRPC

#### 1.1 Crear proto files

**Crear `crates/indra-daemon/proto/sync.proto`**:

```protobuf
syntax = "proto3";

package indra.sync;

option go_package = "github.com/indracloud/indra/pkg/sync";
option java_package = "com.indracloud.sync";

// Event types for file changes
enum EventType {
  EVENT_TYPE_UNSPECIFIED = 0;
  FILE_CREATED = 1;
  FILE_UPDATED = 2;
  FILE_DELETED = 3;
  FILE_RENAMED = 4;
  FOLDER_CREATED = 5;
  FOLDER_DELETED = 6;
  SYNC_COMPLETE = 7;
}

// Chunk hash (BLAKE3)
message ChunkHash {
  string algorithm = 1;  // "BLAKE3"
  bytes digest = 2;      // 32 bytes
}

// File metadata
message FileMetadata {
  string path = 1;
  int64 size = 2;
  int64 modified_time_ms = 3;
  string mode = 4;  // "0644"
  repeated ChunkHash chunks = 5;
}

// Sync event (file-level)
message SyncEvent {
  string event_id = 1;  // UUID
  EventType type = 2;
  FileMetadata file = 3;
  int64 timestamp_ms = 4;
  string device_id = 5;  // Who triggered this
  int32 version_vector = 6;  // For conflict resolution
}

// Device metadata
message Device {
  string device_id = 1;
  string device_name = 2;
  string platform = 3;  // "windows", "linux", "macos"
  int64 last_seen_ms = 4;
  string ip_address = 5;
  int32 port = 6;
  bool trusted = 7;
  bytes public_key_hmac = 8;  // HMAC-SHA256 key for trust
}

// Request: Get events since version
message PullRequest {
  string device_id = 1;
  int32 since_version = 2;
  string sync_root = 3;
}

// Response: Batch of events
message PullResponse {
  repeated SyncEvent events = 1;
  int32 current_version = 2;
  bool has_more = 3;
}

// Request: Push new events
message PushRequest {
  repeated SyncEvent events = 1;
  string device_id = 2;
}

// Response: Ack + conflict list
message PushResponse {
  repeated string conflict_event_ids = 1;  // Events that conflicted
  int32 new_version = 2;
}

// EventStream: Server pushes changes in real-time
message StreamEvent {
  SyncEvent event = 1;
  Device source_device = 2;
}

// Device heartbeat
message HeartbeatRequest {
  string device_id = 1;
  string device_name = 2;
  string ip_address = 3;
  int32 port = 4;
}

message HeartbeatResponse {
  bool acknowledged = 1;
  repeated Device known_devices = 2;
}

service SyncService {
  // Pull events from peer
  rpc Pull(PullRequest) returns (PullResponse);
  
  // Push events to peer
  rpc Push(PushRequest) returns (PushResponse);
  
  // Stream events in real-time (server push)
  rpc Subscribe(PullRequest) returns (stream StreamEvent);
  
  // Heartbeat for discovery
  rpc Heartbeat(HeartbeatRequest) returns (HeartbeatResponse);
}
```

#### 1.2 Crear estructura Rust del crate indra-daemon

```bash
cargo new --lib crates/indra-daemon
```

**Crear `crates/indra-daemon/Cargo.toml`**:

```toml
[package]
name = "indra-daemon"
version = "0.1.0"
edition = "2024"

[dependencies]
tonic = "0.11"
tonic-build = "0.11"
prost = "0.12"
prost-types = "0.12"
tokio = { version = "1.40", features = ["full"] }
tokio-util = "0.7"
anyhow = "1.0"
tracing = "0.1"
tracing-subscriber = "0.3"
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
sqlx = { version = "0.8", features = ["sqlite", "runtime-tokio-rustls"] }
blake3 = "1.5"
hex = "0.4"
hmac = "0.12"
sha2 = "0.10"
rand = "0.8"
uuid = { version = "1.10", features = ["v4", "serde"] }
async-trait = "0.1"
dashmap = "6.0"
futures = "0.3"
mdns = "6.0"  # mDNS for device discovery
rustls = "0.23"
rcgen = "0.12"

[build-dependencies]
tonic-build = "0.11"
```

**Crear `crates/indra-daemon/build.rs`**:

```rust
fn main() {
    tonic_build::compile_protos("proto/sync.proto")
        .unwrap();
}
```

### Fase 2 – Daemon Local Básico

#### 2.1 Estructura de archivos

```
crates/indra-daemon/
├── src/
│   ├── lib.rs                    # Re-exports
│   ├── daemon.rs                 # Main daemon struct
│   ├── sync_service.rs           # gRPC service impl
│   ├── db.rs                     # SQLite store
│   ├── filewatcher.rs            # Local filesystem events
│   ├── heartbeat.rs              # Peer heartbeat + discovery
│   └── config.rs                 # Config from env
├── proto/
│   └── sync.proto                # gRPC definitions
├── Cargo.toml
└── build.rs
```

#### 2.2 Implementar db.rs (SQLite journal)

**`crates/indra-daemon/src/db.rs`**:

```rust
use anyhow::Result;
use sqlx::sqlite::{SqlitePool, SqlitePoolOptions, SqliteConnectOptions};
use std::time::SystemTime;

#[derive(Clone)]
pub struct EventStore {
    pool: SqlitePool,
}

impl EventStore {
    pub async fn new(db_path: &str) -> Result<Self> {
        let options = SqliteConnectOptions::new()
            .filename(db_path)
            .create_if_missing(true);
        
        let pool = SqlitePoolOptions::new()
            .connect_with(options)
            .await?;
        
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS sync_events (
                event_id TEXT PRIMARY KEY,
                event_type TEXT NOT NULL,
                file_path TEXT NOT NULL,
                file_size INTEGER,
                modified_time_ms INTEGER,
                chunks_json TEXT,
                device_id TEXT NOT NULL,
                version_vector INTEGER NOT NULL,
                timestamp_ms INTEGER NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
            "#,
        )
        .execute(&pool)
        .await?;

        // Index for efficient queries
        sqlx::query(
            "CREATE INDEX IF NOT EXISTS idx_version ON sync_events(version_vector)"
        )
        .execute(&pool)
        .await?;

        Ok(Self { pool })
    }

    pub async fn store_event(
        &self,
        event_id: &str,
        event_type: &str,
        file_path: &str,
        file_size: i64,
        modified_time_ms: i64,
        chunks_json: &str,
        device_id: &str,
        version_vector: i32,
        timestamp_ms: i64,
    ) -> Result<()> {
        sqlx::query(
            r#"
            INSERT INTO sync_events 
            (event_id, event_type, file_path, file_size, modified_time_ms, 
             chunks_json, device_id, version_vector, timestamp_ms)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(event_id)
        .bind(event_type)
        .bind(file_path)
        .bind(file_size)
        .bind(modified_time_ms)
        .bind(chunks_json)
        .bind(device_id)
        .bind(version_vector)
        .bind(timestamp_ms)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn get_events_since(&self, version: i32) -> Result<Vec<(String, String)>> {
        let rows = sqlx::query_as::<_, (String, String)>(
            "SELECT event_id, event_type FROM sync_events WHERE version_vector > ? ORDER BY version_vector ASC"
        )
        .bind(version)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows)
    }

    pub async fn get_current_version(&self) -> Result<i32> {
        let row = sqlx::query_scalar::<_, i32>(
            "SELECT COALESCE(MAX(version_vector), 0) FROM sync_events"
        )
        .fetch_one(&self.pool)
        .await?;

        Ok(row)
    }
}
```

#### 2.3 Implementar filewatcher.rs (detect local changes)

**`crates/indra-daemon/src/filewatcher.rs`**:

```rust
use anyhow::Result;
use std::path::PathBuf;
use tokio::sync::mpsc;
use uuid::Uuid;

#[derive(Clone, Debug)]
pub struct FileChange {
    pub event_id: String,
    pub change_type: ChangeType,
    pub path: PathBuf,
    pub timestamp_ms: i64,
}

#[derive(Clone, Debug)]
pub enum ChangeType {
    Created,
    Modified,
    Deleted,
    Renamed { from: PathBuf, to: PathBuf },
}

pub struct FileWatcher {
    watch_root: PathBuf,
    tx: mpsc::Sender<FileChange>,
}

impl FileWatcher {
    pub fn new(watch_root: PathBuf) -> (Self, mpsc::Receiver<FileChange>) {
        let (tx, rx) = mpsc::channel(1000);
        
        let watcher = FileWatcher { watch_root, tx };
        (watcher, rx)
    }

    pub async fn start(&self) -> Result<()> {
        // This is a simplified example; a real implementation would use
        // notify crate or platform-specific file watching APIs
        
        // TODO: Implement platform-specific file watching:
        // - Windows: ReadDirectoryChangesW
        // - Linux: inotify
        // - macOS: FSEvents
        
        Ok(())
    }

    pub async fn emit_change(&self, change: FileChange) -> Result<()> {
        self.tx.send(change).await?;
        Ok(())
    }
}
```

#### 2.4 Implementar daemon.rs (Main server)

**`crates/indra-daemon/src/daemon.rs`**:

```rust
use anyhow::Result;
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::time::{interval, Duration};
use uuid::Uuid;

use crate::db::EventStore;
use crate::filewatcher::FileWatcher;
use crate::sync_service::SyncServiceImpl;

pub struct Daemon {
    device_id: String,
    device_name: String,
    listen_addr: SocketAddr,
    event_store: Arc<EventStore>,
    file_watcher: FileWatcher,
}

impl Daemon {
    pub async fn new(
        device_name: String,
        listen_addr: SocketAddr,
        db_path: &str,
        watch_root: std::path::PathBuf,
    ) -> Result<Self> {
        let device_id = Uuid::new_v4().to_string();
        let event_store = Arc::new(EventStore::new(db_path).await?);
        let (file_watcher, _rx) = FileWatcher::new(watch_root);

        Ok(Self {
            device_id,
            device_name,
            listen_addr,
            event_store,
            file_watcher,
        })
    }

    pub async fn start(&self) -> Result<()> {
        let sync_service = SyncServiceImpl::new(
            self.device_id.clone(),
            Arc::clone(&self.event_store),
        );

        // Start gRPC server
        tonic::transport::Server::builder()
            .add_service(
                indra_daemon::sync::sync_service_server::SyncServiceServer::new(sync_service)
            )
            .serve(self.listen_addr)
            .await?;

        Ok(())
    }

    pub async fn start_heartbeat(&self, interval_secs: u64) -> Result<()> {
        let mut ticker = interval(Duration::from_secs(interval_secs));

        loop {
            ticker.tick().await;
            // Emit heartbeat event
            tracing::info!(
                device_id = %self.device_id,
                "Heartbeat"
            );
        }
    }
}
```

#### 2.5 Implementar sync_service.rs (gRPC handlers)

**`crates/indra-daemon/src/sync_service.rs`**:

```rust
use tonic::{Request, Response, Status};
use std::sync::Arc;

use crate::db::EventStore;
use indra_daemon::sync::sync_service_server::SyncService;
use indra_daemon::sync::*;

pub struct SyncServiceImpl {
    device_id: String,
    event_store: Arc<EventStore>,
}

impl SyncServiceImpl {
    pub fn new(device_id: String, event_store: Arc<EventStore>) -> Self {
        Self {
            device_id,
            event_store,
        }
    }
}

#[tonic::async_trait]
impl SyncService for SyncServiceImpl {
    async fn pull(
        &self,
        request: Request<PullRequest>,
    ) -> Result<Response<PullResponse>, Status> {
        let req = request.into_inner();

        let current_version = self.event_store
            .get_current_version()
            .await
            .map_err(|e| Status::internal(e.to_string()))?;

        let events = self.event_store
            .get_events_since(req.since_version)
            .await
            .map_err(|e| Status::internal(e.to_string()))?;

        let pull_response = PullResponse {
            events: vec![],  // TODO: hydrate from DB
            current_version,
            has_more: false,
        };

        Ok(Response::new(pull_response))
    }

    async fn push(
        &self,
        request: Request<PushRequest>,
    ) -> Result<Response<PushResponse>, Status> {
        let req = request.into_inner();

        // Store events in DB
        for event in req.events {
            // TODO: conflict detection + version vector update
        }

        Ok(Response::new(PushResponse {
            conflict_event_ids: vec![],
            new_version: 1,
        }))
    }

    async fn subscribe(
        &self,
        request: Request<PullRequest>,
    ) -> Result<Response<tonic::Streaming<StreamEvent>>, Status> {
        // TODO: Implement real-time streaming
        Err(Status::unimplemented("subscribe not implemented"))
    }

    async fn heartbeat(
        &self,
        request: Request<HeartbeatRequest>,
    ) -> Result<Response<HeartbeatResponse>, Status> {
        let req = request.into_inner();
        
        tracing::info!(
            device_id = %req.device_id,
            device_name = %req.device_name,
            ip_address = %req.ip_address,
            port = req.port,
            "Received heartbeat"
        );

        Ok(Response::new(HeartbeatResponse {
            acknowledged: true,
            known_devices: vec![],  // TODO: return peer list
        }))
    }
}
```

### Fase 3 – Device Pairing y Trust

#### 3.1 Implementar config.rs (device configuration)

**`crates/indra-daemon/src/config.rs`**:

```rust
use std::path::PathBuf;

pub struct DaemonConfig {
    pub device_id: String,
    pub device_name: String,
    pub platform: String,  // "windows", "linux"
    pub sync_root: PathBuf,
    pub db_path: PathBuf,
    pub listen_host: String,  // "127.0.0.1" or "0.0.0.0"
    pub listen_port: u16,
    pub heartbeat_interval_secs: u64,
    pub mdns_enabled: bool,
    pub tls_enabled: bool,
    pub trusted_devices: Vec<String>,  // List of device IDs to trust
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

        Self {
            device_id: uuid::Uuid::new_v4().to_string(),
            device_name: hostname::get()
                .ok()
                .and_then(|h| h.into_string().ok())
                .unwrap_or_else(|| "indra-device".to_string()),
            platform: platform.to_string(),
            sync_root: std::env::var("INDRA_SYNC_ROOT")
                .ok()
                .map(PathBuf::from)
                .unwrap_or_else(|_| {
                    if cfg!(windows) {
                        PathBuf::from(format!(
                            "C:\\Users\\{}\\AppData\\Local\\Indra",
                            std::env::var("USERNAME").unwrap_or_default()
                        ))
                    } else {
                        PathBuf::from(format!("{}/.indra", std::env::var("HOME").unwrap_or_default()))
                    }
                }),
            db_path: PathBuf::from(".indra/sync.db"),
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
```

#### 3.2 Device pairing y trust (security module)

**`crates/indra-daemon/src/security.rs`** (nuevo archivo):

```rust
use anyhow::Result;
use hmac::{Hmac, Mac};
use sha2::Sha256;
use rand::Rng;

type HmacSha256 = Hmac<Sha256>;

pub struct DeviceTrust {
    device_id: String,
    shared_secret: Vec<u8>,  // HMAC-SHA256 key
}

impl DeviceTrust {
    pub fn generate_shared_secret() -> Vec<u8> {
        let mut rng = rand::thread_rng();
        let mut secret = vec![0u8; 32];  // 256-bit key
        rng.fill(&mut secret[..]);
        secret
    }

    pub fn new(device_id: String, shared_secret: Vec<u8>) -> Self {
        Self {
            device_id,
            shared_secret,
        }
    }

    pub fn sign_message(&self, message: &[u8]) -> Result<Vec<u8>> {
        let mut mac = HmacSha256::new_from_slice(&self.shared_secret)?;
        mac.update(message);
        Ok(mac.finalize().into_bytes().to_vec())
    }

    pub fn verify_message(&self, message: &[u8], signature: &[u8]) -> Result<bool> {
        let mut mac = HmacSha256::new_from_slice(&self.shared_secret)?;
        mac.update(message);
        Ok(mac.verify_slice(signature).is_ok())
    }

    pub fn generate_pairing_qr_code(&self) -> String {
        // Format: "indra://pair?device_id=<id>&secret=<hex>"
        format!(
            "indra://pair?device_id={}&secret={}",
            self.device_id,
            hex::encode(&self.shared_secret)
        )
    }
}
```

### Fase 4 – Sync State Machine y Conflict Resolution

#### 4.1 Versioning y conflict resolution

**`crates/indra-daemon/src/versioning.rs`** (nuevo archivo):

```rust
use std::collections::HashMap;

/// Vector clock for causal ordering (conflict detection)
#[derive(Clone, Debug)]
pub struct VersionVector {
    clocks: HashMap<String, u32>,  // device_id -> logical clock
}

impl VersionVector {
    pub fn new() -> Self {
        Self {
            clocks: HashMap::new(),
        }
    }

    pub fn increment(&mut self, device_id: &str) {
        self.clocks
            .entry(device_id.to_string())
            .and_modify(|c| *c += 1)
            .or_insert(1);
    }

    pub fn merge(&mut self, other: &VersionVector) {
        for (device_id, clock) in &other.clocks {
            let entry = self.clocks.entry(device_id.clone()).or_insert(0);
            *entry = (*entry).max(*clock);
        }
    }

    pub fn happens_before(&self, other: &VersionVector) -> bool {
        let mut found_less = false;
        for (device_id, clock) in &other.clocks {
            let my_clock = *self.clocks.get(device_id).unwrap_or(&0);
            if my_clock > *clock {
                return false;  // Concurrent or happens after
            }
            if my_clock < *clock {
                found_less = true;
            }
        }
        found_less
    }

    pub fn concurrent_with(&self, other: &VersionVector) -> bool {
        !self.happens_before(other) && !other.happens_before(self)
    }
}

pub enum ConflictResolution {
    LastWriteWins,      // Use modification time
    VersionVector,      // Use causal ordering
    Manual,            // Require user intervention
}

pub fn resolve_conflict(
    local_modified_ms: i64,
    remote_modified_ms: i64,
    local_version: &VersionVector,
    remote_version: &VersionVector,
    strategy: ConflictResolution,
) -> bool {
    match strategy {
        ConflictResolution::LastWriteWins => {
            remote_modified_ms > local_modified_ms
        }
        ConflictResolution::VersionVector => {
            remote_version.happens_before(local_version)
        }
        ConflictResolution::Manual => {
            // Return false; let caller decide
            false
        }
    }
}
```

### Fase 5 – Integración con Cliente Desktop

#### 5.1 Crear cliente gRPC en Next.js

**`src/lib/daemon-client.ts`** (nuevo archivo):

```typescript
import { grpc } from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';

const PROTO_PATH = '../../crates/indra-daemon/proto/sync.proto';

export class DaemonClient {
  private client: any;
  private daemonHost: string;
  private daemonPort: number;

  constructor(host: string = 'localhost', port: number = 9876) {
    this.daemonHost = host;
    this.daemonPort = port;
    this.client = null;
  }

  async connect(): Promise<void> {
    try {
      const packageDefinition = await protoLoader.load(PROTO_PATH, {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true,
      });

      const protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
      const SyncService = (protoDescriptor.indra as any).sync.SyncService;

      this.client = new SyncService(
        `${this.daemonHost}:${this.daemonPort}`,
        grpc.credentials.createInsecure()
      );

      console.log(`Connected to daemon at ${this.daemonHost}:${this.daemonPort}`);
    } catch (error) {
      console.error('Failed to connect to daemon:', error);
      throw error;
    }
  }

  async pull(deviceId: string, sinceVersion: number): Promise<any> {
    return new Promise((resolve, reject) => {
      this.client.pull(
        {
          device_id: deviceId,
          since_version: sinceVersion,
          sync_root: process.env.INDRA_SYNC_ROOT || '/tmp/indra',
        },
        (error: any, response: any) => {
          if (error) reject(error);
          else resolve(response);
        }
      );
    });
  }

  async push(events: any[]): Promise<any> {
    return new Promise((resolve, reject) => {
      this.client.push(
        { events },
        (error: any, response: any) => {
          if (error) reject(error);
          else resolve(response);
        }
      );
    });
  }

  async heartbeat(deviceId: string, deviceName: string, ip: string, port: number): Promise<any> {
    return new Promise((resolve, reject) => {
      this.client.heartbeat(
        {
          device_id: deviceId,
          device_name: deviceName,
          ip_address: ip,
          port,
        },
        (error: any, response: any) => {
          if (error) reject(error);
          else resolve(response);
        }
      );
    });
  }
}
```

## Prohibiciones

- **No prometer** sincronización nativa del SO sin binario real del daemon.
- **No tocar** archivos del adaptador S3/R2 salvo si afecta directamente gRPC.
- **No crear** nuevos providers; reutilizar `s3` y `local`.
- **No stagear** `.claude/settings.local.json`.
- **No usar** `git add -A` ni `git add .`.
- **No publicar** las claves de dispositivo (shared_secret) en logs ni env vars sin cifrar.

## Verificación

```powershell
# Build Rust daemon
cd crates/indra-daemon
cargo build --release
$daemonBinary = ".\target\release\indra-daemon.exe"

# Verify binary exists
if (-not (Test-Path $daemonBinary)) {
  Write-Error "Daemon binary not built"
  exit 1
}

# Test proto compilation
cargo build --all
if ($LASTEXITCODE -ne 0) {
  Write-Error "Proto compilation failed"
  exit 1
}

# Run basic unit tests
cargo test --lib

# Type check Next.js client
npx tsc --noEmit

# Lint
npm run lint

# Build Next.js
npm run build

# Verify docs updated
if (-not (Test-Path "docs/plans/23_PLAN_multi-device-sync.md")) {
  Write-Error "Plan doc missing"
  exit 1
}
```

## E2E Verification (Post-Implementation)

1. **Dispositivo A**: Inicia daemon en puerto 9876
   ```bash
   ./indra-daemon --sync-root=/tmp/indra-a --listen-port=9876
   ```

2. **Dispositivo B**: Inicia daemon en puerto 9877
   ```bash
   ./indra-daemon --sync-root=/tmp/indra-b --listen-port=9877
   ```

3. **Emparejamiento**: Escanea QR de A en B (o ingresa ID manualmente)

4. **Crear archivo en A**: 
   ```bash
   echo "test" > /tmp/indra-a/test.txt
   ```

5. **Verificar sincronización en B** (debe aparecer en <5s en LAN):
   ```bash
   ls -la /tmp/indra-b/test.txt
   cat /tmp/indra-b/test.txt
   ```

6. **Modificar en B, verificar en A**:
   ```bash
   echo "modified" >> /tmp/indra-b/test.txt
   # Wait 5s
   cat /tmp/indra-a/test.txt
   ```

## Entregables

### Binarios:
- `crates/indra-daemon/target/release/indra-daemon` (Linux/macOS)
- `crates/indra-daemon/target/release/indra-daemon.exe` (Windows)

### Fuentes:
- `crates/indra-daemon/src/lib.rs`
- `crates/indra-daemon/src/daemon.rs`
- `crates/indra-daemon/src/sync_service.rs`
- `crates/indra-daemon/src/db.rs`
- `crates/indra-daemon/src/filewatcher.rs`
- `crates/indra-daemon/src/config.rs`
- `crates/indra-daemon/src/security.rs`
- `crates/indra-daemon/src/versioning.rs`

### Contratos:
- `crates/indra-daemon/proto/sync.proto`

### Cliente:
- `src/lib/daemon-client.ts`
- `src/app/api/daemon/route.ts` (bridge HTTP → gRPC)

### Documentación:
- `docs/plans/23_PLAN_multi-device-sync.md`

## Commit

```text
feat(daemon): add multi-device sync with gRPC

- Implement indra-daemon crate with tokio async runtime
- Define SyncService proto (pull/push/subscribe/heartbeat)
- Add SQLite event journal with version vectors
- Implement device pairing with HMAC-SHA256 trust
- Add conflict resolution (last-write-wins + version vectors)
- Create gRPC client for Next.js integration
- Add mDNS for automatic device discovery
- Support TLS 1.3 for secure inter-device comms

Closes: [ISSUE_NUMBER]
Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
```
