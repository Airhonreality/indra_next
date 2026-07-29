---
titulo: Indra Desktop Storage - Daemon Rust (Producción)
version: 1.0
estado: PLANIFICACIÓN
timeline: 8-12 semanas
---

# Indra Desktop Storage Daemon — Arquitectura Rust Completa

## Objetivo Final

Un daemon funcional 100% que:
- ✅ Instala en Windows 10+ y Linux
- ✅ Crea carpeta virtual (~/ Indra Drive)
- ✅ Sincroniza archivos entre 2+ equipos en tiempo real
- ✅ Se integra nativo con File Explorer (Windows) y Nautilus (Linux)
- ✅ No requiere web browser para uso diario

---

## Estructura del Proyecto Rust

```
indra-daemon/
├── Cargo.workspace.toml
├── crates/
│   ├── indra-core/              # Motor de sincronización base
│   │   ├── src/
│   │   │   ├── lib.rs
│   │   │   ├── fs_abstraction.rs    # StorageProvider trait
│   │   │   ├── sync_engine.rs       # FastCDC, BLAKE3, state machine
│   │   │   ├── cache.rs             # SQLite, RocksDB
│   │   │   ├── network.rs           # gRPC client/server
│   │   │   └── types.rs             # Contratos (SyncEvent, FileState, etc)
│   │   └── Cargo.toml
│   │
│   ├── indra-windows/           # Integración Windows CFAPI
│   │   ├── src/
│   │   │   ├── lib.rs
│   │   │   ├── cfapi.rs         # CfRegisterSyncRoot, CfConnectSyncRoot
│   │   │   ├── callbacks.rs     # CF_CALLBACK_TYPE_FETCH_DATA, etc
│   │   │   ├── registry.rs      # HKCU\SOFTWARE\SyncEngines\Providers
│   │   │   └── thumbnail_provider.rs # COM IThumbnailProvider
│   │   └── Cargo.toml
│   │
│   ├── indra-linux/             # Integración Linux FUSE
│   │   ├── src/
│   │   │   ├── lib.rs
│   │   │   ├── fuse_handler.rs  # fuse3 traits (FileSystem)
│   │   │   ├── io_uring.rs      # Async I/O
│   │   │   ├── dbus.rs          # D-Bus thumbnail service
│   │   │   └── passthrough.rs   # FUSE_PASSTHROUGH para archivos hidratados
│   │   └── Cargo.toml
│   │
│   ├── indra-daemon/            # Binario principal
│   │   ├── src/
│   │   │   ├── main.rs
│   │   │   ├── config.rs        # .config/indra/daemon.toml
│   │   │   ├── grpc_server.rs   # gRPC listener para multi-device
│   │   │   ├── signal_handlers.rs
│   │   │   └── logger.rs
│   │   └── Cargo.toml
│   │
│   └── indra-tui/               # CLI/TUI para diagnóstico
│       ├── src/
│       │   ├── main.rs
│       │   ├── commands.rs      # status, sync, config
│       │   └── ui.rs
│       └── Cargo.toml
│
├── tauri-installer/             # Instalador Rust + Web UI
│   ├── src-tauri/
│   │   ├── lib.rs
│   │   └── main.rs
│   ├── src/
│   │   ├── App.tsx              # React
│   │   ├── pages/
│   │   │   ├── Welcome.tsx
│   │   │   ├── Installation.tsx
│   │   │   ├── Configuration.tsx
│   │   │   └── Success.tsx
│   │   └── App.css
│   ├── tauri.conf.json
│   └── package.json
│
├── docs/
│   ├── ARCHITECTURE.md           # Overview técnico
│   ├── WINDOWS_CFAPI.md          # Especificación CFAPI
│   ├── LINUX_FUSE.md             # Especificación FUSE
│   ├── GRPC_PROTOCOL.md          # Especificación de sincronización
│   ├── BUILD.md                  # Cómo compilar
│   └── TROUBLESHOOTING.md
│
└── Cargo.lock

---

## Fases de Implementación

### Fase 1: Abstracción del Sistema de Archivos (2 semanas)

**Objetivo:** Motor de sincronización agnóstico de SO

**Crates:**
- `indra-core`: StorageProvider trait, sync engine, FastCDC
- Unit tests para cada componente

**Deliverables:**
- ✅ Trait StorageProvider (read, write, delete, list, watch)
- ✅ FastCDC chunker (SIMD, 64KB avg blocks)
- ✅ BLAKE3 hasher (parallelizado)
- ✅ SQLite cache (metadata, state tracking)
- ✅ State machine (pending, syncing, synced, error)

**Criterio de aceptación:**
```
cargo test --release (todos los tests pasan)
FastCDC benchmark: >50 MB/s chunking
BLAKE3 benchmark: >100 MB/s hashing
```

---

### Fase 2: Integración SO + Shell Extensions (3 semanas)

**Windows (indra-windows):**
- ✅ CfRegisterSyncRoot + CfConnectSyncRoot
- ✅ Callbacks: FETCH_DATA, CANCEL_FETCH, DELETE, RENAME
- ✅ Windows Registry keys (HKCU\SOFTWARE\SyncEngines\Providers\Indra)
- ✅ COM DLL (IThumbnailProvider, IPropertyStore)

**Linux (indra-linux):**
- ✅ FUSE 3 mount + io_uring
- ✅ FUSE_PASSTHROUGH (archivos hidratados)
- ✅ D-Bus Thumbnailer service
- ✅ inotify watchers

**Criterio de aceptación:**
```
Windows:
  ✓ mkdir ~/Indra\ Drive exitoso
  ✓ Archivos aparecen en File Explorer
  ✓ Thumbnails se generan sin bloqueos
  ✓ Registry entries presentes

Linux:
  ✓ FUSE mount en /home/user/Indra\ Drive
  ✓ ls -la muestra placeholders
  ✓ Nautilus/Dolphin muestra estructura
  ✓ Thumbnails vía D-Bus
```

---

### Fase 3: Sincronización Multi-Dispositivo (3 semanas)

**gRPC Protocol:**
- ✅ SyncService (Pull/Push updates)
- ✅ EventStream (file-created, file-updated, file-deleted)
- ✅ Metadata exchange (FastCDC chunks, BLAKE3 hashes)
- ✅ Conflict resolution (last-write-wins, version vectors)

**Local Daemon:**
- ✅ Escucha en localhost:9876 (Windows) o /run/indra/sync.sock (Linux)
- ✅ Heartbeat cada 5s
- ✅ Reconnection logic (exponential backoff)
- ✅ Offline queue (SQLite journal)

**Multi-Device:**
- ✅ Device pairing (QR code, manual ID)
- ✅ Trust establishment (HMAC-SHA256)
- ✅ Encryption in transit (TLS 1.3)
- ✅ Device sync metadata (deviceId, deviceName, lastSeen)

**Criterio de aceptación:**
```
Equipo A: create ~/Indra\ Drive/archivo.txt
Equipo B: archivo.txt aparece en ~/Indra\ Drive/
Tiempo de sincronización: <5s en red local, <30s en WAN
Conflicto: Ambos editan mismo archivo → merge o versioning
```

---

### Fase 4: Instalador Tauri (2 semanas)

**Windows MSI:**
- ✅ Download daemon binary
- ✅ Install como Windows Service (background)
- ✅ Register COM DLL
- ✅ Create Registry entries
- ✅ Create ~/Indra\ Drive folder
- ✅ Launch UI post-install

**Linux (snap, deb, AppImage):**
- ✅ Download binary
- ✅ Install en ~/.local/bin/
- ✅ Create systemd service
- ✅ D-Bus service registration
- ✅ Create ~/Indra\ Drive folder

**Criterio de aceptación:**
```
Windows:
  ✓ setup.exe → instalación silenciosa
  ✓ Services.msc muestra "Indra Storage Daemon"
  ✓ ~/Indra\ Drive existe post-install
  ✓ Daemon inicia automáticamente

Linux:
  ✓ apt install indra-daemon (o snap install)
  ✓ systemctl status indra-daemon (running)
  ✓ ~/Indra\ Drive existe
  ✓ Daemon inicia automáticamente
```

---

### Fase 5: Testing & Polish (2 semanas)

**Pruebas:**
- ✅ Unit tests (FastCDC, BLAKE3, state machine)
- ✅ Integration tests (FS operations, sync)
- ✅ E2E tests (2 máquinas, sincronización real)
- ✅ Stress tests (10K files, large files, concurrent edits)

**Polish:**
- ✅ Error messages claros
- ✅ Logging (trace, debug, info, warn, error)
- ✅ Telemetry (opt-in)
- ✅ Documentation

---

## Stack Tecnológico

### Core
- **tokio** - Async runtime
- **tonic** - gRPC framework
- **prost** - Protocol Buffers
- **rusqlite** / **rocksdb** - Persistent state
- **blake3** - Content hashing
- **parking_lot** - Synchronization

### Windows
- **winapi** / **windows-rs** - Windows APIs
- **com** - COM interop
- **registry** - Windows Registry

### Linux
- **fuse3** - FUSE filesystem
- **io-uring** - Async I/O
- **zbus** - D-Bus client

### Installer
- **tauri** - Cross-platform app shell
- **serde** - Serialization
- **reqwest** - HTTP client

### Development
- **cargo-cross** - Cross-compilation
- **criterion** - Benchmarking
- **proptest** - Property testing

---

## Cronograma Realista

```
Semana 1-2:   Fase 1 (Core engine)
Semana 3-5:   Fase 2 (Windows CFAPI, Linux FUSE)
Semana 6-8:   Fase 3 (gRPC sync)
Semana 9:     Fase 4 (Tauri installer)
Semana 10-12: Fase 5 (Testing, bugfixes)

Total: 12 semanas (3 meses) para 1 persona dedicada
       6 semanas para equipo de 2 personas
```

---

## Entregables por Fase

### Fase 1
- ✅ `indra-core` crate compilable
- ✅ 90%+ test coverage
- ✅ Benchmark report

### Fase 2
- ✅ `indra-windows` + `indra-linux` crates
- ✅ Daemon binary que monta FS
- ✅ File Explorer / Nautilus integration

### Fase 3
- ✅ gRPC services implementadas
- ✅ Device pairing funcional
- ✅ Multi-device sync end-to-end

### Fase 4
- ✅ Windows MSI installer
- ✅ Linux packages (deb, snap, AppImage)
- ✅ Auto-update mechanism

### Fase 5
- ✅ Full test suite
- ✅ Documentation
- ✅ Release binaries

---

## Riesgos & Mitigación

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|-----------|
| Windows CFAPI instability | Media | Alto | Early testing en CI/CD, user mode fallback |
| FUSE performance | Baja | Medio | Profiling temprano, io_uring optimization |
| gRPC complexity | Baja | Medio | Simplified protocol v1, extend later |
| Multi-platform testing | Alta | Medio | CI matrix (Windows 10/11, Ubuntu 20.04/22.04) |

---

## Próximos Pasos

1. ✅ Crear estructura de workspace Rust
2. ✅ Scaffolding de crates (Fase 1-5)
3. ✅ Crear planes detallados por fase
4. ✅ Iniciar Fase 1 (core engine)
