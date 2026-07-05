---
plan: 12_PLAN_s3-r2-adapter
estado: LISTO
ejecutor: codex
depende_de: [11]
---

# 12 — Adaptador S3/R2 real + operaciones de gestión en el contrato

## Contexto

La UI y la API ya capturan credenciales de Cloudflare R2 (commit `bfbf099`): la ruta
`src/app/api/integrations/route.ts` (rama `type === 's3'`, línea ~101) guarda en
`storage_connections` filas con `provider: 's3'` y credenciales cifradas con la forma
exacta `{ bucket, endpoint, accessKeyId, secretAccessKey }`. **Pero el adaptador no
existe**: no hay módulo `s3` en `src/integrations/` ni import en `register-all.ts`.

Este plan lo crea contra el contrato del Plan 11 (`IntegrationAdapter` +
`capabilities`), y de paso extiende el contrato con las operaciones de gestión
(borrar/renombrar/mover) que la visión del North Star exige y que hoy ningún proveedor
declara. El patrón de referencia para TODO este plan es el módulo Mega:
`src/integrations/mega/{adapter.ts,index.ts}` (clase que extiende `BaseAdapter`,
implementa `IBlobCapable`, factory registrada con contexto de credenciales).

IMPORTANTE — id del proveedor: usa `'s3'` en el registro y en la carpeta
(`src/integrations/s3/`), porque es lo que la DB y las rutas ya usan. El label visible
puede decir "Cloudflare R2 / S3".

## Operaciones

### Paso 1 — Dependencias

```
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

### Paso 2 — Extender el contrato con operaciones de gestión

En `src/core/types/integration.ts`, añade a la interfaz `IntegrationAdapter` tres
métodos OPCIONALES (después de `createResumableSession?`):

```typescript
  /** Borrar un ítem (archivo) del proveedor. Requiere capabilities.canDelete. */
  deleteItem?(itemId: string): Promise<OperationResult<boolean>>;

  /** Renombrar un ítem manteniendo su ubicación. Requiere capabilities.canRename. */
  renameItem?(itemId: string, newName: string): Promise<OperationResult<{ newId: string }>>;

  /** Mover un ítem a otra carpeta/prefijo. Requiere capabilities.canMove. */
  moveItem?(itemId: string, targetFolderId: string): Promise<OperationResult<{ newId: string }>>;
```

En `src/core/types/capabilities.ts`, añade a `auditManifestCoherence` tres chequeos
análogos a los existentes:

```typescript
  if (caps.canDelete && typeof adapter.deleteItem !== 'function')
    v.push('canDelete=true pero deleteItem no está implementado');
  if (caps.canRename && typeof adapter.renameItem !== 'function')
    v.push('canRename=true pero renameItem no está implementado');
  if (caps.canMove && typeof adapter.moveItem !== 'function')
    v.push('canMove=true pero moveItem no está implementado');
```

No toques nada más de esos dos archivos. Los adaptadores existentes declaran
`canDelete/canRename/canMove: false`, así que la suite debe seguir en verde sin
modificarlos.

### Paso 3 — Crear `src/integrations/s3/adapter.ts`

Clase `S3Adapter extends BaseAdapter implements IBlobCapable` (espejo estructural de
`MegaAdapter`). Constructor recibe `S3Credentials`:

```typescript
export interface S3Credentials {
  bucket: string;
  endpoint: string;      // p. ej. https://<accountid>.r2.cloudflarestorage.com
  accessKeyId: string;
  secretAccessKey: string;
}
```

Cliente: `new S3Client({ region: 'auto', endpoint, credentials, forcePathStyle: true })`.

Implementación (S3 API estándar, compatible R2):

- `id = 's3'`, `label = 'Cloudflare R2 / S3'`, `meta` con icono/color propios (espejo de Mega).
- `testConnection`: `HeadBucketCommand`.
- `listInventory(query)`: `ListObjectsV2Command` con `Delimiter: '/'` y `Prefix` derivado
  del folder solicitado en la query (raíz = sin prefix). `CommonPrefixes` → ítems
  `type: 'folder'` (id = prefix); `Contents` → ítems `type: 'file'` (id = Key,
  name = último segmento del Key, `rawMimeType` inferido de la extensión si es trivial,
  si no omítelo).
- `downloadBlob(fileId, rangeHeader?)`: `GetObjectCommand` con `Range: rangeHeader` si
  viene; devuelve el Body como ReadableStream web (`transformToWebStream()`).
- `createResumableSession(targetId, fileName, mimeType, totalSize)`: URL prefirmada de
  PUT (`getSignedUrl` con `PutObjectCommand`, expiración 3600s) →
  `{ resumableUri: <url>, sessionId: <key> }`. Es subida de un solo tramo, NO
  reanudable: por eso el manifiesto declara `canResumableUpload: false`.
- `deleteItem(itemId)`: `DeleteObjectCommand`. Solo archivos; si el id termina en `/`
  (carpeta/prefijo), devuelve `ok: false` con error explicativo — el borrado recursivo
  queda `// TODO(plan-16)`.
- `renameItem(itemId, newName)`: `CopyObjectCommand` (mismo prefijo, nuevo nombre) +
  `DeleteObjectCommand` del original; devuelve `{ newId }`.
- `moveItem(itemId, targetFolderId)`: `CopyObjectCommand` al nuevo prefijo +
  `DeleteObjectCommand`; devuelve `{ newId }`.
- `getSchema/getRecords/pushRecords/listSources`: espejo de cómo MegaAdapter maneja las
  operaciones de records que no aplican a un blob store (mismos stubs/errores).
- NO implementes `getSpace` (R2 no expone cuota vía S3 API).

Manifiesto honesto:

```typescript
  readonly capabilities: CapabilityManifest = {
    canListInventory: true,
    canDownload: true,
    canStream: true,           // GetObject acepta Range
    canUpload: true,           // PUT prefirmado
    canResumableUpload: false, // TODO(plan-16): multipart upload
    canDelete: true,
    canRename: true,
    canMove: true,
    canThumbnail: false,
    canQuota: false,           // S3 API no expone cuota en R2
    canPublish: false,
  };
```

### Paso 4 — Crear `src/integrations/s3/index.ts` y registrar

Espejo exacto de `src/integrations/mega/index.ts`:
`registry.registerAdapter('s3', (context: S3Credentials) => new S3Adapter(context), S3Adapter.meta);`

Añadir `import './s3';` a `src/integrations/register-all.ts`.

### Paso 5 — Suite

La suite de `src/core/testing/adapter-contract.test.ts` debe cubrir el nuevo adaptador
igual que a los demás (si itera una lista explícita de módulos, añade `s3` con un
contexto mock `{ bucket: 'test', endpoint: 'https://test.local', accessKeyId: 'x',
secretAccessKey: 'y' }`). La suite sigue siendo offline: ninguna llamada de red.

### Paso 6 — Índice

En `docs/SUBSYSTEMS.md`, reemplaza la fila `Integrations: R2/Cloudflare | (sin adaptador) | ...`
por:
`| Integrations: S3/R2 | src/integrations/s3 | Adaptador Cloudflare R2 / S3 (ListObjectsV2, GetObject+Range, PUT prefirmado, delete/rename/move vía Copy+Delete). Registrado como 's3' en register-all.ts. | EN_DESARROLLO | docs/plans/12_PLAN_s3-r2-adapter.md |`

### Paso 7 — Estado

Marca este plan `estado: EJECUTADO` en su frontmatter.

## Prohibiciones

- NO toques las rutas API (`src/app/api/**`). Si descubres que la ruta de stream/union
  no sabe instanciar el adaptador `s3` con credenciales cifradas: NO lo arregles;
  repórtalo como hallazgo (será alcance del siguiente plan).
- NO modifiques la lógica de otros adaptadores ni sus manifiestos.
- NO toques UI (`src/components`).
- NO stagees `.claude/settings.local.json` ni nada fuera de la lista de ## Commit.
- NO uses `git add -A` / `git add .`.
- Un solo commit final (squash de tus iteraciones): nada de commits repetidos con el
  mismo mensaje.

## Verificación (correr todos; pegar salida literal)

```powershell
npx tsc --noEmit                                   # → sin errores
npm run test:contract                              # → en verde, ahora cubriendo 's3'
git grep -ln "capabilities" -- src/integrations/   # → incluye src/integrations/s3/adapter.ts
git diff --cached --stat                           # → solo archivos de este plan
```

## Commit

Archivos exactos del commit: `package.json`, `package-lock.json`,
`src/core/types/integration.ts`, `src/core/types/capabilities.ts`,
`src/integrations/s3/adapter.ts`, `src/integrations/s3/index.ts`,
`src/integrations/register-all.ts`, `src/core/testing/adapter-contract.test.ts`,
`docs/SUBSYSTEMS.md`, `docs/plans/12_PLAN_s3-r2-adapter.md`.

```
feat(integrations): S3/R2 adapter with full management ops + contract management extensions (Plan 12)
```
