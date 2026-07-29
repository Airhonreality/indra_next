---
plan: 20_PLAN_fase02-filesystem-integration
estado: BORRADOR
ejecutor: codex
depende_de: [19]
---

# 20 — FASE 2: Integración OS — Windows CFAPI + Linux FUSE

**Estado**: Hoja de ruta técnica para integración kernel-level de almacenamiento virtual  
**Referencia técnica**: `docs/research/Local drive integration.md.txt` (secciones 1-2)

---

## 1. Windows CFAPI — indra-windows crate

### 1.1 Registro de raíz de sincronización

**Entrada**: Ruta local del usuario (ej. `C:\Users\<username>\Indra Drive`)

**Operación**:

```rust
// indra-windows/src/cfapi/root.rs
use windows::Win32::Storage::CloudFilters::*;

pub fn register_sync_root(root_path: &str) -> Result<()> {
    // 1. Validar permisos en HKEY_CURRENT_USER\SOFTWARE\SyncEngines\Providers
    // 2. Crear registro proveedor en:
    //    HKCU\SOFTWARE\SyncEngines\Providers\Indra
    
    let config = CloudSyncRootInfo {
        path: root_path.into(),
        display_name: "Indra Drive".into(),
        icon_path: None,
        version: "1.0".into(),
        // Política progresiva: cachea headers, descarga bajo demanda
        hydration_policy: CF_HYDRATION_POLICY_PROGRESSIVE,
        population_policy: CF_POPULATION_POLICY_PARTIAL,
    };
    
    unsafe {
        CfRegisterSyncRoot(
            &config,
            CF_REGISTER_FLAGS::default(),
        )?;
    }
    
    Ok(())
}
```

**Salida**: Raíz registrada en Windows Registry; explorador de archivos la reconoce  
**Verificación**: `reg query "HKCU\SOFTWARE\SyncEngines\Providers\Indra"` contiene MountPoint

---

### 1.2 Conexión de canal de sincronización + Callbacks

**Entrada**: Handle de raíz registrada  
**Operación**:

```rust
// indra-windows/src/cfapi/callbacks.rs
use windows::Win32::Storage::CloudFilters::*;
use tokio::sync::mpsc;

pub struct SyncEngineCallbacks {
    tx_fetch: mpsc::UnboundedSender<FetchDataRequest>,
    tx_cancel: mpsc::UnboundedSender<CancelRequest>,
}

impl SyncEngineCallbacks {
    pub fn connect(root_path: &str, tx_events: mpsc::UnboundedSender<SyncEvent>) -> Result<()> {
        unsafe {
            let sync_root_handle = CfConnectSyncRoot(root_path)?;
            
            // Callback: Intercepta lectura de archivo placeholder
            CfRegisterCallback(
                sync_root_handle,
                CF_CALLBACK_TYPE_FETCH_DATA,
                Some(on_fetch_data),
            )?;
            
            // Callback: Cancela fetch en curso si usuario navega lejos
            CfRegisterCallback(
                sync_root_handle,
                CF_CALLBACK_TYPE_CANCEL_FETCH_DATA,
                Some(on_cancel_fetch),
            )?;
            
            // Callback: Notifica eliminación de placeholder
            CfRegisterCallback(
                sync_root_handle,
                CF_CALLBACK_TYPE_DELETE,
                Some(on_delete_placeholder),
            )?;
            
            // Callback: Sincroniza renombres locales hacia cloud
            CfRegisterCallback(
                sync_root_handle,
                CF_CALLBACK_TYPE_RENAME,
                Some(on_rename_local),
            )?;
        }
        
        Ok(())
    }
}

// Callback: CF_CALLBACK_TYPE_FETCH_DATA
unsafe extern "system" fn on_fetch_data(
    callback_info: *const CF_CALLBACK_INFO,
    param: *const CF_CALLBACK_PARAMETERS,
) -> HRESULT {
    let info = &*callback_info;
    let fetch_param = &(*param).FetchData;
    
    let req = FetchDataRequest {
        file_id: info.FileId.clone(),
        offset: fetch_param.RequiredFileRange.StartingOffset.QuadPart as u64,
        length: fetch_param.RequiredFileRange.Length.QuadPart as u64,
    };
    
    // Enqueue para processing asíncrono en Cola Crítica
    // Retorna inmediatamente; kernel espera
    
    S_OK
}

// Callback: CF_CALLBACK_TYPE_CANCEL_FETCH_DATA
unsafe extern "system" fn on_cancel_fetch(
    callback_info: *const CF_CALLBACK_INFO,
    _param: *const CF_CALLBACK_PARAMETERS,
) -> HRESULT {
    // Prioriza cancelación de descargas en cola media/baja
    // No afecta fetch críticos en ejecución
    S_OK
}
```

**Salida**: Callbacks registrados en el driver minifiltro; todas las operaciones I/O dirigidas al motor  
**Verificación**: `Get-WinEvent -LogName Microsoft-Windows-CloudFiles/Diagnostic` muestra eventos

---

### 1.3 Windows Registry — Proveedor de almacenamiento

**Entrada**: Información de proveedor  
**Operación**:

```powershell
# indra-windows/scripts/register-provider.ps1
$ProviderKey = "HKCU:\SOFTWARE\SyncEngines\Providers\Indra"

# 1. Crear rama si no existe
if (-not (Test-Path $ProviderKey)) {
    New-Item -Path $ProviderKey -Force | Out-Null
}

# 2. Configurar propiedades esenciales
Set-ItemProperty -Path $ProviderKey -Name "MountPoint" -Value "C:\Users\$env:USERNAME\Indra Drive" -Force
Set-ItemProperty -Path $ProviderKey -Name "DisplayName" -Value "Indra Drive" -Force

# 3. Registrar COM handler para miniaturas
$CLSID = "{12345678-1234-5678-1234-567812345678}"  # UUID del COM DLL
Set-ItemProperty -Path $ProviderKey -Name "Handler" -Value $CLSID -Force

# 4. Algoritmo de hash para deduplicación remota
Set-ItemProperty -Path $ProviderKey -Name "HashAlgorithm" -Value "BLAKE3" -Force

# 5. Servicio WOPI (para integración Office 365)
Set-ItemProperty -Path $ProviderKey -Name "WOPIServiceId" -Value "indra-drive-sync-service" -Force
```

**Salida**: Entrada en Registry; Windows Explorer muestra proveedor en barra lateral  
**Verificación**: Explorador de Archivos → Panel izquierdo muestra "Indra Drive"

---

### 1.4 COM DLL — IThumbnailProvider + IPropertyStore

**Entrada**: Solicitud de miniatura desde Windows Explorer  
**Operación**:

```rust
// indra-windows/src/com/thumbnail_provider.rs
use windows::Win32::System::Com::*;
use windows::Win32::Foundation::*;

#[implement(IInitializeWithFile, IThumbnailProvider)]
pub struct IndraThumbProvider {
    file_path: String,
    cache: Arc<ThumbnailCache>,  // SQLite WAL
}

impl IThumbnailProvider_Impl for IndraThumbProvider_Impl {
    fn GetThumbnail(&self, cx: u32) -> Result<HBITMAP, HRESULT> {
        let file_path = &self.file_path;
        
        // 1. Consultar caché local (SQLite WAL)
        if let Ok(cached) = self.cache.get_thumbnail(file_path, cx) {
            return Ok(cached_hbitmap);
        }
        
        // 2. Si no existe en caché: solicitar bytes inteligentes
        let file_ext = std::path::Path::new(file_path)
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_lowercase();
        
        match file_ext.as_str() {
            "jpg" | "png" | "webp" | "tiff" | "raw" => {
                // Extraer EXIF IFD1 (primeros 32-64 KB)
                self.fetch_image_exif_thumbnail(file_path)
            }
            "mp4" | "mov" | "mkv" => {
                // Extraer keyframe del video
                self.fetch_video_keyframe(file_path)
            }
            _ => {
                // Genérico: ícono de archivo
                self.default_file_icon()
            }
        }
    }
}

impl IndraThumbProvider_Impl {
    fn fetch_image_exif_thumbnail(&self, file_path: &str) -> Result<HBITMAP, HRESULT> {
        // Byte-range request: bytes=0-65536
        let response = reqwest::Client::new()
            .get(self.remote_url_for_file(file_path))
            .header("Range", "bytes=0-65536")
            .send()
            .await?;
        
        let exif_bytes = response.bytes().await?;
        
        // Parsear EXIF con el crate `exif`
        let reader = exif::Reader::new()
            .read_from_container(&exif_bytes)?;
        
        // Buscar thumbnail en IFD1
        if let Some(thumb) = reader.get_field(exif::Tag::Thumbnail, false) {
            // Decodificar y cachear
            let hbitmap = decode_to_hbitmap(&thumb.value)?;
            self.cache.set_thumbnail(file_path, cx, &hbitmap)?;
            return Ok(hbitmap);
        }
        
        // Fallback: generar de fotograma clave si es posible
        self.default_file_icon()
    }
    
    fn fetch_video_keyframe(&self, file_path: &str) -> Result<HBITMAP, HRESULT> {
        // Para MP4/MOV: leer moov atom (últimos 131 KB para no-optimized)
        // Para MKV: leer Cues EBML para índice de keyframes
        
        let keyframe_info = self.probe_video_metadata(file_path).await?;
        
        // Byte-range request: bytes=<start>-<end> para keyframe
        let response = reqwest::Client::new()
            .get(self.remote_url_for_file(file_path))
            .header("Range", format!("bytes={}-{}", keyframe_info.start, keyframe_info.end))
            .send()
            .await?;
        
        // Decodificar fotograma con FFmpeg
        let hbitmap = decode_video_frame(&response.bytes().await?, cx)?;
        self.cache.set_thumbnail(file_path, cx, &hbitmap)?;
        
        Ok(hbitmap)
    }
}
```

**Salida**: Miniaturas renderizadas sin descargar archivo completo; almacenadas en SQLite  
**Verificación**: Explorador de Archivos muestra previsualizaciones en vista miniatura

---

### 1.5 Byte-Range Requests para optimización

**Especificación**:

| Tipo de archivo | Estrategia de rango | Máximo de bytes | Justificación |
|-----------------|-------------------|-----------------|---------------|
| JPEG / PNG | EXIF IFD1 | 64 KB | Thumbnail embebida en header |
| TIFF / RAW | TIFF tags | 32 KB | Metadata en inicio |
| MP4 / MOV | moov atom (final) | 131 KB | Índice de fotogramas al final |
| MKV | Cues EBML | 64 KB | Índice de keyframes al inicio |
| WEBP | VP8/VP8L header | 8 KB | Metadata de dimensiones |

---

## 2. Linux FUSE 3 — indra-linux crate

### 2.1 Inicialización de punto de montaje

**Entrada**: Ruta de usuario  
**Operación**:

```rust
// indra-linux/src/fuse/mount.rs
use fuse3::low_level::{MountOptions, Server};
use std::path::Path;

pub async fn initialize_fuse_mount() -> Result<()> {
    let mount_point = Path::new(&format!("{}/.local/share/indra/drive", 
        std::env::var("HOME")?));
    
    std::fs::create_dir_all(&mount_point)?;
    
    let mut opts = MountOptions::default();
    opts.fs_name("indra-drive");
    opts.subtype("indra");
    // Permitir acceso desde múltiples procesos sin restricción
    opts.allow_other(true);
    // Activar async I/O
    opts.async_read(true);
    opts.async_writes(true);
    // Habilitar FUSE_PASSTHROUGH para archivos hidratados
    opts.direct_io(false);  // Permitir caché de kernel
    
    let server = Server::new(IndraFileSystem::new(), mount_point, opts)?;
    
    // Spawner en background
    tokio::spawn(async move {
        if let Err(e) = server.run().await {
            eprintln!("FUSE mount error: {}", e);
        }
    });
    
    Ok(())
}
```

**Salida**: Punto de montaje activo en `~/.local/share/indra/drive`  
**Verificación**: `mount | grep indra-drive` muestra punto montado

---

### 2.2 FUSE Passthrough para archivos hidratados

**Entrada**: FD de archivo hidratado en caché local  
**Operación**:

```rust
// indra-linux/src/fuse/passthrough.rs
use fuse3::raw::Request;
use std::os::unix::io::RawFd;

impl FileSystem for IndraFileSystem {
    async fn open(
        &self,
        req: Request<'_>,
        inode: u64,
        flags: i32,
    ) -> Result<ReplyOpen> {
        let file_entry = self.inode_table.get(inode)?;
        
        // Caso 1: Archivo hidratado en caché local
        if file_entry.is_hydrated {
            // Abrir archivo nativo directamente
            let native_fd = std::fs::OpenOptions::new()
                .read((flags & O_RDONLY != 0) || (flags & O_RDWR != 0))
                .write(flags & (O_WRONLY | O_RDWR) != 0)
                .open(&file_entry.local_cache_path)?;
            
            // FUSE_PASSTHROUGH: devolver FD nativo
            // Kernel redirige read/write directamente a fd, sin mediar FUSE daemon
            return Ok(ReplyOpen {
                fh: native_fd as u64,
                flags: fuse3::raw::OpenFlags::FOPEN_PASSTHROUGH.bits() as u32,
            });
        }
        
        // Caso 2: Archivo no hidratado (placeholder)
        // Abrir en modo lazy-hydration mediante io_uring async
        let file_handle = IndraFileHandle {
            inode,
            remote_url: file_entry.remote_url.clone(),
            offset: 0,
            hydrate_tx: self.hydrate_tx.clone(),
        };
        
        let fh = self.fh_table.insert(file_handle);
        Ok(ReplyOpen {
            fh,
            flags: 0,  // Sin PASSTHROUGH: kernel mediará llamadas
        })
    }
}
```

**Salida**: Archivos hidratados accesibles a velocidad nativa; placeholders servidos por FUSE daemon  
**Verificación**: `strace -p $(pidof indra-fuse) | grep passthrough` muestra FD delegados

---

### 2.3 io_uring async I/O

**Entrada**: Cola de operaciones de lectura para placeholders  
**Operación**:

```rust
// indra-linux/src/async_io/uring.rs
use io_uring::{opcode, types, IoUring};
use tokio::sync::mpsc;

pub struct UringExecutor {
    ring: IoUring,
    batch_size: usize,
}

impl UringExecutor {
    pub fn new(queue_depth: u32) -> Self {
        let ring = IoUring::new(queue_depth)
            .expect("Failed to create io_uring ring");
        
        Self {
            ring,
            batch_size: 32,
        }
    }
    
    pub async fn submit_read_batch(
        &mut self,
        requests: Vec<ReadRequest>,
    ) -> Result<Vec<ReadResult>> {
        let mut sqe_vec = Vec::new();
        
        for req in requests {
            let sqe = opcode::Read::new(
                types::Fd(req.fd),
                req.buffer as *mut u8,
                req.len as u32,
            )
            .offset(req.offset as i64)
            .build();
            
            sqe_vec.push(sqe);
        }
        
        // Enviar todos los SQE de una vez (batch submit)
        for sqe in sqe_vec {
            self.ring.submission().push(&sqe)?;
        }
        
        // Wait + reap en io_uring (no sleep de kernel)
        self.ring.submit_and_wait(sqe_vec.len())?;
        
        let mut results = Vec::new();
        let mut cq = self.ring.completion();
        
        for cqe in cq.by_ref().take(sqe_vec.len()) {
            results.push(ReadResult {
                bytes_read: cqe.result() as usize,
                user_data: cqe.user_data(),
            });
        }
        
        Ok(results)
    }
}
```

**Salida**: Lecturas de placeholders servidas de forma asíncrona sin bloqueo de syscall  
**Verificación**: `perf stat -e io_uring:* indra-fuse-daemon` muestra actividad de io_uring

---

### 2.4 D-Bus Thumbnailer Service

**Entrada**: Solicitud de miniatura desde Nautilus / Dolphin / Thunar  
**Operación**:

```rust
// indra-linux/src/dbus/thumbnailer.rs
use dbus::blocking::Connection;
use dbus::channel::MatchingReceiver;

pub async fn register_thumbnailer_service() -> Result<()> {
    // Conectar a D-Bus sesión del usuario
    let conn = Connection::new_session()?;
    
    // Registrar nombre del servicio
    conn.request_name(
        "org.freedesktop.thumbnails.Thumbnailer1",
        false,
        true,
        false,
    )?;
    
    // Implementar interfaz org.freedesktop.thumbnails.Thumbnailer1
    let iface = ThumbnailerInterface::new();
    
    conn.register_object_path("/org/freedesktop/thumbnails/Thumbnailer1", iface)?;
    
    Ok(())
}

pub struct ThumbnailerInterface;

impl ThumbnailerInterface {
    pub fn get_thumbnail(
        &self,
        uris: Vec<String>,
        mime_types: Vec<String>,
        flavor: String,
    ) -> Result<Vec<String>> {
        // flavor = "normal" (128x128), "large" (256x256), "x-large" (512x512)
        
        let mut results = Vec::new();
        
        for uri in uris {
            // 1. Consultar caché en ~/.cache/thumbnails/{flavor}/
            let cache_path = Self::cache_path_for_uri(&uri, &flavor);
            
            if Path::new(&cache_path).exists() {
                results.push(cache_path);
                continue;
            }
            
            // 2. Si no existe: generar mediante byte-range requests
            let thumb_result = match Self::extract_file_type(&uri) {
                "image" => self.extract_image_exif(&uri, &flavor),
                "video" => self.extract_video_keyframe(&uri, &flavor),
                _ => {
                    // Genérico: copiar ícono de aplicación
                    Self::default_file_icon(&mime_types[0])
                }
            };
            
            if let Ok(thumb_path) = thumb_result {
                results.push(thumb_path);
            }
        }
        
        Ok(results)
    }
    
    fn extract_image_exif(uri: &str, flavor: &str) -> Result<String> {
        // Byte-range: 0-65536 para EXIF
        let resp = reqwest::blocking::Client::new()
            .get(Self::remote_url_for_uri(uri))
            .header("Range", "bytes=0-65536")
            .send()?;
        
        let exif = exif::Reader::new().read_from_container(&resp.bytes()?)?;
        
        // Parsear EXIF IFD1 para thumbnail embebida
        if let Some(field) = exif.get_field(exif::Tag::ImageWidth, false) {
            let thumb_bytes = render_exif_thumbnail(&exif, flavor)?;
            let cache_path = Self::store_in_cache(&thumb_bytes, uri, flavor)?;
            return Ok(cache_path);
        }
        
        Err("No EXIF thumbnail found".into())
    }
    
    fn cache_path_for_uri(uri: &str, flavor: &str) -> String {
        let home = std::env::var("HOME").unwrap();
        let hash = format!("{:x}", md5::compute(uri.as_bytes()));
        format!("{}/.cache/thumbnails/{}/{}.png", home, flavor, hash)
    }
}
```

**Salida**: Servicio D-Bus registrado; Nautilus/Dolphin consultan miniaturas sin bloquear UI  
**Verificación**: `gdbus introspect --system --dest org.freedesktop.thumbnails.Thumbnailer1` muestra métodos

---

### 2.5 readdirplus optimization

**Entrada**: Lectura de directorio con + atributos  
**Operación**:

```rust
// indra-linux/src/fuse/readdir.rs
impl FileSystem for IndraFileSystem {
    async fn readdirplus(
        &self,
        req: Request<'_>,
        inode: u64,
        fh: u64,
        offset: i64,
        lock_owner: u64,
    ) -> Result<ReplyDirplus> {
        let dir_entry = self.inode_table.get(inode)?;
        
        if !dir_entry.is_directory {
            return Err(std::io::Error::new(
                std::io::ErrorKind::NotADirectory,
                "Not a directory",
            ));
        }
        
        // Cargar lista de archivos de metadata DB (SQLite)
        let children = self.list_children(inode)?;
        
        let mut reply = ReplyDirplus::new();
        
        // Batch: devolver todos los metadatos en UNA sola operación
        // Sin llamadas subsecuentes getattr (lo cual es el cuello de botella)
        for (child_inode, entry) in children.iter() {
            let attr = FileAttr {
                ino: *child_inode,
                size: entry.size,
                blocks: (entry.size + 511) / 512,
                atime: entry.accessed,
                mtime: entry.modified,
                ctime: entry.created,
                kind: if entry.is_directory {
                    FileType::Directory
                } else {
                    FileType::RegularFile
                },
                perm: 0o644,  // Lectura universal, sin escritura
                nlink: 1,
                uid: req.uid(),
                gid: req.gid(),
                rdev: 0,
                blksize: 4096,
                padding: 0,
            };
            
            // Agregar entrada con atributo adjunto
            reply.add(
                *child_inode,
                offset + 1,
                entry.name.clone(),
                &attr,
            );
        }
        
        Ok(reply)
    }
}
```

**Salida**: `ls -la ~/Indra\ Drive` retorna en O(n) en lugar de O(n²)  
**Verificación**: `strace -c ls -la ~/.local/share/indra/drive` muestra 1 syscall de getdents64, no n

---

## 3. Shared — Componentes comunes

### 3.1 Placeholder creation/destruction

**Módulo**: `indra-shared/src/filesystem/placeholder.rs`

```rust
pub struct Placeholder {
    pub inode: u64,
    pub file_id: String,  // UUID único por archivo
    pub local_path: PathBuf,
    pub remote_url: String,
    pub size: u64,
    pub hash_blake3: String,  // Content-addressed storage ID
    pub metadata: FileMetadata,
    pub hydration_state: HydrationState,  // PARTIAL, FULL, NONE
    pub created_at: SystemTime,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HydrationState {
    /// Solo metadata descargada; contenido en remote
    Placeholder,
    /// Archivo parcialmente descargado (bytes 0..N en caché)
    PartiallyHydrated { cached_bytes: u64 },
    /// Contenido completo en caché local
    FullyHydrated,
    /// Marcado para eliminación; pendiente limpieza
    Tombstone,
}

pub async fn create_placeholder(
    file_id: &str,
    remote_url: &str,
    metadata: &FileMetadata,
    platform: Platform,  // Windows | Linux
) -> Result<Placeholder> {
    let local_path = match platform {
        Platform::Windows => {
            format!(r"C:\Users\{}\Indra Drive\{}", 
                std::env::var("USERNAME")?, 
                metadata.name)
        }
        Platform::Linux => {
            format!("{}/.local/share/indra/drive/{}", 
                std::env::var("HOME")?, 
                metadata.name)
        }
    };
    
    // Escribir metadatos a BD local (SQLite)
    let db = Database::open(cache_db_path())?;
    db.insert_placeholder(&Placeholder {
        inode: generate_inode(),
        file_id: file_id.to_string(),
        local_path: local_path.into(),
        remote_url: remote_url.to_string(),
        size: metadata.size,
        hash_blake3: metadata.blake3_hash.clone(),
        metadata: metadata.clone(),
        hydration_state: HydrationState::Placeholder,
        created_at: SystemTime::now(),
    })?;
    
    // Crear archivo stub en filesystem (0 bytes con atributos especiales)
    match platform {
        Platform::Windows => {
            create_placeholder_win32(&local_path, metadata)?;
        }
        Platform::Linux => {
            create_placeholder_fuse(&local_path, metadata)?;
        }
    }
    
    Ok(placeholder)
}

pub async fn destroy_placeholder(
    file_id: &str,
    platform: Platform,
) -> Result<()> {
    // Marcar como Tombstone en BD
    let db = Database::open(cache_db_path())?;
    db.mark_tombstone(file_id)?;
    
    // Eliminar archivo físico
    match platform {
        Platform::Windows => {
            std::fs::remove_file(placeholder_path_win32(file_id))?;
        }
        Platform::Linux => {
            std::fs::remove_file(placeholder_path_linux(file_id))?;
        }
    }
    
    // Liberar de BD después de confirmación
    db.delete_placeholder(file_id)?;
    
    Ok(())
}
```

---

### 3.2 Hydration state tracking

**Módulo**: `indra-shared/src/cache/hydration.rs`

```rust
pub struct HydrationTracker {
    db: Arc<Database>,
    cache_dir: PathBuf,
}

impl HydrationTracker {
    pub async fn track_hydration_progress(
        &self,
        file_id: &str,
        bytes_received: u64,
        total_bytes: u64,
    ) -> Result<()> {
        let pct = (bytes_received as f64 / total_bytes as f64 * 100.0) as u32;
        
        // Actualizar BD
        self.db.update_hydration_state(
            file_id,
            HydrationState::PartiallyHydrated { 
                cached_bytes: bytes_received 
            },
        )?;
        
        // Emitir evento para UI (progreso de sincronización)
        self.emit_hydration_event(HydrationEvent {
            file_id: file_id.to_string(),
            progress_percent: pct,
            bytes_total: total_bytes,
            bytes_received,
        })?;
        
        Ok(())
    }
    
    pub async fn mark_fully_hydrated(&self, file_id: &str) -> Result<()> {
        self.db.update_hydration_state(
            file_id,
            HydrationState::FullyHydrated,
        )?;
        
        // Remover de "Syncing" UI
        self.emit_hydration_event(HydrationEvent {
            file_id: file_id.to_string(),
            progress_percent: 100,
            bytes_total: 0,
            bytes_received: 0,
        })?;
        
        Ok(())
    }
    
    pub async fn mark_hydration_failed(
        &self,
        file_id: &str,
        error: String,
    ) -> Result<()> {
        self.db.log_hydration_error(file_id, &error)?;
        
        // Emit para retry UI
        Ok(())
    }
}
```

---

### 3.3 Error recovery

**Módulo**: `indra-shared/src/resilience/recovery.rs`

```rust
pub enum RecoveryStrategy {
    /// Reintentar con backoff exponencial (2^n segundos, máx 300s)
    RetryExponentialBackoff { max_attempts: u32 },
    /// Marcar para sincronización de bloque diferenciada
    PartialRetry { last_successful_offset: u64 },
    /// Asumir corrupción; revalidar hash BLAKE3
    ValidateAndRecalculate,
}

pub async fn recover_failed_hydration(
    file_id: &str,
    error: &HydrationError,
    strategy: RecoveryStrategy,
) -> Result<()> {
    match error {
        HydrationError::NetworkTimeout => {
            // Retry con backoff
            let mut attempt = 0;
            loop {
                if attempt >= 5 {
                    return Err("Max retries exceeded".into());
                }
                
                let backoff_secs = 2_u64.pow(attempt);
                tokio::time::sleep(Duration::from_secs(backoff_secs)).await;
                
                match retry_hydration(file_id).await {
                    Ok(_) => return Ok(()),
                    Err(e) => {
                        attempt += 1;
                        eprintln!("Retry {} failed: {}", attempt, e);
                    }
                }
            }
        }
        
        HydrationError::CorruptedData { checksum_mismatch } => {
            // Revalidar y recalcular
            let remote_hash = fetch_remote_file_hash(file_id).await?;
            let local_hash = calculate_local_file_hash(file_id).await?;
            
            if remote_hash != local_hash {
                // Re-descargar desde 0
                mark_placeholder(file_id)?;
                retry_hydration(file_id).await?;
            }
        }
        
        HydrationError::DiskSpaceFull => {
            // Garbage collect least-recently-used (LRU)
            evict_lru_cache().await?;
            retry_hydration(file_id).await?;
        }
    }
    
    Ok(())
}
```

---

## 4. Operaciones

### 4.1 Implementar CFAPI callbacks en Windows

**Tarea**:

- [ ] Codificar `on_fetch_data` handler; enqueue en Cola Crítica
- [ ] Codificar `on_cancel_fetch_data` handler; cancelar downloads en cola
- [ ] Codificar `on_delete_placeholder` handler; limpiar metadatos
- [ ] Codificar `on_rename_local` handler; sincronizar hacia cloud
- [ ] Registrar callbacks en `CfConnectSyncRoot`
- [ ] Error handling: Network errors, disk full, permission denied
- [ ] Testing: Simular carga de archivo en paralelo; verificar callbacks

---

### 4.2 Implementar FUSE handlers en Linux

**Tarea**:

- [ ] Codificar `readdirplus` batch handler
- [ ] Codificar `open` con FUSE_PASSTHROUGH para hidratados
- [ ] Codificar `read` async con io_uring
- [ ] Codificar `write` con invalidación de caché
- [ ] Codificar `lookup` con SQL query a metadata DB
- [ ] Error handling: EACCES, ENOSPC, EAGAIN
- [ ] Testing: `ls -la` en 10K archivos; `cat` archivo hidratado

---

### 4.3 Integración de byte-range requests

**Tarea**:

- [ ] Implementar cliente HTTP/3 con soporte Range header
- [ ] Integrar parser EXIF para imágenes
- [ ] Integrar parser EBML/moov atom para video
- [ ] Fallback graceful si servidor no soporta Range
- [ ] Testear timeouts en range requests

---

## 5. Tests — Integration tests

### 5.1 Suite Windows

```powershell
# indra-windows/tests/integration/cfapi_integration.rs
#[tokio::test]
async fn test_create_file_windows() {
    // 1. Registrar sync root
    register_sync_root("C:\\Users\\test\\Indra Drive").await.unwrap();
    
    // 2. Crear placeholder
    create_placeholder(
        "file-001",
        "https://remote.indra.dev/file/abc123",
        &FileMetadata { size: 1_000_000, name: "video.mp4".into(), .. },
        Platform::Windows,
    ).await.unwrap();
    
    // 3. Verificar archivo existe en explorador
    assert!(Path::new("C:\\Users\\test\\Indra Drive\\video.mp4").exists());
    
    // 4. Simular lectura; verificar callback FETCH_DATA dispara
    let file = File::open("C:\\Users\\test\\Indra Drive\\video.mp4").unwrap();
    let mut buf = [0u8; 1024];
    let n = file.read(&mut buf).unwrap();
    
    assert!(n > 0, "Bytes read from placeholder");
}

#[tokio::test]
async fn test_parallel_file_creation() {
    // Crear 100 placeholders en paralelo
    let handles: Vec<_> = (0..100)
        .map(|i| {
            let file_id = format!("file-{:03}", i);
            tokio::spawn(async move {
                create_placeholder(&file_id, &format!("https://remote/{}", i), ..)
                    .await
                    .unwrap()
            })
        })
        .collect();
    
    futures::future::join_all(handles).await;
    
    // Verificar todos en explorador
    let entries = std::fs::read_dir("C:\\Users\\test\\Indra Drive").unwrap();
    assert_eq!(entries.count(), 100);
}

#[tokio::test]
async fn test_rename_sync() {
    let file_id = "file-rename-001";
    create_placeholder(file_id, "https://remote/file", ..).await.unwrap();
    
    // Renombrar localmente
    std::fs::rename(
        "C:\\Users\\test\\Indra Drive\\file.txt",
        "C:\\Users\\test\\Indra Drive\\renamed.txt",
    ).unwrap();
    
    // Verificar callback on_rename_local capturó cambio
    // (Verificar en log de eventos CFAPI)
}
```

### 5.2 Suite Linux

```rust
// indra-linux/tests/integration/fuse_integration.rs
#[tokio::test]
async fn test_fuse_mount_linux() {
    initialize_fuse_mount().await.unwrap();
    
    let mount_point = Path::new(&format!("{}/.local/share/indra/drive", 
        std::env::var("HOME").unwrap()));
    
    // Verificar punto montado
    let output = Command::new("mount")
        .arg("-t")
        .arg("fuse")
        .output()
        .unwrap();
    
    assert!(
        String::from_utf8_lossy(&output.stdout).contains("indra-drive"),
        "FUSE mount not found"
    );
}

#[tokio::test]
async fn test_passthrough_hydrated_file() {
    initialize_fuse_mount().await.unwrap();
    
    // 1. Crear archivo hidratado en caché
    let file_path = "~/.local/share/indra/drive/hydrated.bin";
    std::fs::write(file_path, b"test data").unwrap();
    
    // 2. Abrir con FUSE_PASSTHROUGH
    let start = Instant::now();
    let contents = std::fs::read(file_path).unwrap();
    let elapsed = start.elapsed();
    
    // Verificar que fue rápido (< 1ms, indicando PASSTHROUGH)
    assert!(elapsed.as_millis() < 1, "File read should be native speed");
    assert_eq!(contents, b"test data");
}

#[tokio::test]
async fn test_readdirplus_performance() {
    initialize_fuse_mount().await.unwrap();
    
    let mount_point = Path::new(&format!("{}/.local/share/indra/drive", 
        std::env::var("HOME").unwrap()));
    
    // Crear 1000 placeholders
    for i in 0..1000 {
        create_placeholder(&format!("file-{:04}", i), &format!("https://remote/{}", i), ..)
            .await
            .unwrap();
    }
    
    // Listar directorio; medir tiempo
    let start = Instant::now();
    let entries: Vec<_> = std::fs::read_dir(mount_point)
        .unwrap()
        .collect();
    let elapsed = start.elapsed();
    
    assert_eq!(entries.len(), 1000);
    // Con readdirplus: debe ser < 100ms para 1000 archivos
    assert!(elapsed.as_millis() < 100, 
        "readdirplus should handle 1000 files in <100ms, took {}ms", 
        elapsed.as_millis());
}

#[tokio::test]
async fn test_io_uring_async_reads() {
    let mut uring = UringExecutor::new(32);
    
    // Crear 32 read requests concurrentes
    let requests = (0..32)
        .map(|i| {
            ReadRequest {
                fd: create_temp_file(),
                buffer: vec![0u8; 4096].into_boxed_slice(),
                len: 4096,
                offset: i * 4096,
            }
        })
        .collect();
    
    let start = Instant::now();
    let results = uring.submit_read_batch(requests).await.unwrap();
    let elapsed = start.elapsed();
    
    // io_uring debe procesar 32 reads en paralelo < 50ms
    assert!(elapsed.as_millis() < 50, "io_uring batch should complete quickly");
    assert_eq!(results.len(), 32);
}
```

---

## 6. Verificación

### 6.1 Windows

**Pre-requisitos**: Windows 10 22H2+ o Windows 11  

**Comando de verificación**:

```powershell
# 1. Verificar CFAPI habilitada
dism /online /get-features /format=table | findstr /I "cloudfilters"

# 2. Registrar proveedor
.\scripts\register-provider.ps1

# 3. Crear archivo de prueba
New-Item -Path "C:\Users\$env:USERNAME\Indra Drive\test.txt" -Force

# 4. Verificar en explorador
explorer "C:\Users\$env:USERNAME\Indra Drive"

# 5. Verificar callbacks
Get-WinEvent -LogName "Microsoft-Windows-CloudFiles/Diagnostic" -MaxEvents 10 | 
  Format-Table TimeCreated, Message

# 6. Verificar Registry
reg query "HKCU\SOFTWARE\SyncEngines\Providers\Indra"
```

**Criterios de éxito**:
- [ ] Explorador muestra "Indra Drive" en barra lateral
- [ ] Archivos creados aparecen en explorador como placeholders
- [ ] Lectura de archivo dispara FETCH_DATA callback
- [ ] Renombres locales se capturan
- [ ] Miniaturas se renderizan sin descargar archivo completo

---

### 6.2 Linux

**Pre-requisitos**: Linux kernel 4.18+, libfuse3, libdbus  

**Comando de verificación**:

```bash
# 1. Verificar FUSE habilitado
modprobe fuse

# 2. Inicializar daemon
cargo build --release -p indra-linux
./target/release/indra-fuse-daemon

# 3. Verificar mount
mount | grep indra-drive

# 4. Crear archivo de prueba
mkdir -p ~/.local/share/indra/drive
touch ~/.local/share/indra/drive/test.txt

# 5. Listar con timing
time ls -la ~/.local/share/indra/drive

# 6. Verificar D-Bus Thumbnailer
gdbus introspect --session --dest org.freedesktop.thumbnails.Thumbnailer1 \
  /org/freedesktop/thumbnails/Thumbnailer1

# 7. Verificar PASSTHROUGH
strace -e openat -p $(pidof indra-fuse-daemon) 2>&1 | head -20
```

**Criterios de éxito**:
- [ ] Punto montado visible en `mount`
- [ ] Archivos listados en < 100ms para 1000 archivos
- [ ] Lectura de archivo hidratado < 1ms
- [ ] D-Bus Thumbnailer responde a solicitudes
- [ ] Miniaturas en `~/.cache/thumbnails/`

---

## 7. Entregables

### 7.1 Crates Rust

```
indra-windows/
├── src/
│   ├── cfapi/
│   │   ├── root.rs           # CfRegisterSyncRoot
│   │   └── callbacks.rs       # CF_CALLBACK_TYPE_* handlers
│   ├── com/
│   │   ├── thumbnail.rs       # IThumbnailProvider COM DLL
│   │   └── property.rs        # IPropertyStore
│   ├── registry.rs            # HKCU\SOFTWARE\SyncEngines
│   └── lib.rs
├── Cargo.toml
└── scripts/
    └── register-provider.ps1

indra-linux/
├── src/
│   ├── fuse/
│   │   ├── mount.rs           # Inicialización FUSE 3
│   │   ├── passthrough.rs     # FUSE_PASSTHROUGH
│   │   └── readdir.rs         # readdirplus
│   ├── async_io/
│   │   └── uring.rs           # io_uring executor
│   ├── dbus/
│   │   └── thumbnailer.rs     # Freedesktop Thumbnailer
│   ├── daemon.rs              # Main loop
│   └── lib.rs
├── Cargo.toml
└── systemd/
    └── indra-fuse.service

indra-shared/
├── src/
│   ├── filesystem/
│   │   └── placeholder.rs     # Placeholder CRUD
│   ├── cache/
│   │   └── hydration.rs       # HydrationTracker
│   └── resilience/
│       └── recovery.rs        # Recovery strategies
├── Cargo.toml
└── migrations/
    └── 001_placeholders.sql
```

### 7.2 Dependencias Cargo

```toml
# indra-windows/Cargo.toml
[dependencies]
windows = { version = "0.63", features = ["Win32_Storage_CloudFilters", "Win32_System_Com"] }
tokio = { version = "1", features = ["full"] }
sqlx = { version = "0.8", features = ["sqlite", "runtime-tokio"] }
reqwest = { version = "0.12", features = ["stream", "http3"] }
exif = "0.2"

# indra-linux/Cargo.toml
[dependencies]
fuse3 = "0.7"
io-uring = "0.6"
dbus = "0.9"
tokio = { version = "1", features = ["full"] }
sqlx = { version = "0.8", features = ["sqlite", "runtime-tokio"] }
reqwest = { version = "0.12", features = ["stream", "http3"] }
```

### 7.3 Documentación

- `FASE_02_FILESYSTEM_INTEGRATION.md` (este documento)
- `indra-windows/docs/CFAPI_INTEGRATION.md`
- `indra-linux/docs/FUSE_ARCHITECTURE.md`
- `indra-shared/docs/PLACEHOLDER_LIFECYCLE.md`

---

## Referencias

- **Local Drive Integration Architecture**: `docs/research/Local drive integration.md.txt`
- **Plan Desktop Storage Shell**: `docs/plans/19_PLAN_desktop-storage-shell.md`
- **CFAPI Documentation**: Microsoft Docs — Cloud Files API (cldapi.dll)
- **libfuse3 Reference**: https://github.com/libfuse/libfuse
- **io_uring Reference**: https://kernel.dk/io_uring.pdf
- **Freedesktop Thumbnailer Spec**: https://specifications.freedesktop.org/thumbnail-spec/

---

**Estado**: BORRADOR  
**Próxima revisión**: Después de aprobación arquitectónica
