# STORAGE_MASTER_PLAN.md
**Versión:** 2.0.0 (Auditado)
**Fecha:** 2026-05-18
**Módulo:** Indra Storage Widget — Multi-Provider Sovereign Storage Layer
**Axioma rector:** Nam P. Suh — Independencia de Requisitos Funcionales
**Ejecutor previsto:** Gemini (IA). Claude audita, Gemini implementa.

---

## ⚠️ SECCIÓN 0 — AUDIT DE SEGURIDAD DEL TÚNEL DE INGESTA

**Estado del túnel:** INTACTO. El plan NO toca ninguna pieza del pipeline existente.

### Archivos con zona de exclusión absoluta (NEVER TOUCH)

```
src/core/media/pipeline.ts          ← SovereignPipeline — NO MODIFICAR
src/core/media/types.ts             ← PipelineUploadAdapter — NO MODIFICAR (*)
src/core/media/engine.ts            ← Motor de ingesta — NO MODIFICAR
src/core/media/integrity.ts         ← IntegrityEngine — NO MODIFICAR
src/integrations/google-drive/adapter.ts  ← GoogleDriveAdapter PRODUCTION READY — NO MODIFICAR
src/lib/nango.ts                    ← NO MODIFICAR
src/lib/authorized-client.ts        ← NO MODIFICAR
src/workers/transcoder.worker.ts    ← YA ACTUALIZADO (iPhone/YouTube fix) — NO TOCAR MÁS
```

(*) EXCEPCIÓN ÚNICA en `src/core/media/types.ts`: agregar el campo opcional `webOptimized?: boolean` a `TranscodeConfig`. **Ya hecho.** No hay más cambios.

### Por qué el plan es seguro para el túnel

El túnel de ingesta usa `PipelineUploadAdapter` (definido en `src/core/media/types.ts`):
```typescript
interface PipelineUploadAdapter {
  uploadChunk(chunk, descriptor, sessionId, context): Promise<...>
  finalizeSession(sessionId, manifest): Promise<...>
}
```

El nuevo storage widget usa `IntegrationAdapter` (definido en `src/core/types/integration.ts`).

**Estos son dos contratos distintos en capas distintas. No se cruzan.**

El `GoogleDriveAdapter` existente implementa `IntegrationAdapter` y tiene `createResumableSession` que actúa de puente hacia `PipelineUploadAdapter`. Los nuevos adapters de storage siguen exactamente el mismo patrón: no reemplazan, no modifican, extienden.

### Verificación de la única extensión al contrato

Se agrega a `src/core/types/integration.ts` (additive only):
```typescript
// SOLO AGREGADO AL FINAL — no modifica ningún método existente
export interface IBlobCapable {
  downloadBlob(fileId: string): Promise<OperationResult<ReadableStream>>;
  getSpace(): Promise<OperationResult<{ used: number; total: number; free: number }>>;
}
export function isBlobCapable(adapter: IntegrationAdapter): adapter is IntegrationAdapter & IBlobCapable {
  return typeof (adapter as any).downloadBlob === 'function';
}
```

Los adapters existentes (`NotionAdapter`, `GoogleSheetsAdapter`, `StorageAdapter`) no implementan `IBlobCapable` y **no necesitan cambiar**. TypeScript no los fuerza porque es una interfaz separada, no una extensión de `IntegrationAdapter`.

---

## SECCIÓN 1 — RESTRICCIONES GLOBALES PARA GEMINI (Anti-Entropía)

Estas reglas aplican a **todos los archivos nuevos** sin excepción.

### NEVER (prohibido absoluto)

```
NEVER crear una nueva interfaz base paralela a IntegrationAdapter o BaseAdapter.
      → La investigación de MEGA propone IUniversalStorageAdapter. IGNORAR.
      → Todos los adapters extienden BaseAdapter. Sin excepción.

NEVER agregar métodos REQUIRED a IntegrationAdapter.
      → Solo métodos opcionales (?) para no romper Notion/Sheets/Storage adapters existentes.

NEVER importar desde src/core/media/ en los nuevos adapters de storage.
      → Esa capa pertenece al pipeline de ingesta. Los adapters de storage están en src/integrations/.

NEVER implementar OAuth directamente en un adapter.
      → Para Google/Microsoft: usar NangoAuthorizedClient (ya existe).
      → Para MEGA: credentials cifradas en cliente, nunca tocar el server.

NEVER crear un sistema de caché con Redis.
      → Vercel es serverless. No hay Redis persistente sin Upstash (no está en el stack).
      → Caché permitida: Map<> en memoria (por request) + IndexedDB en cliente.

NEVER usar search.list de YouTube API.
      → Costo: 100 unidades de cuota. Usar videos.list con IDs conocidos (1 unidad).

NEVER llamar videos.update de YouTube sin leer el estado actual primero.
      → YouTube hace PUT completo (no PATCH). Sin read-before-write = pérdida de metadata.

NEVER subir a MEGA un ReadableStream sin declarar el tamaño total primero.
      → MEGA buferea todo en memoria si no hay size declarado → OOM crash garantizado.

NEVER usar el mismo _seqno de MEGA en múltiples promises concurrentes.
      → Produce race conditions criptográficas → API_EARGS → requests rechazados.

NEVER almacenar credentials de MEGA en variables de clase o estado de servidor.
      → Las credentials viven únicamente en IndexedDB cifrado del cliente.

NEVER modificar register-all.ts sin agregar también el import del nuevo adapter.
      → Si se crea el adapter pero no se registra, el sistema lo ignora silenciosamente.
```

### MUST (obligatorio)

```
MUST extender BaseAdapter en todos los adapters nuevos.

MUST devolver OperationResult<T> en todos los métodos públicos.
      → Nunca throw desde un método público. Capturar y retornar this.error(...).

MUST usar NangoAuthorizedClient para Google y Microsoft.
      → Nunca instanciar axios/fetch directo con tokens hardcodeados.

MUST agregar el nuevo adapter a register-all.ts después de crearlo.

MUST usar megajs para MEGA (no HTTP crudo a la API de MEGA).
      → megajs ya maneja la criptografía AES-128, el mapeo de nodos y los sockets.

MUST mantener un caché local IndexedDB de path→nodeHandle para MEGA.
      → MEGA no tiene paths. Sin caché local, cada operación requiere traversal del árbol completo.

MUST verificar CBC-MAC después de cada descarga de MEGA.
      → Si el MAC falla, descartar el archivo y retornar error. Nunca entregar datos corruptos.

MUST agregar &ak={applicationKey} a todas las requests de MEGA.
      → Sin este parámetro, los balanceadores de MEGA aplican rate limiting agresivo.

MUST usar Zod safeParse para validar todas las respuestas de YouTube API.
      → YouTube puede devolver estructuras incompletas. safeParse evita throws no controlados.

MUST implementar ETags en YouTubeAdapter para requests condicionales.
      → ETag + If-None-Match = 0 unidades de cuota cuando el recurso no cambió.

MUST agrupar requests de YouTube en batches de 50 IDs.
      → 50 videos en 1 request = 1 unidad. 50 videos en 50 requests = 50 unidades.

MUST mantener IndexedDB sidecar en YouTubeAdapter para el árbol virtual de carpetas.
      → YouTube no tiene folders. Sin el sidecar, listInventory no puede construir el árbol.

MUST declarar freeSocketTimeout=4000 en el agente HTTP de MEGA.
      → MEGA cierra sockets inactivos a los 5s. Con 4s en cliente se evita ECONNRESET.
```

---

## SECCIÓN 2 — ARQUITECTURA (sin cambios respecto a v1.0)

```
StorageWidget (UI)
    └── /api/storage/union
        └── StorageUnion (implements IntegrationAdapter + IBlobCapable)
            ├── GoogleDriveAdapter  [EXISTE — solo agregar downloadBlob + getSpace]
            ├── MegaAdapter         [NUEVO]
            ├── YouTubeAdapter      [NUEVO]
            └── OneDriveAdapter     [NUEVO]
                    └── Nango (OAuth para Google + Microsoft)
                    └── megajs (MEGA — credentials en cliente)
```

---

## SECCIÓN 3 — ESPECIFICACIÓN DE CADA ADAPTER

### 3.1 Extensión de GoogleDriveAdapter (mínima, quirúrgica)

**Archivo:** `src/integrations/google-drive/adapter.ts`
**Cambio:** Agregar 2 métodos al final de la clase. No modificar ningún método existente.

```typescript
// AGREGAR al final de GoogleDriveAdapter — no tocar nada existente

async downloadBlob(fileId: string): Promise<OperationResult<ReadableStream>> {
  try {
    const response = await this.client.request({
      endpoint: `/drive/v3/files/${fileId}`,
      params: { alt: 'media' },
      responseType: 'stream',
    });
    return this.result(response.data);
  } catch (err) {
    return this.error(`DOWNLOAD_ERR: ${(err as Error).message}`);
  }
}

async getSpace(): Promise<OperationResult<{ used: number; total: number; free: number }>> {
  try {
    const response = await this.client.request({
      endpoint: '/drive/v3/about',
      params: { fields: 'storageQuota' },
    });
    const q = response.data.storageQuota;
    const used = parseInt(q.usageInDrive || '0');
    const total = parseInt(q.limit || '0');
    return this.result({ used, total, free: total - used });
  } catch (err) {
    return this.error(`SPACE_ERR: ${(err as Error).message}`);
  }
}
```

---

### 3.2 MegaAdapter

**Archivo:** `src/integrations/mega/adapter.ts`
**Dependencia nueva:** `megajs` (npm install megajs)
**Auth:** Credentials directas. NUNCA pasan por el servidor. Se reciben como parámetro en el constructor.

#### Contrato completo

```typescript
export class MegaAdapter extends BaseAdapter implements IBlobCapable {
  readonly id = 'mega';
  readonly label = 'MEGA';

  // credentials: { email, password, applicationKey }
  // Recibidos desde cliente (IndexedDB cifrado). Nunca almacenados en servidor.
  constructor(private readonly credentials: MegaCredentials) { super(); }

  // BaseAdapter obligatorios
  testConnection(): Promise<OperationResult<boolean>>
  listSources(): Promise<OperationResult<...>>         // carpetas raíz del usuario
  getSchema(): Promise<OperationResult<FieldSchema[]>> // schema estático: name, size, mimeType
  getRecords(): Promise<OperationResult<Record[]>>     // NOT IMPLEMENTED → this.error(...)
  pushRecords(): Promise<OperationResult<...>>         // NOT IMPLEMENTED → this.error(...)
  listInventory(query?: AgnosticQuery): Promise<OperationResult<AgnosticInventoryItem[]>>

  // IBlobCapable
  downloadBlob(fileId: string): Promise<OperationResult<ReadableStream>>
  getSpace(): Promise<OperationResult<{ used: number; total: number; free: number }>>

  // IntegrationAdapter opcional
  createResumableSession(targetId, fileName, mimeType, totalSize, metadata?)
    : Promise<OperationResult<{ resumableUri: string; sessionId: string }>>
    // Para MEGA: no hay "resumable URI" como Drive. Retornar sessionId interno que
    // referencia un MegaUpload en progreso. El PipelineUploadAdapter del túnel
    // de ingesta NO usa esto directamente — es para el storage widget únicamente.
}
```

#### Detalles de implementación críticos

**Path → NodeHandle cache (obligatorio):**
```
Al initialize(): sincronizar árbol completo de nodos una vez → IndexedDB
  Map<virtualPath, nodeHandle>
  Map<nodeHandle, { name, size, parentHandle }>
Actualizar el caché con eventos de MEGA: 'add', 'move', 'delete', 'update'
listInventory() consulta el caché local — NUNCA hace traversal al servidor por cada request
```

**Socket timeout:**
```typescript
// En el constructor, antes de autenticar:
// megajs internamente usa agentkeepalive o http.Agent
// Configurar freeSocketTimeout: 4000 (no 15000 que es el default)
// Esto evita ECONNRESET cuando MEGA cierra el socket a los 5s
```

**Mapeo de errores MEGA (códigos negativos en HTTP 200):**
```
-3  → retry con exponential backoff
-4  → rate limit → pausar cola, retry después
-8  → sesión expirada → re-authenticate
-9  → not found → OperationResult error
-14 → error criptográfico → DETENER, no reintentar
-17 → over quota → OperationResult error con hint
-18 → temp unavailable → retry
-22 → application key inválida → config error
```

**Upload (createResumableSession):**
```
MUST: declarar totalSize antes de iniciar el upload.
Si totalSize es desconocido en el momento de llamar → retornar error, no bufferear.
Usar megajs File.upload({ name, size, allowUploadBuffering: false })
```

**Verificación de integridad tras download:**
```
Verificar CBC-MAC del archivo descargado.
Si MAC falla → descartar archivo → retornar this.error('MEGA_MAC_VERIFICATION_FAILED')
NUNCA devolver datos con MAC inválido.
```

---

### 3.3 YouTubeAdapter

**Archivo:** `src/integrations/youtube/adapter.ts`
**Auth:** NangoAuthorizedClient con provider 'youtube'
**Prerequisito de configuración:** Agregar scope `youtube.upload` + `youtube.readonly` en Nango dashboard. Es configuración, no código.

#### Contrato completo

```typescript
export class YouTubeAdapter extends BaseAdapter implements IBlobCapable {
  readonly id = 'youtube';
  readonly label = 'YouTube';

  constructor(connectionId: string) {
    super();
    this.client = new NangoAuthorizedClient('youtube', connectionId);
  }

  // BaseAdapter obligatorios
  testConnection(): Promise<OperationResult<boolean>>    // GET /youtube/v3/channels?mine=true&part=id
  listSources(): Promise<OperationResult<...>>           // playlists del canal
  getSchema(): Promise<OperationResult<FieldSchema[]>>   // schema estático: title, description, privacyStatus
  getRecords(): Promise<OperationResult<Record[]>>       // NOT IMPLEMENTED → this.error(...)
  pushRecords(): Promise<OperationResult<...>>           // NOT IMPLEMENTED → this.error(...)
  listInventory(query?: AgnosticQuery): Promise<OperationResult<AgnosticInventoryItem[]>>

  // IBlobCapable
  downloadBlob(videoId: string): Promise<OperationResult<ReadableStream>>
  getSpace(): Promise<OperationResult<{ used: number; total: number; free: number }>>
    // YouTube no tiene límite → retornar { used: 0, total: Infinity, free: Infinity }

  // IntegrationAdapter opcional — UPLOAD de video
  createResumableSession(targetId, fileName, mimeType, totalSize, metadata?)
    : Promise<OperationResult<{ resumableUri: string; sessionId: string }>>
    // YouTube Resumable Upload API → retorna Location header como resumableUri
    // Solo acepta mimeType que comience con 'video/' → validar antes de llamar a Google
}
```

#### Gestión de cuota (crítico)

```
Budget diario: 10.000 unidades. Se resetea a medianoche Pacific Time.

Costos relevantes:
  videos.list (por batch de 50 IDs)  = 1 unidad   ← USAR ESTO
  search.list                        = 100 unidades ← NEVER USAR
  videos.insert (upload)             = 1600 unidades ← solo bajo demanda explícita del usuario
  videos.update                      = 50 unidades  ← leer antes de escribir (read-before-write)
  playlists.list                     = 1 unidad

Estrategia de batching obligatoria:
  listInventory() con 100 videos → 2 requests de 50 IDs = 2 unidades
  NO 100 requests individuales = 100 unidades
```

#### ETag cache (obligatorio)

```typescript
// En IndexedDB local, almacenar junto a cada recurso:
interface YouTubeCacheEntry {
  videoId: string;
  etag: string;
  data: YouTubeVideoResource;
  cachedAt: number;
}

// En cada GET, enviar: If-None-Match: {etag}
// Si YouTube responde 304 Not Modified → usar datos del caché → 0 unidades consumidas
```

#### Árbol virtual de carpetas (IndexedDB sidecar)

```typescript
// YouTube no tiene folders. El adapter mantiene este mapa en IndexedDB:
interface YouTubePathIndex {
  videoId: string;
  virtualPath: string;  // ej: "/colectivo/2026/mayo/evento.mp4"
  uploadedAt: string;
  connectionId: string; // para multi-cuenta
}

// listInventory(query) lee de este índice, no de YouTube API directamente
// Solo llama a YouTube API para sincronizar nuevos videos no indexados
// Al crear un video vía createResumableSession, registrar en el índice al finalizar
```

#### Validación con Zod (obligatorio)

```typescript
// Definir schema Zod para YouTubeVideoResource
// Usar z.safeParse() en TODAS las respuestas de la API
// Si safeParse falla → this.error('YOUTUBE_MALFORMED_RESPONSE: ...')
// NUNCA acceder a response.data.items[0].snippet directamente sin validar
```

#### read-before-write para updates

```typescript
// Antes de cualquier videos.update:
// 1. GET videos.list?id={videoId}&part=snippet,status,localizations
// 2. Merge los cambios sobre el objeto completo
// 3. PUT con el objeto completo
// NUNCA enviar un update parcial
```

---

### 3.4 OneDriveAdapter

**Archivo:** `src/integrations/onedrive/adapter.ts`
**Auth:** NangoAuthorizedClient con provider 'microsoft'
**Prerequisito:** Configurar provider 'microsoft' en Nango dashboard.

Este adapter es estructuralmente idéntico a `GoogleDriveAdapter` con endpoints de Microsoft Graph. Implementación directa:

```
testConnection()        → GET https://graph.microsoft.com/v1.0/me
listSources()           → GET /me/drive/root/children (carpetas)
listInventory(query)    → GET /me/drive/items/{parentId}/children
createResumableSession()→ POST /me/drive/items/{parentId}:/{name}:/createUploadSession
downloadBlob(id)        → GET /me/drive/items/{id}/content
getSpace()              → GET /me/drive → quota.used + quota.total + quota.remaining
```

No hay complejidad adicional. Es un find-and-replace de endpoints de Drive por endpoints de Graph.

---

## SECCIÓN 4 — StorageUnion

**Archivo:** `src/integrations/storage-union/index.ts`
**Implementa:** `IntegrationAdapter` + `IBlobCapable`

```typescript
type WritePolicy = 'mfs' | 'ff' | 'epmfs';
type ReadPolicy = 'ff' | 'all';

export class StorageUnion extends BaseAdapter implements IBlobCapable {
  readonly id = 'storage-union';
  readonly label = 'Storage Union';

  constructor(
    private upstreams: (IntegrationAdapter & Partial<IBlobCapable>)[],
    private writePolicy: WritePolicy = 'mfs',
    private readPolicy: ReadPolicy = 'all'
  ) { super(); }

  // listInventory: agrega TODOS los upstreams en paralelo (Promise.allSettled)
  // Prefija cada item.id con {provider}::{originalId} para unicidad global
  // Tolera fallos parciales — si un provider falla, los demás siguen respondiendo

  // createResumableSession: elige upstream según writePolicy
  //   mfs → el que tenga más free según getSpace()
  //   ff  → el primero disponible
  //   epmfs → si el path ya existe en algún upstream, ese; si no, mfs

  // downloadBlob: parsea el prefijo del fileId para rutear al upstream correcto
  //   "{provider}::{originalId}" → split + lookup en upstreams por id

  // getSpace: agrega getSpace() de todos los upstreams que implementen IBlobCapable

  // MIME routing (para YouTube — solo acepta video/*)
  // Si mimeType no empieza con 'video/' y el upstream elegido es YouTubeAdapter → skip al siguiente
}
```

---

## SECCIÓN 5 — API Route

**Archivo:** `src/app/api/storage/union/route.ts`

```
GET  /api/storage/union?parentId=root              → listInventory union completo
GET  /api/storage/union?parentId=root&provider=mega → listInventory solo MEGA
POST /api/storage/union/session                    → createResumableSession (routing automático)
GET  /api/storage/union/space                      → getSpace de todos los providers
```

El route instancia los adapters usando:
- Nango connection IDs desde la sesión del usuario (NextAuth)
- MEGA credentials desde el header cifrado (AES-GCM, derivado de la sesión)

**NEVER:** almacenar credentials de MEGA en la sesión del servidor o en variables del route.

---

## SECCIÓN 6 — UI del Widget

**Archivos nuevos en:** `src/components/storage/`

```
StorageWidget.tsx      ← contenedor principal, estado de conexión por provider
StorageTree.tsx        ← árbol agnostic, consume AgnosticInventoryItem[]
ProviderBadge.tsx      ← ícono + tooltip de espacio disponible por provider
CredentialVault.tsx    ← panel de credenciales MEGA (cifradas en IndexedDB del cliente)
```

**NEVER:** El widget llama únicamente a `/api/storage/union`. No instancia adapters directamente.
**MUST:** `StorageTree` consume solo `AgnosticInventoryItem[]` — no sabe qué provider es cada nodo.

---

## SECCIÓN 7 — Orden de Implementación para Gemini

### Fase 1 — Extensión del contrato (30 min)
1. Agregar `IBlobCapable` + `isBlobCapable` al **final** de `src/core/types/integration.ts`
2. Agregar `downloadBlob()` + `getSpace()` al **final** de `GoogleDriveAdapter` (no tocar métodos existentes)
3. Verificar que los adapters existentes (Notion, Sheets, Storage) sigan compilando sin cambios

### Fase 2 — MegaAdapter
1. `npm install megajs`
2. Crear `src/integrations/mega/adapter.ts`
3. Crear `src/integrations/mega/index.ts` (registro)
4. Agregar `import './mega'` en `register-all.ts`
5. Test: `testConnection()` + `listInventory()` + `getSpace()`

### Fase 3 — StorageUnion + API route
1. Crear `src/integrations/storage-union/index.ts`
2. Crear `src/app/api/storage/union/route.ts`
3. Test con GoogleDriveAdapter + MegaAdapter como upstreams

### Fase 4 — StorageWidget UI
1. `ProviderBadge.tsx`
2. `StorageTree.tsx`
3. `CredentialVault.tsx`
4. `StorageWidget.tsx`

### Fase 5 — YouTubeAdapter
1. Configurar scope `youtube.upload` + `youtube.readonly` en Nango dashboard (manual, no código)
2. Crear `src/integrations/youtube/adapter.ts`
3. Crear `src/integrations/youtube/index.ts`
4. Agregar `import './youtube'` en `register-all.ts`
5. Test: `listInventory()` con ETag cache + batching

### Fase 6 — OneDriveAdapter
1. Configurar provider `microsoft` en Nango dashboard (manual, no código)
2. Crear `src/integrations/onedrive/adapter.ts`
3. Crear `src/integrations/onedrive/index.ts`
4. Agregar `import './onedrive'` en `register-all.ts`

---

## SECCIÓN 8 — Antipatrones de código específicos a evitar

### Importaciones prohibidas en los nuevos adapters

```typescript
// FORBIDDEN — mezcla de capas
import { SovereignPipeline } from '@/core/media/pipeline'
import { IntegrityEngine } from '@/core/media/integrity'
import { HardwareTranscoder } from '@/lib/hardware-transcoder'

// FORBIDDEN — interface paralela (de la investigación de MEGA, no usar)
interface IUniversalStorageAdapter { ... }    // ← ignorar, usar BaseAdapter

// FORBIDDEN — fetch directo con token hardcodeado
const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
// → USAR NangoAuthorizedClient o megajs

// FORBIDDEN — throw desde método público
async listInventory() { throw new Error('...') }
// → USAR return this.error('...')
```

### Patterns de código que generan entropía

```typescript
// FORBIDDEN — clase nueva que no extiende BaseAdapter
export class MegaAdapter {  // ← sin extends BaseAdapter
  // ...
}

// FORBIDDEN — método requerido nuevo en IntegrationAdapter
export interface IntegrationAdapter {
  downloadBlob(id: string): Promise<...>  // ← si es required, rompe Notion/Sheets
}
// → SOLO agregar en IBlobCapable (interfaz separada)

// FORBIDDEN — duplicate auth
export class YouTubeAdapter {
  private token: string;  // ← nunca almacenar tokens en state de clase
  constructor(token: string) { this.token = token }
  // → USAR NangoAuthorizedClient que maneja refresh automático
}

// FORBIDDEN — caché en variable de módulo compartida
const globalCache = new Map()  // ← en serverless, cada request es stateless
// → Caché válida solo en IndexedDB (cliente) o Map<> dentro del scope del request
```

---

## SECCIÓN 9 — ADR (Decisiones de Arquitectura)

### ADR-STORAGE-001: rclone descartado
**Razón:** Binario del sistema. Incompatible con Vercel serverless. Su lógica es ~80 líneas TypeScript en `StorageUnion`.

### ADR-STORAGE-002: Un adapter class, N instancias
**Razón:** `MegaAdapter` instanciado 5 veces (5 miembros del colectivo, una cuenta legítima cada uno) = 5 upstreams en StorageUnion. Sin duplicación de código.

### ADR-STORAGE-003: IBlobCapable como interfaz separada (no extensión de IntegrationAdapter)
**Razón:** Agregar `downloadBlob` como método requerido en `IntegrationAdapter` rompería `NotionAdapter`, `GoogleSheetsAdapter` y `StorageAdapter`. Una interfaz separada preserva el contrato existente.

### ADR-STORAGE-004: Credentials MEGA nunca tocan el servidor
**Razón:** MEGA usa email+password (no OAuth). El server no puede ser custodio de esto. Se cifran con AES-GCM derivado de la sesión NextAuth del usuario y se guardan en IndexedDB del cliente.

### ADR-STORAGE-005: IUniversalStorageAdapter de la investigación MEGA — DESCARTADO
**Razón:** Es un contrato paralelo a `IntegrationAdapter`. Crearlo generaría entropía de interfaces. Los lifecycle hooks (`onBeforeWrite`, `onAfterQuery`) son útiles pero no para el MVP. Se implementa como extensión del contrato existente.

### ADR-STORAGE-006: Redis para caché YouTube — DESCARTADO
**Razón:** Vercel serverless no tiene Redis persistente sin Upstash (no está en el stack). Caché implementada con `Map<>` en memoria (scope de request, stateless) + `IndexedDB` en cliente para ETag persistence.

### ADR-STORAGE-007: Límite de bandwidth MEGA no se elude
**Razón:** Rotación de IP es ToS violation. Error `MEGA_BANDWIDTH_EXCEEDED` se propaga al widget con hint de retry en 6h y información de qué otras cuentas tienen cuota disponible vía `getSpace()`.

---

## SECCIÓN 10 — ARQUITECTURA UI: EXTENSIÓN AGNOSTICA

### 10.0 Diagnóstico de los componentes existentes

Los siguientes componentes YA EXISTEN y FUNCIONAN. No se reescriben; se extienden quirúrgicamente.

| Componente | Archivo | Estado | Gaps |
|---|---|---|---|
| `AgnosticTree` | `src/components/ui/agnostic-tree.tsx` | PRODUCCIÓN | Sin thumbnails. Sin provider badge. `integrationId` único (sin unión). |
| `AgnosticAtom` | mismo archivo | PRODUCCIÓN | Falta: `thumbnailUrl?`, `provider?`, `size?` |
| `useInventory` | `src/hooks/use-inventory.ts` | PRODUCCIÓN | **Cero cambios necesarios.** Funciona con cualquier `integrationId`. |
| `AgnosticInventoryItem` | `src/core/inventory/types.ts` | PRODUCCIÓN | Falta: `thumbnailUrl?` como campo explícito (actualmente enterrado en `metadata`). |
| `ResourceExplorer` | `src/components/resource-explorer/index.tsx` | PRODUCCIÓN | `getProviderColor()` hardcodeado. Solo conoce: notion, google-drive, google-sheets, storage. |
| `ExplorerPanel` | `src/features/connections/ui/ExplorerPanel.tsx` | PRODUCCIÓN | No requiere cambios. |

**Insight clave sobre `useInventory` con StorageUnion:**
El hook llama a `/api/integrations/${integrationId}/inventory`. Si `integrationId = 'storage-union'`, llama a `/api/integrations/storage-union/inventory`. Esto funciona **sin modificar el hook** siempre que `StorageUnion` esté registrado en `register-all.ts` con id `'storage-union'`. La ruta `/api/integrations/[id]/inventory` ya despacha al adapter registrado. **Costo de integración de StorageUnion en el árbol: cero líneas nuevas en el hook.**

---

### 10.1 NEVER/MUST para la capa UI

```
NEVER crear un hook nuevo para StorageUnion (useStorageInventory, useUnionTree, etc.)
      → useInventory('storage-union', {parentId}) ya funciona. Sin duplicación.

NEVER hardcodear colores, íconos, o labels de provider en componentes UI.
      → Todos los providers se registran en AdapterRegistry con meta: { color, icon, label }.
      → Los componentes leen del registry, nunca de un switch/if-chain.

NEVER implementar lógica de autenticación (tokens, credentials) en componentes UI.
      → Los componentes solo llaman rutas API. Las rutas instancian los adapters con auth.

NEVER abrir un stream de video sin verificar que el provider puede streamearlo.
      → Cada provider tiene una estrategia diferente. MediaPreview lee atom.provider y bifurca.

NEVER agregar un campo nuevo a AgnosticInventoryItem como objeto requerido.
      → Solo campos opcionales (?). No romper los adapters existentes (Notion, Sheets, Storage).

NEVER duplicar el AtomRow (item row) entre AgnosticTree y StorageWidget.
      → StorageWidget compone AgnosticTree. No crea su propia lista de items.

MUST registrar StorageUnion en register-all.ts con id = 'storage-union'.
      → Es la única forma de que /api/integrations/storage-union/inventory responda.

MUST poblar thumbnailUrl en listInventory() de cada adapter cuando el provider lo expone.
      → El dato viaja en el payload de inventario. Sin requests adicionales en el cliente.

MUST que MediaPreview sea un componente autónomo que recibe un AgnosticAtom completo.
      → No sabe qué provider es internamente. Lee atom.provider y delega a la estrategia correcta.

MUST que el streaming de MEGA ocurra en el cliente (megajs en browser), nunca proxy servidor.
      → Credentials de MEGA nunca tocan el servidor. El proxy servidor aplica solo a Drive/OneDrive.
```

---

### 10.2 Extensiones aditivas al contrato de inventario

#### `src/core/inventory/types.ts` — solo AGREGAR al final de `AgnosticInventoryItem`

```typescript
export interface AgnosticInventoryItem {
  id: string;
  name: string;
  type: 'file' | 'folder';
  rawMimeType?: string;
  size?: number;
  updatedAt?: string;
  isShared?: boolean;
  parentId: string;
  provider: string;
  metadata?: Record<string, any>;
  // ─── NUEVOS CAMPOS OPCIONALES (aditivos, no breaking) ────────────────
  /** URL de thumbnail lista para usar en <img>. Poblada por cada adapter cuando disponible. */
  thumbnailUrl?: string;
  /** URL de streaming directo (solo YouTube). Para Drive/OneDrive se usa la ruta proxy. */
  streamUrl?: string;
}
```

**Qué adapter popula qué:**
```
GoogleDriveAdapter.listInventory()  → thumbnailUrl = item.thumbnailLink (Drive API lo incluye gratis)
YouTubeAdapter.listInventory()      → thumbnailUrl = snippet.thumbnails.medium.url
                                    → streamUrl = undefined (se usa embed de YouTube en cliente)
OneDriveAdapter.listInventory()     → thumbnailUrl = thumbnails[0].small.url (MS Graph /thumbnails)
MegaAdapter.listInventory()         → thumbnailUrl = undefined (MEGA no provee thumbnails)
StorageUnion.listInventory()        → propaga los campos de cada upstream intactos
```

#### `src/components/ui/agnostic-tree.tsx` — extender `AgnosticAtom` (no refactor)

```typescript
export interface AgnosticAtom {
  id: string;
  name: string;
  type: 'file' | 'folder';
  rawMimeType?: string;
  isShared?: boolean;
  // ─── NUEVOS CAMPOS OPCIONALES ────────────────────────────────────────
  provider?: string;
  size?: number;
  thumbnailUrl?: string;
  streamUrl?: string;
}
```

`AgnosticInventoryItem` implementa un superset de `AgnosticAtom`, por lo que el cast `atom as AgnosticAtom` sigue funcionando. No se rompe ningún caller existente.

---

### 10.3 Thumbnails: cero requests adicionales en el cliente

El thumbnail viaja embebido en el payload de `listInventory`. Cuando el cliente renderiza la columna del árbol, los thumbnails ya están disponibles en `atom.thumbnailUrl` sin ningún fetch adicional.

**Renderizado lazy en `TreeColumn` (modificación mínima al componente existente):**

```typescript
// Dentro del map de items en TreeColumn, REEMPLAZAR el bloque del ícono:

{atom.thumbnailUrl && atom.type === 'file' ? (
  <img
    src={atom.thumbnailUrl}
    alt=""
    loading="lazy"                         // lazy nativo del browser
    decoding="async"
    className="size-8 rounded object-cover shrink-0 opacity-90"
    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
  />
) : atom.type === 'folder' ? (
  <Folder className={cn("size-4 shrink-0", isSelected ? "text-primary-foreground" : "text-primary/60")} />
) : (
  <File className="size-4 shrink-0 opacity-40" />
)}
```

Para MEGA (sin thumbnail), se muestra un bloque de color determinista basado en los primeros 3 chars del nombre:
```typescript
// Fallback visual para MEGA — sin network request
function MegaColorBlock({ name }: { name: string }) {
  const hue = name.charCodeAt(0) * 137 % 360;
  return (
    <div
      className="size-8 rounded shrink-0 flex items-center justify-center text-[8px] font-black text-white/80"
      style={{ backgroundColor: `hsl(${hue}, 60%, 35%)` }}
    >
      {name.slice(0, 2).toUpperCase()}
    </div>
  );
}
```

---

### 10.4 Streaming de video e imagen por provider

Cada provider tiene una estrategia distinta. `MediaPreview` lee `atom.provider` y bifurca:

| Provider | Estrategia | Quién hace el trabajo |
|---|---|---|
| `google-drive` | Proxy servidor: `GET /api/storage/stream/google-drive/[fileId]?connectionId=...` | Nango token en servidor |
| `onedrive` | Proxy servidor: `GET /api/storage/stream/onedrive/[fileId]?connectionId=...` | Nango token en servidor |
| `youtube` | Embed: `<iframe src="https://www.youtube.com/embed/{videoId}" />` | YouTube CDN directo |
| `mega` | Client-side: `megajs` en el browser → `URL.createObjectURL(blob)` | megajs en Web Worker |

#### Ruta proxy servidor (Drive + OneDrive)

**Archivo:** `src/app/api/storage/stream/[provider]/[fileId]/route.ts`

```typescript
export async function GET(
  req: NextRequest,
  { params }: { params: { provider: string; fileId: string } }
) {
  // 1. Validar provider: solo 'google-drive' y 'onedrive' son válidos aquí
  //    MEGA y YouTube no usan esta ruta — retornar 400 si se intentan
  if (!['google-drive', 'onedrive'].includes(params.provider)) {
    return new Response('Provider not supported via server proxy', { status: 400 });
  }

  // 2. Obtener connectionId de la sesión (NextAuth) — NUNCA del query param
  const session = await getServerSession(authOptions);
  if (!session) return new Response('Unauthorized', { status: 401 });

  // 3. Obtener adapter del registry
  const adapter = getAdapter(params.provider, { connectionId: session.connectionIds[params.provider] });
  if (!isBlobCapable(adapter)) return new Response('Adapter not blob-capable', { status: 501 });

  // 4. Llamar downloadBlob — retorna ReadableStream
  const result = await adapter.downloadBlob(params.fileId);
  if (!result.ok) return new Response(result.error?.message, { status: 502 });

  // 5. Propagar Range headers para seeking en <video>
  const rangeHeader = req.headers.get('range');
  return new Response(result.data as ReadableStream, {
    headers: {
      'Content-Type': 'video/mp4',
      'Accept-Ranges': 'bytes',
      ...(rangeHeader && { 'Content-Range': rangeHeader }),
    },
  });
}
```

**MUST:** `connectionId` siempre desde la sesión del servidor. NEVER desde query params (vulnerable a IDOR).

#### Streaming client-side para MEGA

```typescript
// En MediaPreview, cuando atom.provider === 'mega':
// 1. Leer credentials de IndexedDB (cifradas con AES-GCM derivado de la sesión)
// 2. Instanciar megajs en un Web Worker (no bloquear el hilo principal)
// 3. file.download() → ReadableStream → URL.createObjectURL()
// 4. Asignar el objectURL al src del <video>
// 5. Al desmontar: URL.revokeObjectURL() para liberar memoria

// MUST: Revocar el objectURL en useEffect cleanup — sin fugas de memoria
```

---

### 10.5 Provider Registry: agnostic color/icon (sin hardcode)

**Archivo:** `src/integrations/registry.ts` ← YA EXISTE o ya tiene un equivalente. Extender con un campo `meta` estático.

Cada clase de adapter expone un campo estático `meta`:

```typescript
// Patrón a aplicar en cada adapter (ejemplo GoogleDriveAdapter):
export class GoogleDriveAdapter extends BaseAdapter {
  static readonly meta = {
    color: 'text-emerald-600 dark:text-emerald-400',
    icon: 'hard-drive',          // nombre de ícono de lucide-react
    label: 'Google Drive',
    accentCss: 'bg-emerald-500', // para el badge de color sólido
  };
  // ... resto sin cambios
}

// MegaAdapter:
static readonly meta = { color: 'text-red-500 dark:text-red-400', icon: 'zap', label: 'MEGA', accentCss: 'bg-red-500' };

// YouTubeAdapter:
static readonly meta = { color: 'text-red-600 dark:text-red-400', icon: 'play-circle', label: 'YouTube', accentCss: 'bg-red-600' };

// OneDriveAdapter:
static readonly meta = { color: 'text-blue-500 dark:text-blue-400', icon: 'cloud', label: 'OneDrive', accentCss: 'bg-blue-500' };
```

**Función de lookup agnostica** (reemplaza el if-chain en `ResourceExplorer`):

```typescript
// src/integrations/registry.ts — agregar esta función al final
import { adapterRegistry } from './register-all'; // el registry ya existe

export function getAdapterMeta(integrationId: string) {
  const AdapterClass = adapterRegistry.get(integrationId);
  return (AdapterClass as any)?.meta ?? {
    color: 'text-muted-foreground',
    icon: 'database',
    label: integrationId,
    accentCss: 'bg-muted-foreground',
  };
}
```

**Reemplazar `getProviderColor` en `ResourceExplorer`:**
```typescript
// ANTES (hardcoded):
function getProviderColor(integration: string) {
  if (integration === 'notion')       return 'text-zinc-900 dark:text-zinc-100';
  if (integration === 'google-drive') return 'text-emerald-600 dark:text-emerald-400';
  // ...
}

// DESPUÉS (agnostico):
import { getAdapterMeta } from '@/integrations/registry';
// Usar directamente: getAdapterMeta(conn.integration).color
```

Los adapters existentes (Notion, Sheets, Storage local) también deben agregar el campo `static readonly meta` — no cambia su comportamiento, solo agrega información declarativa.

---

### 10.6 ProviderBadge — especificación

**Archivo:** `src/components/storage/ProviderBadge.tsx`
**Props:** `{ provider: string; showLabel?: boolean; size?: 'xs' | 'sm' }`
**Dependencia:** `getAdapterMeta` del registry — sin hardcode.

```typescript
// Comportamiento:
// 1. Lee getAdapterMeta(provider) → color, icon, label
// 2. Renderiza un punto de color + ícono lucide + label opcional
// 3. Tooltip con label completo y espacio disponible (opcional: recibe spaceInfo)

// Apariencia en AgnosticTree (dentro de cada AtomRow):
<ProviderBadge provider={atom.provider} size="xs" />
// → Punto de color 6px + ícono 10px, sin label (muy compacto para el árbol)

// Apariencia en StorageWidget header (para cada provider activo):
<ProviderBadge provider="google-drive" showLabel size="sm" />
// → Ícono 14px + "Google Drive" + espacio usado
```

---

### 10.7 MediaPreview — especificación

**Archivo:** `src/components/storage/MediaPreview.tsx`
**Props:** `{ atom: AgnosticAtom; connectionId?: string; onClose: () => void }`

Este componente se monta cuando el usuario hace clic en un archivo en el árbol. Se renderiza en un panel lateral o modal sobre el árbol.

```
Lógica interna (sin hardcode de providers — lee atom.provider):

is_image: rawMimeType.startsWith('image/')
is_video: rawMimeType.startsWith('video/') || provider === 'youtube'

Si is_image:
  → <img src={thumbnailUrl o streamUrl_resolto} className="max-h-full object-contain" />
  → Si thumbnailUrl existe: mostrar thumbnail inmediatamente, lazy-load full res al hover

Si is_video y provider === 'youtube':
  → <iframe src={`https://www.youtube.com/embed/${atom.id.split('::')[1]}`} />
  → (atom.id tiene formato 'youtube::{videoId}' por el prefijo de StorageUnion)

Si is_video y provider === 'google-drive' o 'onedrive':
  → <video controls src={`/api/storage/stream/${provider}/${originalId}?connectionId=${connectionId}`} />
  → originalId = atom.id.split('::')[1] (quitar el prefijo del StorageUnion)

Si is_video y provider === 'mega':
  → Botón "Cargar stream" → onClick dispara el flujo megajs client-side
  → <video controls src={objectUrl} /> cuando objectUrl está listo
  → Spinner mientras se descarga
  → MUST: URL.revokeObjectURL() en cleanup

Cualquier otro tipo:
  → Ícono genérico + nombre + tamaño + fecha
  → Botón de descarga que dispara el mismo flujo según provider
```

**Calidad adaptativa (low-bandwidth mode):**
```
Si el archivo tiene thumbnailUrl: mostrar thumbnail de inmediato (no esperar full stream)
Si es video de Drive/OneDrive: el <video> hace streaming con range requests — reproduce desde 0s sin descargar todo
Si es video de MEGA: mostrar advertencia de tamaño + confirmación antes de iniciar la descarga
```

---

### 10.8 StorageWidget — composición final

**Archivo:** `src/components/storage/StorageWidget.tsx`

Este componente es el contenedor principal que une todo. **No reimplementa ninguna lógica existente**; compone los piezas existentes.

```
StorageWidget
  ├── Header
  │     └── [ProviderBadge x N providers activos] — con espacio disponible via /api/storage/union/space
  ├── AgnosticTree
  │     integrationId="storage-union"         ← usa useInventory('storage-union', ...) existente
  │     onSelect={(atom) => setPreviewAtom(atom)}
  └── MediaPreview (condicional, panel lateral)
        atom={previewAtom}
        connectionId={session.connectionIds[previewAtom?.provider]}
        onClose={() => setPreviewAtom(null)}
```

**Estado mínimo en StorageWidget:**
```typescript
const [previewAtom, setPreviewAtom] = useState<AgnosticAtom | null>(null);
// Nada más. AgnosticTree maneja su propia navegación internamente.
// MediaPreview maneja su propio estado de stream internamente.
```

**MUST:** `StorageWidget` solo puede instanciarse en un contexto autenticado (tiene que poder leer `session.connectionIds` del servidor). Es un Server Component que pasa `connectionId` como prop a los hijos Client Components, nunca los lee en el cliente directamente.

---

### 10.9 Wiring de StorageUnion al árbol existente (secuencia completa)

Para que `AgnosticTree` navegue todos los providers simultáneamente, el único cambio de configuración es:

```
1. StorageUnion.id = 'storage-union' (ya definido en Sección 4)
2. Registrar StorageUnion en register-all.ts:
   import './storage-union'
3. El route /api/integrations/[id]/inventory despacha a StorageUnion.listInventory()
4. StorageUnion.listInventory() llama a todos los upstreams en parallel (Promise.allSettled)
5. Prefija item.id con '{provider}::{originalId}' para unicidad global
6. Retorna AgnosticInventoryResponse con los items de todos los providers mezclados
7. useInventory('storage-union', {parentId}) recibe la respuesta — sin cambios en el hook
8. AgnosticTree renderiza los items con ProviderBadge diferenciando visualmente cada provider
```

**Filtrado por provider (opcional, sin nuevo hook):**
```
useInventory('storage-union', { parentId: 'root', search: 'provider:mega' })
→ El route /api/integrations/storage-union/inventory interpreta 'provider:mega' como filtro
→ StorageUnion solo agrega el upstream de MEGA en ese request
```

---

### 10.10 Orden de implementación UI para Gemini (extensión de Fase 4)

La Fase 4 del plan (antes genérica) se descompone en:

#### Fase 4a — Extensiones al contrato (10 min, sin riesgo)
1. Agregar `thumbnailUrl?` y `streamUrl?` al final de `AgnosticInventoryItem` en `src/core/inventory/types.ts`
2. Agregar `thumbnailUrl?`, `provider?`, `size?`, `streamUrl?` a `AgnosticAtom` en `agnostic-tree.tsx`
3. Verificar que todo compila — cero cambios de comportamiento

#### Fase 4b — Provider Registry (15 min)
1. Agregar `static readonly meta` a cada adapter (GoogleDrive, Notion, Sheets, Storage local, y los nuevos)
2. Agregar `getAdapterMeta(id)` al final de `src/integrations/registry.ts`
3. Reemplazar el if-chain `getProviderColor` en `ResourceExplorer` con `getAdapterMeta(conn.integration).color`
4. Crear `src/components/storage/ProviderBadge.tsx`

#### Fase 4c — Thumbnails + ProviderBadge en el árbol (20 min)
1. Modificar el bloque del ícono en `TreeColumn` de `agnostic-tree.tsx` para mostrar `thumbnailUrl` cuando existe
2. Agregar `<ProviderBadge>` al lado del nombre del item (solo cuando `atom.provider` está definido)
3. Poblar `thumbnailUrl` en `GoogleDriveAdapter.listInventory()` desde el campo `thumbnailLink` que Google ya devuelve
4. Poblar `thumbnailUrl` en `YouTubeAdapter.listInventory()` desde `snippet.thumbnails.medium.url`

#### Fase 4d — MediaPreview + Streaming (30 min)
1. Crear `src/app/api/storage/stream/[provider]/[fileId]/route.ts` (proxy para Drive + OneDrive)
2. Crear `src/components/storage/MediaPreview.tsx` (con las 4 estrategias por provider)
3. Crear `src/components/storage/StorageWidget.tsx` (composición final)
4. Registrar StorageUnion en `register-all.ts`

#### Verificación final
```
Test 1: AgnosticTree con integrationId='google-drive' sigue funcionando (regresión cero)
Test 2: AgnosticTree con integrationId='storage-union' navega items de Drive + MEGA mezclados
Test 3: Hacer clic en un archivo de Drive → MediaPreview muestra thumbnail → clic en play → video stream
Test 4: Hacer clic en un video de YouTube → MediaPreview muestra embed de YouTube
Test 5: ProviderBadge muestra el color correcto para cada provider sin hardcode
Test 6: ResourceExplorer muestra MEGA y YouTube con sus colores (vía getAdapterMeta)
```

---

### ADR-UI-001: thumbnailUrl en el payload de inventario, no como request separado
**Razón:** Un request separado de thumbnail por cada ítem visible en la columna generaría N+1 requests. Los providers (Drive, YouTube, OneDrive) ya incluyen la URL del thumbnail en la respuesta de listado de archivos. El adapter la extrae y la propaga en `thumbnailUrl`. Costo en cliente: cero requests adicionales.

### ADR-UI-002: Streaming de MEGA en el cliente, no en el servidor
**Razón:** Las credentials de MEGA (email + password) nunca tocan el servidor (ADR-STORAGE-004). Sin credentials en el servidor, no hay proxy posible. megajs funciona en el browser con Web Workers, maneja la criptografía AES-128 y genera un objectURL temporal. Es el único path seguro y correcto.

### ADR-UI-003: YouTube usa embed, no proxy
**Razón:** YouTube no permite descargar videos vía API para reproducción externa. El embed de YouTube (`/embed/{videoId}`) funciona con videos unlisted/public, respeta la privacidad del canal y no consume cuota de API. Un proxy de video de YouTube violaría ToS.

### ADR-UI-004: AgnosticTree no se reemplaza, se extiende
**Razón:** `AgnosticTree` ya tiene lógica probada de Miller columns, ancestry resolution, auto-scroll, ghost column prevention y scroll-into-view. Reemplazarla por un `StorageTree` nuevo duplicaría código y rompería el resto del sistema (ExplorerPanel sigue usando AgnosticTree). La extensión es aditiva: 3 campos nuevos en la interfaz y un bloque condicional de thumbnail en el renderizado.
