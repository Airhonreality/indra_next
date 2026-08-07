---
plan: 24_PLAN_verificacion-e2e-storage
estado: EN_EJECUCION
ejecutor: orquestador
depende_de: [05, 06, 19, 20, 23]
---

# 24 — Verificación E2E de Storage: doctrina de testing por fase + cierre del puente Local↔Nube

## Contexto

Javier pidió un test de uso real: invocar Indra en la máquina local → clonar un archivo al
storage → consultar vía REST a la nube la lista de archivos (más reciente) → verificar que el
archivo clonado llegó → validar que no está corrupto → repetir el proceso en sentido inverso
(nube → local) → medir tiempos, uso de red y calidad.

Antes de ejecutar ese test se auditó su diseño (ver conversación) y se encontró un **hallazgo
bloqueante**: el puente entre el daemon local y la nube no existe todavía en el código, por lo
que el test, tal como se pidió, es irrealizable de punta a punta hoy. Esa auditoría también
produjo una rúbrica de auditabilidad (reproducibilidad, aislamiento, criterio de éxito
explícito, instrumentación, trazabilidad, cobertura de camino negativo, significancia
estadística) que este plan adopta como estándar para cada fase futura.

Entre esa auditoría y este documento, una sesión previa del agente instalador (2026-08-07) hizo
trabajo real y verificable sobre la Fase 0 (instalador + daemon local). Este plan:

1. Dockumenta esa Fase 0 como **EJECUTADO**, con evidencia concreta.
2. Fija la **doctrina de verificación embebida por fase** que se debe repetir en cada plan
   posterior (no solo en este).
3. Define las fases que faltan para cerrar el puente Local↔Nube y llegar al test real de uso
   (Fase 5), con sus propias secciones `## Verificación` mecánicas.

**Autocontención**: un agente frío puede retomar este plan leyendo solo este archivo — no
requiere la conversación donde se hizo la auditoría original.

---

## Doctrina: verificación embebida por fase (aplicar a partir de ahora)

Cada fase de este plan — y cada plan nuevo del repo de aquí en adelante que toque el daemon o
el puente nube — debe declarar explícitamente, dentro de su propia sección `## Verificación`,
estos siete puntos (heredados de la auditoría previa). Si un punto no aplica, se anota "N/A" con
la razón, nunca se omite en silencio:

1. **Criterio de éxito/fallo explícito y binario** — nunca "verificar que llegó"; siempre un
   comando que retorna 0/≠0 o un valor comparado contra un umbral numérico.
2. **Identificación inequívoca del artefacto de prueba** — nombre único (UUID en el filename o
   en el contenido), nunca "el archivo más reciente" como único criterio de búsqueda.
3. **Integridad verificable por hash** — comparar BLAKE3 (ya es el algoritmo nativo del
   proyecto, ver `Blake3Hash` en `daemon-rs/crates/indra-core/src/types.rs:43`) del origen contra
   el destino, no solo "se puede abrir".
4. **Aislamiento** — cuenta/BYODB de prueba dedicada, nunca contra datos reales de un usuario.
5. **Instrumentación declarada** — de dónde sale cada métrica (logs `tracing` del daemon,
   `latencyMs` que ya devuelve `/api/storage/union`, captura de red) antes de correr el test, no
   después.
6. **Trazabilidad** — cada corrida registra: commit/hash del binario bajo prueba, timestamp,
   run ID, y guarda el log crudo en un archivo (no solo un resumen narrado).
7. **Significancia estadística en métricas de tiempo** — n≥10 corridas con percentiles (p50/p95)
   para cualquier claim de "tarda X segundos", nunca una sola corrida.

---

## Fase 0 — Instalador y daemon local (**EJECUTADO** — 2026-08-07, verificado)

Trabajo real confirmado por evidencia en disco y en `git status` (no solo por el reporte de la
sesión anterior):

| Verificación | Resultado |
|---|---|
| `daemon-rs/target/release/indra-daemon.exe` existe | ✅ confirmado (`ls` directo) |
| `daemon-rs/Indra_Desktop_Setup.exe` (instalador NSIS) existe | ✅ confirmado |
| `daemon-rs/indra.nsi` (script del instalador) existe | ✅ confirmado, sin trackear en git |
| `indra-daemon/Cargo.toml` ya no depende incondicionalmente de `indra-linux` | ✅ confirmado — `[target.'cfg(windows)'.dependencies]` aísla `indra-windows`, sin entrada equivalente para linux en la raíz |
| Puerto gRPC por defecto | `50051` (`indra-core/src/types.rs:35`, `DaemonConfig::default`) |
| Servidor gRPC realmente escucha (no solo compila) | ✅ reportado por sesión anterior vía `Get-NetTCPConnection` independiente del proceso, más `S_OK`/logs — método de verificación válido |
| Registro real en Windows Registry (`HKCU\SOFTWARE\SyncEngines\Providers\Indra`) | ✅ vía `indra-windows/src/registry.rs` — escritura de claves de registro simple, **no** vía Cloud Filters API |

### Gaps que siguen abiertos (confirmados leyendo el código, no solo inferidos)

- **`CfRegisterSyncRoot` sigue sin invocarse.** `daemon-rs/crates/indra-windows/src/cfapi/root.rs:59-63`
  tiene la llamada real comentada; la función retorna `Ok(())` habiendo solo logueado. La carpeta
  "Indra Drive" es una carpeta local corriente sin placeholders ni hidratación bajo demanda.
- **Los callbacks CFAPI están explícitamente marcados como no usados.**
  `daemon-rs/crates/indra-windows/src/cfapi/callbacks.rs:134-137`: *"these callback functions are
  defined but not currently used... For now, file watching is handled via notify crate."*
- **El servicio gRPC (`SyncService`) es un stub.** `daemon-rs/crates/indra-daemon/src/grpc.rs`:
  `pull`/`push`/`subscribe` devuelven listas vacías o un stream vacío. Escucha en el puerto pero
  no mueve datos.
- **No existe ninguna llamada saliente (HTTP/S3/gRPC-cliente) en `daemon-rs` que suba un archivo
  a un backend remoto.** El daemon solo escribe en su SQLite local (`db_path` en `DaemonConfig`).
- **`/api/desktop/bridge` sigue codificado a "no implementado".**
  `src/app/api/desktop/bridge/route.ts:7-9,32-41`: retorna siempre
  `{ capability: 'none', isRunning: false }` y su comentario apunta a chequear el puerto
  **9876** — que no coincide con el `50051` real del daemon. Este mismatch de puerto hay que
  corregirlo explícitamente en la Fase 1, no asumir cuál es el correcto.

### Decisión pendiente de la sesión anterior (sin resolver)

La sesión anterior dejó cambios reales sin commitear en: `daemon-rs/Cargo.{toml,lock}`,
`indra-core/{engine,types}.rs`, `indra-daemon/{Cargo.toml,src/main.rs}`,
`indra-windows/{Cargo.toml,src/cfapi/callbacks.rs,src/cfapi/root.rs,src/registry.rs}`, y
preguntó explícitamente si commitear (y opcionalmente pushear). Esa pregunta **no** se ha
respondido todavía — se traslada a Javier en este turno, no se decide unilateralmente.

---

## Fase 1 — Cliente gRPC real en Next.js + Pull() real en el daemon (**EJECUTADO Y VERIFICADO** — 2026-08-07)

Javier eligió la opción **(B)**: cliente gRPC real en Next.js (`@grpc/grpc-js` +
`@grpc/proto-loader` contra `sync.proto`), fiel al diseño original de
`23_PLAN_multi-device-sync.md`, en vez del endpoint HTTP ligero o de reusar el adaptador S3/R2.

### Trabajo realizado

- **`daemon-rs/crates/indra-core/src/cache.rs`**: `sync_entries` ahora persiste `content_hash`
  (BLAKE3, 32 bytes) y guarda `modified_at` en **milisegundos** (no segundos) — con segundos,
  dos archivos creados en la misma ventana de 1s eran indistinguibles para "más reciente", el
  problema exacto que la auditoría original marcó como debilidad de diseño. Se agregó
  `list_recent(limit)`.
- **`daemon-rs/crates/indra-core/src/engine.rs`**: `process_file` ahora persiste la entrada en
  `sync_entries` **antes** de escribir `chunks`/`hash_references` (ver bug de FK abajo), y marca
  el archivo `Synced` al terminar — antes de este cambio ningún archivo salía nunca de
  `Pending`/`Syncing` porque `ProcessMetadata` nunca se encolaba automáticamente. Se agregó
  `list_recent()` como delegado público.
- **`daemon-rs/crates/indra-daemon/src/grpc.rs`**: `pull()` dejó de ser un stub. Ahora lee
  `SyncEngine::list_recent()` y devuelve `SyncEvent` reales con `FileMetadata.chunks[0]` portando
  el hash BLAKE3 de archivo completo. `push()`/`subscribe()` **siguen siendo stubs** — ver
  "Lo que NO quedó cerrado" abajo.
- **`daemon-rs/crates/indra-daemon/src/main.rs`**: el watcher de archivos ahora llama
  `process_file` (hashea y persiste de verdad) en vez de `sync_file` (que solo encolaba sin
  procesar nunca). El servidor gRPC recibe el `Arc<SyncEngine<..>>` real.
- **`src/lib/daemon-client.ts`** (nuevo): cliente gRPC en Node/Next.js contra
  `127.0.0.1:50051`, con `isDaemonReachable()`, `daemonHeartbeat()`, `daemonPullFiles()`.
- **`src/app/api/desktop/bridge/route.ts`**: ya no devuelve `capability:'none'` fijo — hace un
  heartbeat gRPC real contra el daemon. Puerto corregido a 50051 (antes documentaba 9876, que
  nunca coincidió con el daemon real).
- **`src/app/api/desktop/files/route.ts`** (nuevo): el endpoint REST que pide el test original —
  pulls del daemon y devuelve los archivos ordenados por `modifiedAtMs` descendente, con
  `blake3Hex` por archivo.
- `@grpc/grpc-js` y `@grpc/proto-loader` añadidos como dependencias directas de `package.json`
  (estaban resueltas de forma transitiva por otro paquete, sin declarar — frágil).

### Bugs reales encontrados por el test de uso real (no por lectura de código)

Correr el test contra un archivo real de 89 bytes hizo panic al daemon en el primer intento.
Seguir la doctrina de este mismo plan (correr `cargo test`, no solo `cargo build`) destapó tres
más. Los cuatro eran reales, no hipotéticos:

1. **`fastcdc.rs`**: `while chunk_start < data.len()` no protegía el índice real leído
   (`data[chunk_start + chunk_len]`). Cualquier archivo más chico que `min_chunk_size` (16KB —
   es decir, la mayoría de archivos de texto/config reales) hacía panic por index-out-of-bounds.
   Corregido a `while chunk_start + chunk_len < data.len()`.
2. **`engine.rs::process_file`**: escribía en `chunks`/`hash_references` (FK sobre
   `sync_entries.path`) antes de insertar la fila padre en `sync_entries` — fallaba con
   `FOREIGN KEY constraint failed` en cualquier archivo nuevo. Reordenado: `upsert_file` primero.
3. **`engine.rs` test `test_sync_file`**: comparaba `SyncState` contra un `SystemTime` esperado
   (error de tipos, no compilaba). Corregido a `matches!`.
4. **`engine.rs` test `test_sync_engine_creation`**: usaba `mem::discriminant` sobre un
   `Arc<SyncDb>` (no es un enum, lint `deny`-by-default). Reemplazado por una aserción real
   (`list_pending()` vacío en un engine recién creado).

Los 4 tests de `cache.rs` que dependían de la fila padre (`test_chunk_storage`,
`test_dedup_lookup`, `test_version_vector`) fallaban por el mismo problema de FK que #2 — se les
agregó un `upsert_file` previo. **`cargo test -p indra-core --release`: 33/33 en verde.**

### Verificación real ejecutada (no simulada)

```
1. cargo build -p indra-daemon --release         → indra-daemon.exe reconstruido
2. Se detiene el daemon anterior, se limpia daemon-rs/data (esquema cambió)
3. Se arranca el daemon nuevo → gRPC LISTENING en 127.0.0.1:50051 (confirmado por netstat)
4. Se escribe un archivo de prueba único en "C:\Users\javir\Indra Drive"
   (marcador con timestamp+PID en el nombre, 89 bytes)
5. Hash BLAKE3 de referencia calculado de forma INDEPENDIENTE (herramienta descartable
   fuera del pipeline del daemon, leyendo el archivo directo del disco)
   → df8392980a12654e510d6d3e40def5706a4cfb5f1e46deed9cf85c483e1b8b69
6. npm run dev (Next.js) arranca limpio; GET /api/desktop/bridge y /api/desktop/files
   sin sesión → 401 Unauthorized (confirma que las rutas están cableadas y el guard de auth
   dispara correctamente — mismo patrón que /api/storage/union)
7. Cliente gRPC (mismo código que src/lib/daemon-client.ts) llama Pull() directo contra
   el daemon real → 1 evento, blake3Hex = df8392980a12654e510d6d3e40def5706a4cfb5f1e46deed9cf85c483e1b8b69
   → COINCIDE EXACTO con el hash independiente del paso 5. Sin corrupción.
8. Latencia de Pull() (6 corridas, n insuficiente para percentiles serios):
   35, 32, 31, 35, 38, 32 ms — orden de magnitud razonable para localhost, no una medición
   estadística formal (ver doctrina de este plan, punto 7 — pendiente para cuando haya un
   harness de benchmark dedicado).
```

**Esto prueba, con evidencia y no por inspección de código**: local (file watcher) → hash
BLAKE3 real → SQLite → gRPC Pull real → cliente Node real, sin corrupción, en el mismo camino
de código que usará la ruta REST. Es el primer punto de esta iniciativa donde "el archivo que
se clonó localmente" es verificable por fuera del propio daemon.

### Lo que NO quedó cerrado (para no reportar más de lo verificado)

- **El round-trip HTTP+sesión real no se ejecutó.** `/api/desktop/files` exige sesión de
  NextAuth (Google OAuth contra Postgres real). No se simuló ni se hizo bypass de login —
  hacerlo habría requerido una cuenta de Google real o falsificar una cookie de sesión, ninguna
  de las dos aceptable para una verificación automatizada. Lo verificado es: (a) la ruta
  responde 401 correctamente sin sesión, y (b) el mismo cliente gRPC que usa la ruta funciona
  contra el daemon real. Falta cerrar el tramo con una sesión real de Javier.
- **`push()` y `subscribe()` siguen siendo stubs.** El sentido inverso del test pedido
  ("empezar en la nube, verificar que llega a local") sigue sin camino de código. No hay a dónde
  "empujar" un evento que el daemon vaya a materializar como archivo local.
- **Sigue siendo de una sola máquina.** `127.0.0.1:50051` solo funciona si Next.js y el daemon
  corren en el mismo equipo — el problema de NAT/relay para nube hospedada de verdad sigue sin
  tocarse (ver Fase 1 original de este documento).
- **`CfRegisterSyncRoot` sigue sin invocarse** (root.rs) — el archivo de prueba llegó por
  detección de `notify`, no por el mecanismo real de Cloud Filters API.

## Decisión de arquitectura (2026-08-07): sin bucket propio de Indra

Javier corrigió el rumbo antes de que se escribiera código de Fase 2: el destino de los bytes
**no puede ser un storage operado por Indra**. Viola la Ley 3 del North Star (`00_NORTH_STAR.md`
§1): *"Indra se mantiene gratuito y open source porque no aloja datos de nadie."* El daemon local
tampoco debe tener nunca credenciales de storage en texto plano (riesgo de seguridad nuevo e
innecesario).

**Diseño correcto** (confirmado leyendo el contrato real, no supuesto):

- El destino de "sync local" es **la integración que el propio usuario ya conectó** (su Drive, su
  R2, su OneDrive — con sus propias credenciales), reusando el contrato `IntegrationAdapter` de
  `src/core/types/integration.ts` (plan 11, `AUDITADO`) tal cual está.
- La subida real ya existe como patrón: `createResumableSession(targetId, fileName, mimeType,
  totalSize)` (confirmado en `src/integrations/s3/adapter.ts:218-243`) devuelve una URL
  pre-firmada; el llamador hace `PUT` directo de los bytes a esa URL. Es el mismo mecanismo que ya
  usa el portal de subida (`src/app/api/p/[slug]/upload/route.ts`) — no hay que inventar nada.
- `createResumableSession` es **opcional** en el contrato (`?` en la interfaz) — no todos los
  adapters lo implementan. Solo los que sí pueden ofrecerse como "drive de sync local".
- El daemon (Rust) queda ciego a credenciales: solo reporta vía gRPC `Pull()` qué archivos tiene y
  su hash (ya construido, Fase 1). Next.js es quien lee los bytes del disco local (mismo equipo,
  path que ya devuelve `Pull()`) y los sube a través del adapter elegido.
- El diseño original del plan 23 (`23_PLAN_multi-device-sync.md`: mDNS + pairing HMAC + *"sin
  depender de un servidor central externo"*) queda **superado, no vigente**: contradice
  directamente el goal declarado ("replicar Google Drive Desktop" = modelo hub-and-spoke contra
  un backend central, no P2P en LAN). El "hub" en este diseño es la integración soberana del
  usuario, no un servidor de Indra ni pairing entre dispositivos.

## Fase 2 — Camino de subida real (local → integración elegida por el usuario) (**CÓDIGO EJECUTADO** — 2026-08-07, verificación real pendiente)

Ejecutado por un subagente Haiku delegado (ver doctrina §2), supervisado y auditado por el
Orquestador antes de commitear. `docs/plans/00_NORTH_STAR.md` fila 24 sigue en `EN_EJECUCION`.

**Bug real encontrado en la auditoría, corregido antes del commit**: la primera migración que
generó el subagente declaraba `local_sync_state` con dos primary keys a la vez (`id` a nivel de
columna + `PRIMARY KEY(user_id, local_path)` a nivel de tabla) — DDL de Postgres inválido, habría
fallado en una base de datos real. Su propia migración de seguimiento solo borraba la constraint
rota, sin agregar ninguna forma real de unicidad — quedaba el upsert de la app (`check` +
`insert`/`update`) sin respaldo a nivel de DB, vulnerable a condición de carrera. Corregido: la
tabla ahora tiene `UNIQUE(user_id, local_path)` real vía `unique()` de Drizzle, y las dos
migraciones rotas se borraron y se regeneró una sola limpia
(`drizzle/0001_clear_elektra.sql`) — ninguna de las dos versiones llegó nunca a aplicarse contra
una base de datos real.

El resto del código (las dos rutas, el manejo de tipos, el patrón de auth, el manejo de errores
por archivo sin abortar el batch completo) pasó la auditoría sin cambios — calidad sólida para
una ejecución delegada.

**Migración aplicada** (2026-08-07, autorizado por Javier): `npx drizzle-kit migrate` salió con
exit 0 pero **no aplicó nada realmente** — `drizzle.__drizzle_migrations` quedó vacío y las tablas
no existían (verificado con una query directa antes de confiar en el exit code de la CLI). Causa
probable: esta base ya tenía su schema original creado por `drizzle-kit push` en algún momento, no
por `migrate`, así que no había journal previo con el que reconciliarse — pendiente de investigar
si hace falta, no bloqueante ahora. Se aplicó el SQL de `drizzle/0001_clear_elektra.sql`
directamente (mismo contenido, ejecutado statement por statement) y se verificó independientemente
contra la base real: `local_sync_settings` y `local_sync_state` existen, y `local_sync_state`
tiene exactamente una PK, un FK y el `UNIQUE(user_id, local_path)` — sin duplicados ni conflictos.
`GET`/`PATCH`/`POST` en las rutas nuevas responden 401 sin sesión (routing confirmado, mismo
patrón que Fase 1).

**Pendiente, explícito**: subir un archivo real contra un provider conectado de verdad, con sesión
real de Javier — la sección `### Verificación` de esta fase todavía no se ejecutó de punta a
punta. Eso converge con la Fase 3.

### Corrección de esquema (verificado leyendo el código, no supuesto)

El diseño original de esta sección asumía un `integrationId: uuid` como FK. Es incorrecto para
este repo:

- La identidad de un adapter conectado es su **string de tipo** (`s3`, `mega`, `google-drive`),
  no un UUID de conexión — confirmado en `src/integrations/s3/adapter.ts:99`
  (`readonly id = 's3'`, hardcoded) y en cómo `/api/storage/union` filtra
  (`upstreams.filter(u => u.id === provider)`, `route.ts:36`). El sistema asume como mucho una
  conexión activa por tipo de proveedor por usuario.
- `createResumableSession` (el mecanismo de subida real) **ya está implementado en 3 adapters**,
  no solo S3 — confirmado por grep: `src/integrations/{s3,mega,google-drive}/adapter.ts` y
  `storage-union/index.ts`. OneDrive NO lo implementa todavía — excluirlo de las opciones de
  "drive de sync local" hasta que alguien lo agregue.
- Los storages conectados viven repartidos en **dos tablas**: `integrations` (Notion, Drive,
  Sheets) y `storage_connections` (Mega, y en general lo agregado como "storage dedicado" —
  `src/core/db/schema.ts:173`). `getActiveUpstreams()` (`storage-union/helpers.ts:57`) ya las
  unifica — no reinventar esa unificación.

### Operaciones (corregidas)

1. **Agregar tabla `local_sync_settings`** a `src/core/db/schema.ts` (junto a `users`, línea
   ~102) + migración Drizzle — una fila por usuario, nunca toca la tabla `user` manejada por el
   adapter de NextAuth:
   ```ts
   export const localSyncSettings = pgTable("local_sync_settings", {
     userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
     provider: text("provider"), // 'id' del adapter elegido como target, ej. 's3' — nullable = sin target
     updatedAt: timestamp("updated_at").defaultNow().notNull(),
   });
   ```
2. **Agregar tabla `local_sync_state`** (registro de "qué ya subí", para no re-subir en cada
   `Pull()`), sin FK a `integrations` (el target puede vivir en cualquiera de las dos tablas):
   ```ts
   export const localSyncState = pgTable("local_sync_state", {
     id: uuid("id").primaryKey().defaultRandom(),
     userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
     provider: text("provider").notNull(), // mismo 'id' de adapter que local_sync_settings.provider
     localPath: text("local_path").notNull(),
     blake3Hash: text("blake3_hash").notNull(),
     remoteObjectId: text("remote_object_id"),
     syncedAt: timestamp("synced_at").defaultNow().notNull(),
   });
   ```
   Único por `(userId, localPath)`.
3. **Endpoint para fijar el target**: `PATCH /api/desktop/sync-target` — body `{ provider: string
   | null }`, valida contra la lista de providers que soporten `createResumableSession` (hoy:
   `s3`, `mega`, `google-drive`), upsert en `local_sync_settings`.
4. **Endpoint de subida**: nuevo `src/app/api/desktop/sync/route.ts` (POST). Llama
   `daemonPullFiles()`, resuelve el adapter target vía `getActiveUpstreams()` filtrando por
   `local_sync_settings.provider`, diffea por `blake3Hash` contra `local_sync_state`. Para cada
   archivo nuevo/cambiado: lee bytes locales (`fs.readFile` sobre el `path` que ya devuelve
   `Pull()` — mismo equipo, ver limitación de alcance en Fase 4), pide `createResumableSession`
   al adapter, hace `PUT` de los bytes al `resumableUri`, upsert en `local_sync_state`.

### Verificación

```
1. PATCH /api/desktop/sync-target con un provider real conectado (ej. tu propio R2/S3 de prueba).
2. POST /api/desktop/sync → sube el archivo de prueba de Fase 1.
3. GET /api/storage/union?provider=<ese mismo provider> (la nube REAL, ya auditada) debe listar
   ese archivo — mismo nombre, mismo tamaño.
4. Descargar el objeto subido y comparar su BLAKE3 contra local_sync_state.blake3Hash
   → deben coincidir exacto (mismo criterio de integridad usado en Fase 1).
```

## Fase 3 — Sesión real ejecutando el round-trip HTTP completo

No es una fase de código — es la verificación que Fase 1 dejó pendiente por diseño (no se debía
simular login). Cuando Javier esté disponible:

1. Javier inicia sesión real (Google OAuth) en `http://localhost:3000`.
2. Con esa sesión de navegador, `GET /api/desktop/bridge` y `GET /api/desktop/files` deben
   responder 200 (no 401) y devolver datos reales del daemon.
3. Yo (Orquestador) reviso la respuesta contra lo ya verificado por gRPC directo en Fase 1 —
   deben coincidir.

## Fase 4 — Camino inverso: integración → local

Con `local_sync_state` de Fase 2 ya existente, la ruta más simple **dentro del alcance actual de
una sola máquina** no requiere terminar `push()`/`subscribe()` en el daemon (evita reinventar
transporte de bytes por gRPC): Next.js compara el listado del adapter target
(`/api/storage/union`) contra `local_sync_state`; para objetos remotos ausentes localmente, baja
los bytes con `adapter.downloadBlob()` y los escribe directo en la carpeta "Indra Drive" (mismo
equipo). El file watcher del daemon — ya construido y verificado en Fase 0/1 — los detecta,
hashea y persiste solo, sin código nuevo de ese lado.

**Nota de alcance**: esto solo funciona porque Next.js y el daemon corren en el mismo equipo hoy.
El caso real multi-dispositivo (dos máquinas físicas distintas) sigue bloqueado por el problema de
NAT/relay ya señalado en Fase 1 — no se resuelve en esta fase.

## Fase 5 — Test E2E completo, bidireccional, automatizado

Script repetible (no verificación manual ad hoc como en Fase 1) que encadena Fases 2-4 y mide,
por corrida: tiempo local→nube, tiempo nube→local, resultado de comparación BLAKE3 en ambos
sentidos. Ejecutar n≥10 veces antes de reportar cualquier percentil de tiempo (doctrina de este
plan, punto 7). Vive en `scripts/` (ruta exacta a definir cuando se escriba, no antes).

---

## Prohibiciones

- No marcar `CfRegisterSyncRoot` ni el `SyncService` gRPC como "implementado" mientras sigan
  siendo stubs — cualquier reporte de avance debe decir explícitamente qué quedó simulado.
- No commitear ni pushear los cambios pendientes de `daemon-rs` sin autorización explícita de
  Javier (pregunta abierta, ver Fase 0).
- No ejecutar el test contra una base de datos BYODB real de un usuario — usar cuenta/DB
  desechable dedicada a pruebas.
- No declarar tiempos/latencias de red a partir de una sola corrida.

## Verificación (de este plan como documento)

```powershell
Test-Path "docs/plans/24_PLAN_verificacion-e2e-storage.md"   # debe ser True
Test-Path "daemon-rs/target/release/indra-daemon.exe"         # debe ser True (evidencia Fase 0)
Test-Path "daemon-rs/Indra_Desktop_Setup.exe"                  # debe ser True (evidencia Fase 0)
```

Criterio de éxito de este documento: cualquier agente frío que lo lea puede identificar sin
ambigüedad (a) qué está probado de verdad hoy, (b) qué falta para el test E2E pedido, y (c) qué
decisión de producto está bloqueando el siguiente paso — sin tener que releer la conversación
original.

## Commit

Pendiente de la decisión de Javier sobre los cambios de la sesión anterior (Fase 0). Este
archivo de plan en sí (`docs/plans/24_PLAN_verificacion-e2e-storage.md`) es nuevo y no toca
código — se puede commitear independientemente si Javier lo pide.
