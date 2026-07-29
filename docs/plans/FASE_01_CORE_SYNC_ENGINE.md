---
plan: FASE_01_CORE_SYNC_ENGINE
estado: PLANIFICACION
version: 1.0
depende_de: ["19_PLAN_desktop-storage-shell"]
referencias: 
  - "docs/research/Local drive integration.md.txt"
  - "docs/plans/19_PLAN_desktop-storage-shell.md"
---

# Fase 1: Abstracción del Sistema de Archivos + Sync Engine

## 1. Contexto

El desarrollo de un cliente de escritorio para almacenamiento soberano exige un motor de sincronización que **no dependa de APIs específicas del sistema operativo** (CFAPI en Windows, FUSE en Linux). Este motor debe ser agnóstico al SO, permitiendo que:

1. Se compile y testee en cualquier plataforma (Windows, macOS, Linux)
2. Sea **agnóstico a la virtualización del filesystem** nativo
3. Proporcione una abstracción uniforme para operaciones de lectura, escritura, eliminación y listado
4. Implemente algoritmos avanzados de sincronización: **FastCDC** para fragmentación dinámica y **BLAKE3** para hashing paralelo
5. Mantenga estado de sincronización en una base de datos **SQLite embebida**
6. Sirva como **cimiento para integraciones futuras** con CFAPI y FUSE sin reescrituras

Este motor constituye el `indra-core` crate de Rust y será consumido tanto por servicios headless (Linux daemon, Windows service) como por la capa de UI desktop.

---

## 2. Objetivo

Construir un **motor de sincronización agnóstico de SO** que:

- Abstrae completamente las operaciones de filesystem mediante un trait genérico `StorageProvider`
- Implementa fragmentación de contenido dinámico (**FastCDC**) con parámetros: 16 KB (mín), 64 KB (promedio), 1 MB (máx)
- Calcula hashes criptográficos paralelos mediante **BLAKE3** a velocidades >100 MB/s
- Gestiona estado de sincronización mediante una máquina de estados explícita: `Pending → Syncing → Synced | Error`
- Almacena metadatos, caché de contenido y vectores de versión en **SQLite con WAL**
- Logra velocidades de fragmentación >50 MB/s en hardware estándar
- Proporciona APIs no bloqueantes basadas en `async/await`
- Se verifique mediante tests unitarios de cada subsistema y benchmarks de rendimiento

**Salida esperada:** Un crate `indra-core` compilable con `cargo build --release`, sin dependencias de SO específicas, con documentación de API y ejemplos de uso.

---

## 3. Componentes Principales

### 3.1 StorageProvider Trait (Abstracción Agnóstica)

Define la interfaz uniforme para operaciones de filesystem:

```rust
/// Trait agnóstico de SO para operaciones de almacenamiento
pub trait StorageProvider: Send + Sync + Clone {
    /// Leer archivo completo o rango de bytes
    async fn read_file(
        &self,
        path: &Path,
        range: Option<(u64, u64)>,
    ) -> Result<Vec<u8>, StorageError>;

    /// Escribir contenido (creación o sobrescritura)
    async fn write_file(
        &self,
        path: &Path,
        content: &[u8],
        metadata: FileMetadata,
    ) -> Result<FileHandle, StorageError>;

    /// Eliminar archivo o directorio
    async fn delete(&self, path: &Path, recursive: bool) -> Result<(), StorageError>;

    /// Listar directorio con metadatos
    async fn list_dir(
        &self,
        path: &Path,
    ) -> Result<Vec<DirectoryEntry>, StorageError>;

    /// Obtener metadatos de archivo/directorio
    async fn get_metadata(&self, path: &Path) -> Result<FileMetadata, StorageError>;

    /// Observar cambios en directorio (opcional para providers locales)
    fn watch_dir(&self, path: &Path) -> Result<Receiver<FsEvent>, StorageError>;

    /// Crear directorio
    async fn create_dir(&self, path: &Path) -> Result<(), StorageError>;

    /// Verificar si existe archivo
    async fn exists(&self, path: &Path) -> Result<bool, StorageError>;
}

/// Metadatos uniformes de archivo
#[derive(Clone, Debug)]
pub struct FileMetadata {
    pub path: PathBuf,
    pub size: u64,
    pub modified: SystemTime,
    pub is_dir: bool,
    pub permissions: u32,
    pub content_hash: Option<Blake3Hash>,
}

/// Eventos de observación de directorio
#[derive(Debug, Clone)]
pub enum FsEvent {
    Created(PathBuf),
    Modified(PathBuf),
    Deleted(PathBuf),
    Renamed { from: PathBuf, to: PathBuf },
}
```

### 3.2 FastCDC Chunker (Fragmentación Dinámica)

Implementa el algoritmo de Content-Defined Chunking con Gear rolling hash y soporte SIMD:

```rust
/// Motor de fragmentación definida por contenido (FastCDC)
pub struct FastCdcChunker {
    /// Tamaño mínimo de chunk (bytes)
    min_chunk_size: usize,
    /// Tamaño promedio de chunk (bytes)
    avg_chunk_size: usize,
    /// Tamaño máximo de chunk (bytes)
    max_chunk_size: usize,
    /// Mask para determinar límites de chunk
    chunk_mask: u64,
    /// Tabla de Gear hash precalculada
    gear_table: [u64; 256],
}

#[derive(Debug, Clone)]
pub struct Chunk {
    pub offset: u64,
    pub size: u64,
    pub hash: Blake3Hash,
}

impl FastCdcChunker {
    /// Crear instancia con parámetros estándar:
    /// min=16KB, avg=64KB, max=1MB
    pub fn new_standard() -> Self { /* ... */ }

    /// Fragmentar stream de bytes
    pub async fn chunk(&self, data: &[u8]) -> Result<Vec<Chunk>, CdcError> { /* ... */ }

    /// Fragmentar archivo desde path (streaming)
    pub async fn chunk_file(
        &self,
        path: &Path,
    ) -> Result<Vec<Chunk>, CdcError> { /* ... */ }
}

// Implementación interna:
// - Gear rolling hash optimizado con ventana deslizante de 32 bytes
// - SIMD (AVX2/AVX-512) cuando está disponible
// - Saltos incondicionales de min_chunk_size tras cada límite (25% de optimización)
```

### 3.3 BLAKE3 Hasher (Hashing Paralelo)

Implementa tree hashing criptográfico con paralelismo de plataforma:

```rust
/// Wrapper sobre blake3 crate con paralelismo
pub struct Blake3Hasher;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct Blake3Hash([u8; 32]);

impl Blake3Hasher {
    /// Hashear datos en memoria
    pub fn hash(data: &[u8]) -> Blake3Hash {
        let mut hasher = blake3::Hasher::new();
        hasher.update(data);
        Blake3Hash(hasher.finalize().into())
    }

    /// Hashear archivo completo con paralelismo
    pub async fn hash_file(path: &Path) -> Result<Blake3Hash, HashError> { /* ... */ }

    /// Hashear chunks en paralelo (para deduplicación)
    pub async fn hash_chunks(chunks: &[&[u8]]) -> Result<Vec<Blake3Hash>, HashError> { /* ... */ }

    /// Crear tree hash de múltiples bloques (Merkle tree)
    pub async fn tree_hash(chunks: &[Blake3Hash]) -> Result<Blake3Hash, HashError> { /* ... */ }
}

// Propiedades:
// - Velocidad >100 MB/s en CPU moderna
// - Tree hash aprovecha todos los cores
// - Compatible con blake3 spec oficial
```

### 3.4 State Machine (Control de Sincronización)

Define el ciclo de vida de cada archivo durante sincronización:

```rust
/// Estados posibles de un archivo en sincronización
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SyncState {
    /// Cambios locales pendientes
    Pending,
    /// En proceso de sincronización
    Syncing {
        progress: f32, // 0.0 a 1.0
        started_at: SystemTime,
    },
    /// Sincronizado completamente
    Synced {
        synced_at: SystemTime,
    },
    /// Error en sincronización
    Error {
        reason: String,
        retry_count: u32,
    },
}

/// Entrada de state machine
#[derive(Debug, Clone)]
pub struct SyncEntry {
    pub path: PathBuf,
    pub state: SyncState,
    pub local_metadata: FileMetadata,
    pub remote_metadata: Option<FileMetadata>,
    pub chunks: Option<Vec<Chunk>>,
    pub chunk_hashes: Option<Vec<Blake3Hash>>,
}

/// Transiciones de estado
impl SyncEntry {
    pub fn start_sync(&mut self) -> Result<(), SyncError> { /* ... */ }
    pub fn complete_sync(&mut self) -> Result<(), SyncError> { /* ... */ }
    pub fn fail_sync(&mut self, reason: String) -> Result<(), SyncError> { /* ... */ }
    pub fn update_progress(&mut self, progress: f32) -> Result<(), SyncError> { /* ... */ }
}
```

### 3.5 SQLite Cache Layer (Persistencia de Estado)

Almacena metadatos, chunks y vectores de versión en base de datos local:

```rust
/// Manager de cache en SQLite con WAL
pub struct SyncDb {
    connection_pool: Arc<Mutex<rusqlite::Connection>>,
}

impl SyncDb {
    /// Inicializar BD con esquema
    pub async fn init(db_path: &Path) -> Result<Self, DbError> { /* ... */ }

    // Operaciones de archivos
    pub async fn upsert_file(&self, entry: &SyncEntry) -> Result<(), DbError> { /* ... */ }
    pub async fn get_file(&self, path: &Path) -> Result<Option<SyncEntry>, DbError> { /* ... */ }
    pub async fn list_files(&self, state: SyncState) -> Result<Vec<SyncEntry>, DbError> { /* ... */ }
    pub async fn delete_file(&self, path: &Path) -> Result<(), DbError> { /* ... */ }

    // Operaciones de chunks
    pub async fn store_chunks(&self, path: &Path, chunks: &[Chunk]) -> Result<(), DbError> { /* ... */ }
    pub async fn get_chunks(&self, path: &Path) -> Result<Vec<Chunk>, DbError> { /* ... */ }

    // Deduplicación
    pub async fn store_hash_reference(&self, hash: Blake3Hash, path: &Path) -> Result<(), DbError> { /* ... */ }
    pub async fn find_duplicates(&self, hash: Blake3Hash) -> Result<Vec<PathBuf>, DbError> { /* ... */ }

    // Vectores de versión para detección de conflictos
    pub async fn store_version_vector(&self, path: &Path, vector: &VersionVector) -> Result<(), DbError> { /* ... */ }
    pub async fn get_version_vector(&self, path: &Path) -> Result<Option<VersionVector>, DbError> { /* ... */ }
}

// Esquema SQLite:
// CREATE TABLE sync_entries (
//     path TEXT PRIMARY KEY,
//     state TEXT NOT NULL,
//     local_size INTEGER,
//     modified_at INTEGER,
//     synced_at INTEGER,
//     error_reason TEXT
// );
//
// CREATE TABLE chunks (
//     id INTEGER PRIMARY KEY,
//     path TEXT NOT NULL,
//     offset INTEGER,
//     size INTEGER,
//     hash BLOB NOT NULL,
//     FOREIGN KEY (path) REFERENCES sync_entries(path)
// );
//
// CREATE TABLE version_vectors (
//     path TEXT PRIMARY KEY,
//     vector BLOB NOT NULL,
//     updated_at INTEGER
// );
```

### 3.6 Sync Engine (Orquestador)

Coordina fragmentación, hashing, deduplicación y colas de trabajo:

```rust
/// Orquestador principal del motor de sincronización
pub struct SyncEngine<P: StorageProvider> {
    /// Provider de almacenamiento (agnóstico de SO)
    provider: P,
    /// Base de datos de metadatos
    db: Arc<SyncDb>,
    /// Motor FastCDC
    chunker: FastCdcChunker,
    /// Colas de trabajo con prioridades
    critical_queue: mpsc::UnboundedSender<SyncTask>,
    medium_queue: mpsc::UnboundedSender<SyncTask>,
    low_queue: mpsc::UnboundedSender<SyncTask>,
}

#[derive(Debug, Clone)]
pub enum SyncTask {
    /// Prioridad crítica: I/O interactiva del kernel
    FetchData { path: PathBuf, range: (u64, u64) },
    /// Prioridad media: metadatos y miniaturas
    ProcessMetadata { path: PathBuf },
    /// Prioridad baja: upload predictivo, background sync
    BackgroundChunk { path: PathBuf },
}

impl<P: StorageProvider> SyncEngine<P> {
    /// Crear instancia
    pub async fn new(
        provider: P,
        db_path: &Path,
    ) -> Result<Self, EngineError> { /* ... */ }

    /// Registrar cambio local y encolar para sincronización
    pub async fn sync_file(&self, path: &Path) -> Result<(), EngineError> { /* ... */ }

    /// Procesar archivo: fragmentar, hashear, deduplicar
    pub async fn process_file(&self, path: &Path) -> Result<SyncEntry, EngineError> { /* ... */ }

    /// Iniciar ciclo de sincronización con remoto
    pub async fn start_sync_cycle(&self) -> Result<(), EngineError> { /* ... */ }

    /// Obtener estado actual de archivo
    pub async fn get_sync_status(&self, path: &Path) -> Result<SyncState, EngineError> { /* ... */ }

    /// Listar archivos pendientes de sincronización
    pub async fn list_pending(&self) -> Result<Vec<SyncEntry>, EngineError> { /* ... */ }

    /// Escuchar cambios en directorio y encolarlos automáticamente
    pub async fn watch_and_sync(&self, root: &Path) -> Result<(), EngineError> { /* ... */ }
}
```

---

## 4. Operaciones: Step-by-Step

### Fase 1.1: Crear el Proyecto Rust

```bash
# Crear workspace
cargo new --name indra-core indra-core

# Agregar dependencias (Cargo.toml)
[package]
name = "indra-core"
version = "0.1.0"
edition = "2024"

[dependencies]
tokio = { version = "1", features = ["full"] }
rusqlite = { version = "0.31", features = ["bundled", "chrono"] }
blake3 = "1.5"
fastcdc = "0.3"  # O implementar internamente
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tracing = "0.1"
thiserror = "1"
async-trait = "0.1"
parking_lot = "0.12"
rayon = "1.7"  # Para paralelismo
tempfile = "3"  # Para tests
```

### Fase 1.2: Implementar StorageProvider Trait

1. Crear archivo `src/storage/provider.rs`
2. Definir trait con métodos async
3. Crear implementación mock para testing
4. Crear implementación local (filesystem real)

### Fase 1.3: Implementar FastCDC Chunker

1. Crear archivo `src/chunking/fastcdc.rs`
2. Precalcular tabla de Gear hash
3. Implementar rolling hash con ventana deslizante
4. Agregar SIMD cuando esté disponible (conditional compilation)
5. Validar fragmentación en tests

### Fase 1.4: Implementar BLAKE3 Hasher

1. Crear archivo `src/hashing/blake3_wrapper.rs`
2. Wrapper sobre `blake3` crate
3. Implementar hashing de archivo completo (streaming)
4. Implementar tree hash paralelo
5. Benchmark de velocidad

### Fase 1.5: Crear SQLite Cache Layer

1. Crear archivo `src/db/mod.rs`
2. Definir esquema SQL
3. Migración automática en `init()`
4. Operaciones CRUD para sync entries
5. Operaciones para chunks y vectores de versión
6. Activar WAL mode para concurrencia

### Fase 1.6: Implementar State Machine

1. Crear archivo `src/sync/state.rs`
2. Enum SyncState con variantes
3. Transiciones válidas
4. Persistencia en BD

### Fase 1.7: Implementar SyncEngine

1. Crear archivo `src/sync/engine.rs`
2. Tres colas de trabajo (critical, medium, low)
3. Tokio spawned tasks para cada cola
4. Coordinar entre chunker, hasher, y DB
5. Mecanismo de retry con exponential backoff

### Fase 1.8: Crear API Pública

1. Archivo `src/lib.rs`
2. Re-exportar tipos públicos
3. Documentar módulos
4. Ejemplos de uso

---

## 5. Tests

### 5.1 Tests Unitarios

**Módulo: chunking**
```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_fastcdc_consistent_boundaries() {
        // Verificar que ediciones pequeñas no invalidan límites
    }

    #[tokio::test]
    async fn test_fastcdc_min_max_sizes() {
        // Todos los chunks dentro de [min, max]
    }

    #[tokio::test]
    async fn test_fastcdc_empty_file() {
        // Archivos vacíos devuelven vec vacío
    }

    #[test]
    fn test_gear_table_calculation() {
        // Tabla de hash correcta
    }
}
```

**Módulo: hashing**
```rust
#[cfg(test)]
mod tests {
    #[tokio::test]
    async fn test_blake3_deterministic() {
        // Mismo contenido = mismo hash
    }

    #[tokio::test]
    async fn test_blake3_file_streaming() {
        // Hash de archivo = hash de contenido
    }

    #[tokio::test]
    async fn test_tree_hash_order() {
        // Tree hash es determinista
    }
}
```

**Módulo: db**
```rust
#[cfg(test)]
mod tests {
    #[tokio::test]
    async fn test_db_init() {
        // Esquema correcto
    }

    #[tokio::test]
    async fn test_upsert_get_file() {
        // Inserción y lectura
    }

    #[tokio::test]
    async fn test_chunk_storage() {
        // Persistencia de chunks
    }

    #[tokio::test]
    async fn test_dedup_lookup() {
        // Búsqueda de duplicados
    }
}
```

**Módulo: sync::engine**
```rust
#[cfg(test)]
mod tests {
    #[tokio::test]
    async fn test_sync_file_basic() {
        // Flujo completo de sincronización
    }

    #[tokio::test]
    async fn test_state_transitions() {
        // Transiciones válidas
    }

    #[tokio::test]
    async fn test_dedup_saves_bandwidth() {
        // Hash match = no reupload
    }
}
```

### 5.2 Tests de Integración

```rust
#[cfg(test)]
mod integration_tests {
    #[tokio::test]
    async fn test_full_workflow() {
        // 1. Crear archivo
        // 2. Iniciar sync
        // 3. Fragmentar con FastCDC
        // 4. Hashear con BLAKE3
        // 5. Verificar BD
        // 6. Detectar cambios pequeños
        // 7. Verificar deduplicación
    }

    #[tokio::test]
    async fn test_large_file_sync() {
        // Archivo >100 MB
        // Verificar streaming
    }

    #[tokio::test]
    async fn test_concurrent_sync() {
        // Múltiples archivos simultáneamente
    }
}
```

---

## 6. Benchmarks

### 6.1 Configurar Harness de Benchmark

```toml
# Cargo.toml
[[bench]]
name = "fastcdc_bench"
harness = false

[[bench]]
name = "blake3_bench"
harness = false

[[bench]]
name = "db_bench"
harness = false
```

### 6.2 FastCDC Benchmark

```rust
// benches/fastcdc_bench.rs
use criterion::{black_box, criterion_group, criterion_main, Criterion};
use indra_core::chunking::FastCdcChunker;

fn bench_fastcdc(c: &mut Criterion) {
    let runtime = tokio::runtime::Runtime::new().unwrap();

    c.bench_function("fastcdc_50mb", |b| {
        b.to_async(&runtime).iter(|| async {
            let chunker = FastCdcChunker::new_standard();
            let data = black_box(vec![0x42; 50 * 1024 * 1024]);
            let _ = chunker.chunk(&data).await;
        });
    });
}

criterion_group!(benches, bench_fastcdc);
criterion_main!(benches);
```

**Target:** >50 MB/s en CPU de escritorio

### 6.3 BLAKE3 Benchmark

```rust
// benches/blake3_bench.rs
fn bench_blake3(c: &mut Criterion) {
    let runtime = tokio::runtime::Runtime::new().unwrap();

    c.bench_function("blake3_100mb", |b| {
        b.to_async(&runtime).iter(|| async {
            let data = black_box(vec![0x42; 100 * 1024 * 1024]);
            let _ = Blake3Hasher::hash(&data);
        });
    });

    c.bench_function("blake3_tree_hash_1k_chunks", |b| {
        b.to_async(&runtime).iter(|| async {
            let hashes = black_box(vec![Blake3Hash::default(); 1000]);
            let _ = Blake3Hasher::tree_hash(&hashes).await;
        });
    });
}

criterion_group!(benches, bench_blake3);
criterion_main!(benches);
```

**Target:** >100 MB/s (hashing), paralelismo nativo

### 6.4 SQLite Benchmark

```rust
// benches/db_bench.rs
fn bench_db(c: &mut Criterion) {
    let runtime = tokio::runtime::Runtime::new().unwrap();

    c.bench_function("db_upsert_1k_files", |b| {
        b.to_async(&runtime).iter(|| async {
            // Insertar 1000 entradas de sincronización
        });
    });

    c.bench_function("db_query_pending_files", |b| {
        b.to_async(&runtime).iter(|| async {
            // Consultar archivos en estado Pending
        });
    });
}

criterion_group!(benches, bench_db);
criterion_main!(benches);
```

---

## 7. Prohibiciones

❌ **NO usar CFAPI directamente** — Abstraer mediante StorageProvider trait  
❌ **NO usar FUSE directamente** — Abstraer mediante StorageProvider trait  
❌ **NO código específico de Windows** en `indra-core` — Solo en crates separados  
❌ **NO código específico de Linux** en `indra-core` — Solo en crates separados  
❌ **NO bloqueos mutex en rutas críticas** — Usar parking_lot o lock-free cuando sea posible  
❌ **NO I/O sincrónico** — Todo async/await  
❌ **NO dependencias pesadas** — Minimizar footprint de compilación  

---

## 8. Verificación

### 8.1 Compilación

```bash
cd indra-core
cargo build --release
cargo build --target x86_64-pc-windows-gnu  # Cross-compile
cargo build --target x86_64-unknown-linux-gnu
```

### 8.2 Tests

```bash
cargo test --all --verbose
cargo test --doc
cargo test --lib
cargo test --test '*'
```

### 8.3 Benchmarks

```bash
cargo bench --bench fastcdc_bench
cargo bench --bench blake3_bench
cargo bench --bench db_bench
```

### 8.4 Linting y Formato

```bash
cargo clippy --all-targets --all-features
cargo fmt --check
```

### 8.5 Documentación

```bash
cargo doc --no-deps --open
```

Validar:
- Todos los tipos públicos tienen `///` docs
- Ejemplos en docs compilables
- Links internos correctos

---

## 9. Entregables

### 9.1 Crate `indra-core`

**Estructura:**
```
indra-core/
├── Cargo.toml
├── Cargo.lock
├── src/
│   ├── lib.rs                    # Punto de entrada
│   ├── storage/
│   │   ├── mod.rs
│   │   ├── provider.rs           # Trait StorageProvider
│   │   ├── mock.rs               # Implementación mock
│   │   └── local.rs              # Implementación local
│   ├── chunking/
│   │   ├── mod.rs
│   │   └── fastcdc.rs            # FastCDC chunker
│   ├── hashing/
│   │   ├── mod.rs
│   │   └── blake3_wrapper.rs     # BLAKE3 hasher
│   ├── db/
│   │   ├── mod.rs
│   │   ├── schema.rs             # Esquema SQLite
│   │   └── operations.rs         # CRUD
│   ├── sync/
│   │   ├── mod.rs
│   │   ├── state.rs              # State machine
│   │   ├── entry.rs              # SyncEntry
│   │   └── engine.rs             # SyncEngine
│   ├── error.rs                  # Error types
│   └── types.rs                  # Common types
├── tests/
│   ├── integration_tests.rs
│   └── scenarios.rs
├── benches/
│   ├── fastcdc_bench.rs
│   ├── blake3_bench.rs
│   └── db_bench.rs
└── docs/
    ├── API.md                    # API reference
    ├── EXAMPLES.md               # Ejemplos de uso
    └── ARCHITECTURE.md           # Diseño interno
```

### 9.2 Documentación

**API.md:**
- Referencia de todos los tipos públicos
- Métodos y sus parámetros
- Errores posibles
- Ejemplos de uso

**EXAMPLES.md:**
```rust
// Sincronizar un archivo simple
let provider = LocalStorageProvider::new("/my/data");
let engine = SyncEngine::new(provider, "/cache/indra").await?;
engine.sync_file(Path::new("document.pdf")).await?;

// Monitorear cambios
engine.watch_and_sync(Path::new("/my/data")).await?;
```

**ARCHITECTURE.md:**
- Diagrama de componentes
- Flujo de sincronización
- Decisiones de diseño
- Futuras integraciones con CFAPI/FUSE

### 9.3 GitHub Actions CI/CD

```yaml
# .github/workflows/indra-core.yml
name: indra-core
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions-rs/toolchain@v1
      - run: cargo test --all --verbose
      - run: cargo clippy --all-targets
      - run: cargo fmt --check
      
  bench:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions-rs/toolchain@v1
      - run: cargo bench --bench fastcdc_bench
      - run: cargo bench --bench blake3_bench
```

### 9.4 Cambio Final en Git

```bash
git add docs/plans/FASE_01_CORE_SYNC_ENGINE.md
git add indra-core/  # Toda la carpeta del crate
git commit -m "feat(sync-engine): implement Phase 1 core sync engine

- StorageProvider trait for OS-agnostic filesystem abstraction
- FastCDC chunker with SIMD support (16KB-64KB-1MB parameters)
- BLAKE3 parallel tree hashing >100MB/s
- SQLite cache with version vectors for deduplication
- Async state machine (Pending → Syncing → Synced | Error)
- Three-tier priority queue system for work scheduling
- Comprehensive unit and integration tests
- Benchmarks for chunking, hashing, database operations

References:
- docs/research/Local drive integration.md.txt
- docs/plans/19_PLAN_desktop-storage-shell.md

Verification:
- cargo build --release ✓
- cargo test --all ✓
- cargo clippy ✓
- cargo bench ✓
- cargo doc ✓"
```

---

## 10. Referencias e Integración Futura

### 10.1 Integración con CFAPI (Windows)

**Crate futuro:** `indra-cfapi`
```rust
impl StorageProvider for CfapiProvider {
    // CfRegisterSyncRoot
    // CfConnectSyncRoot
    // CF_CALLBACK_TYPE_FETCH_DATA
    // CfTransferData
}
```

**No implementar en Fase 1**, solo dejar contrato.

### 10.2 Integración con FUSE (Linux)

**Crate futuro:** `indra-fuse`
```rust
impl StorageProvider for FuseProvider {
    // libfuse3 bindings
    // io_uring support
    // FUSE_PASSTHROUGH capability
}
```

**No implementar en Fase 1**, solo dejar contrato.

### 10.3 Integración en `indra-next-sovereign_A`

Consumir `indra-core` desde:
- Backend API (`src/app/api/desktop/sync.ts`)
- Desktop shell service (futuro Rust daemon)
- Storage widget (estado de sincronización)

---

## 11. Criterios de Éxito

✅ `cargo build --release` compila sin errores  
✅ `cargo test --all` pasa 100% de tests  
✅ `cargo clippy` sin warnings  
✅ Benchmarks: FastCDC >50 MB/s, BLAKE3 >100 MB/s  
✅ API pública completamente documentada  
✅ Ejemplos compilables en `EXAMPLES.md`  
✅ SQLite persiste estado entre ejecuciones  
✅ State machine rechaza transiciones inválidas  
✅ No hay dependencias de SO específicas en `src/`  
✅ Crate disponible en `Cargo.toml` del proyecto  

---

## 12. Timeline Estimado

| Fase | Tareas | Días |
|------|--------|------|
| 1.1-1.2 | Setup + StorageProvider trait | 1 |
| 1.3 | FastCDC chunker | 2 |
| 1.4 | BLAKE3 hasher | 1 |
| 1.5 | SQLite cache layer | 2 |
| 1.6-1.7 | State machine + SyncEngine | 2 |
| 1.8 | API pública y ejemplos | 1 |
| 5.0 | Tests unitarios e integración | 3 |
| 6.0 | Benchmarks y optimización | 2 |
| 9.0 | Documentación final | 1 |
| **Total** | | **15 días** |

---

## Apéndice: Algoritmos de Referencia

### FastCDC Gear Rolling Hash

```
gear_hash = (gear_hash << 1) + gear_table[byte]
chunk_boundary_found = (gear_hash & MASK) == 0
```

### BLAKE3 Tree Hash

```
Leaf nodes: hash(data_chunk)
Parent nodes: hash(left_child || right_child)
Root: final tree hash
Parallelizable en todos los cores disponibles
```

### SQLite WAL Mode

```
Write-Ahead Logging permite:
- Lectura concurrente
- Escritura sin bloqueos globales
- Recovery automático
```

---

**Documento preparado para:** Indra Next Sovereign - Fase 1 del motor de sincronización agnóstico.  
**Referencia:** docs/research/Local drive integration.md.txt  
**Próximo paso:** FASE_02_SHELL_EXTENSIONS.md (UI y thumbnails)
