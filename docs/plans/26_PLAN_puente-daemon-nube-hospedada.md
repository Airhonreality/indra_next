---
plan: 26_PLAN_puente-daemon-nube-hospedada
estado: LISTO
ejecutor: orquestador diseña → codex/haiku ejecutan fases
depende_de: [24]
---

# 26 — Puente Daemon ↔ Nube Hospedada (conexión saliente, no entrante)

## Contexto

Durante la verificación de Fase 3 de `24_PLAN_verificacion-e2e-storage.md` se intentó probar el
login real contra Vercel y quedó expuesto un límite arquitectónico que ya se venía señalando desde
Fase 1 de ese plan, pero sin haberlo enfrentado en la práctica: **todo lo construido hasta ahora
asume que Next.js y el daemon corren en la misma máquina** (`127.0.0.1:50051`). Un despliegue
hospedado (Vercel) corre en infraestructura de Vercel, no en la PC del usuario — no puede
"entrar" a la red doméstica del usuario para llamar al daemon. Esto es NAT, no es un bug, y es el
mismo problema que resuelve todo cliente de sync real (Google Drive Desktop, Dropbox, OneDrive).

**Esta es la pieza que falta para que exista "el producto final de Indra"** tal como lo definió
Javier: sincronización multidispositivo de alta confiabilidad, estilo Google Drive Desktop. Todo
lo hecho en plan 24 (daemon funcional, hash BLAKE3, subida a storage propio del usuario) es
condición necesaria pero no suficiente — sin este puente, Indra hospedado nunca se entera de lo
que pasa en la máquina del usuario.

## Cómo lo resuelven los productos reales (y por qué elegimos ese patrón)

El daemon local **inicia la conexión hacia la nube**, nunca al revés. La nube nunca intenta
contactar al daemon directamente. Dos formas de implementarlo:

- **(A) Conexión persistente** (WebSocket / gRPC streaming bidireccional) — baja latencia, pero
  Vercel es serverless: sus funciones no sostienen conexiones abiertas indefinidamente (hay
  límite de duración de ejecución), así que esto requeriría infraestructura adicional (un servicio
  aparte, no Vercel Functions) solo para sostener las conexiones.
- **(B) Polling periódico por HTTPS simple** — el daemon llama a la nube cada N segundos
  (`reqwest` en Rust), reporta su estado, y recibe cualquier comando pendiente en la misma
  respuesta. Mayor latencia (segundos, no milisegundos) pero **corre nativamente sobre Vercel
  Functions sin infraestructura nueva**, y es lo que ya usamos en todo el resto del proyecto.

**Elegido: (B).** Segundos de latencia es aceptable para sync de archivos (no es chat en tiempo
real), y evita meter un componente de infraestructura nuevo (servidor de WebSockets aparte) antes
de tener siquiera una versión mínima funcionando. Si más adelante la latencia es un problema real
medido, se reconsidera — no antes.

## Diseño

### Identidad del daemon: pairing, no la sesión de Google del usuario

El daemon corre sin navegador, sin poder hacer el flujo de OAuth de Google. Necesita su propia
credencial de larga duración:

1. El usuario, logueado en la web, genera un **código de pairing** (endpoint nuevo, ver
   Operaciones) — de un solo uso, expira a los N minutos.
2. El instalador (o el propio daemon en su primer arranque) pide ese código por consola/UI y lo
   canjea contra la nube por un **device token** de larga duración.
3. El device token se guarda localmente (mismo lugar que ya usa el daemon para su config —
   `indra-core::types::DaemonConfig` — no un archivo nuevo suelto) y viaja como `Authorization:
   Bearer <token>` en cada llamada saliente del daemon a la nube.
4. La nube nunca ve la contraseña ni el token de Google del usuario — el device token es una
   credencial distinta, revocable independientemente (desconectar un dispositivo no cierra la
   sesión web del usuario, y viceversa).

### Tablas nuevas (Postgres, BYODB del usuario — mismo criterio de Fase 2, nada vive en infra de Indra)

```ts
export const devices = pgTable("devices", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  deviceName: text("device_name").notNull(), // hostname reportado por el daemon
  tokenHash: text("token_hash").notNull(), // hash del device token, nunca el token en claro
  lastSeenAt: timestamp("last_seen_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const devicePairingCodes = pgTable("device_pairing_codes", {
  code: text("code").primaryKey(), // corto, de un solo uso
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at").notNull(),
  consumedAt: timestamp("consumed_at"),
});

export const syncCommands = pgTable("sync_commands", {
  id: uuid("id").primaryKey().defaultRandom(),
  deviceId: uuid("device_id").notNull().references(() => devices.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // ej. 'download_file' — un solo tipo por ahora, no diseñar de más
  payload: jsonb("payload").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  consumedAt: timestamp("consumed_at"),
});
```

`tokenHash`, nunca el token en claro — mismo principio que ya usa el proyecto para credenciales de
Mega (`encryptedCredentials`) y BLAKE3 hashes en el daemon: nunca guardar secretos reversibles sin
necesidad.

### Endpoints nuevos (Next.js)

- `POST /api/devices/pair/start` — sesión real requerida. Genera un código, lo guarda en
  `device_pairing_codes`, lo devuelve para mostrar en pantalla.
- `POST /api/devices/pair/claim` — sin sesión (lo llama el daemon, no el navegador). Body
  `{ code, deviceName }`. Si el código es válido y no expiró: crea la fila en `devices`, devuelve
  el device token en claro **una sola vez** (no se puede volver a pedir — mismo patrón que un API
  key), marca el código consumido.
- `POST /api/devices/heartbeat` — auth por `Authorization: Bearer <deviceToken>` (no por sesión de
  NextAuth — es un guard nuevo, comparar contra `tokenHash`). Body con el resumen de archivos
  locales (mismo shape que ya devuelve `Pull()`). Actualiza `lastSeenAt`, devuelve comandos
  pendientes de `sync_commands` para ese `deviceId` y los marca consumidos.

### Daemon (Rust)

- `reqwest` **ya está en el workspace** (`daemon-rs/Cargo.toml:48`, versión 0.11, feature
  `stream` nada más) — corregido de lo que decía antes este documento. Falta agregarle los
  features `json` y `rustls-tls` (el proyecto ya usa `rustls` en otros lados, evita depender de
  OpenSSL del sistema en Windows — ya fue un dolor de cabeza real en la Fase 0 de plan 24, no
  reintroducirlo) y agregar `reqwest.workspace = true` a `crates/indra-daemon/Cargo.toml`.
- **Dónde vive el token localmente**: un archivo de texto simple, hermano del SQLite que ya usa
  el daemon — `<carpeta de db_path>/device_token` (con el `db_path` default `./data/indra.db`,
  eso da `./data/device_token`). Sin cifrado en esta fase — el token es revocable del lado
  servidor si se compromete, que es la mitigación aceptada para un MVP; no resolver key
  management acá, sería sobre-ingeniería para esta fase.
- **URL de la nube**: variable de entorno `INDRA_CLOUD_URL`, default
  `https://indra-next.vercel.app` (el proyecto real de Vercel, confirmado con `vercel project
  ls`). Configurable para poder seguir probando contra `localhost:3000` si hace falta más
  adelante.
- **Cómo se empareja el daemon** (no estaba resuelto antes, se resuelve acá): un modo CLI nuevo,
  `indra-daemon.exe --pair <CODIGO>` — un solo uso: lee el código del argumento, hace
  `POST {INDRA_CLOUD_URL}/api/devices/pair/claim` con `{ code, deviceName: <hostname> }`, si sale
  bien escribe el token devuelto en el archivo de arriba, imprime confirmación y termina (exit 0).
  Si falla, imprime el error y termina (exit 1). En este modo NO arranca el resto del daemon
  (nada de gRPC, nada de file watcher) — es una corrida de un solo propósito.
- **Arranque normal** (`indra-daemon.exe` sin argumentos, el modo de siempre): al principio de
  `main()`, revisar si existe el archivo de token. Si existe: leerlo, arrancar
  `cloud_client::start_heartbeat_loop(...)` como una tarea de tokio más (mismo patrón que ya usa
  el spawn del server gRPC en `main.rs`). Si no existe: loguear un aviso claro una sola vez ("no
  emparejado con la nube — correr `indra-daemon.exe --pair <CODIGO>` para habilitar sync") y
  seguir funcionando igual que hoy (gRPC local, file watcher) — degradación elegante, no bloquear
  el uso local por no estar emparejado.
- Nuevo módulo `crates/indra-daemon/src/cloud_client.rs`: cada 20s, llama
  `SyncEngine::list_recent()` (ya existe, mismo dato que expone `Pull()` — no inventar un segundo
  formato), hace `POST {INDRA_CLOUD_URL}/api/devices/heartbeat` con
  `Authorization: Bearer <token>` y `{ deviceName, files: [{ path, sizeBytes, modifiedAtMs,
  blake3Hex }] }`. Loguea los `commands` que vengan en la respuesta — en esta fase no hace falta
  procesarlos todavía (`sync_commands` arranca vacía, sin productores, ver abajo), pero el
  parseo tiene que ser real, no un stub, para que Fase 3 solo tenga que agregar el productor sin
  tocar el consumidor.

### Nueva tabla (agregar en esta fase, no en Fase 1 — ahí no hacía falta todavía)

```ts
export const syncCommands = pgTable("sync_commands", {
  id: uuid("id").primaryKey().defaultRandom(),
  deviceId: uuid("device_id").notNull().references(() => devices.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  payload: jsonb("payload").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  consumedAt: timestamp("consumed_at"),
});
```

### Endpoint nuevo: `POST /api/devices/heartbeat`

- **Sin sesión de NextAuth** — auth por `Authorization: Bearer <deviceToken>`. Hashear el token
  recibido con SHA-256 (mismo algoritmo que `pair/claim`) y buscar en `devices` por
  `tokenHash` — si no hay match, 401.
- Actualiza `lastSeenAt = now()` del dispositivo encontrado.
- Body: acepta `{ deviceName?, files: [...] }` — en esta fase no hace falta persistir `files` en
  ningún lado (eso es trabajo de Fase 3, cuando haya productores reales de `sync_commands`); con
  loguear la cantidad recibida alcanza. No construir de más.
- Consume comandos pendientes con el mismo patrón atómico que ya se usó en `pair/claim` (lección
  de Fase 1, no repetir el bug de condición de carrera): `UPDATE sync_commands SET consumed_at =
  now() WHERE device_id = ? AND consumed_at IS NULL RETURNING *`.
- Devuelve `{ acknowledged: true, commands: [...] }`.

## Fases

### Fase 1 — Pairing y autenticación de dispositivo (**EJECUTADO Y VERIFICADO** — 2026-08-07)

Ejecutado por un subagente Haiku, supervisado y auditado por el Orquestador antes de commitear
(mismo protocolo que Fase 2 de plan 24). Tablas `devices`/`device_pairing_codes`,
`POST /api/devices/pair/start`, `POST /api/devices/pair/claim`, tarjeta `DevicePairingCard` en
`DesktopPanel`. Migración generada y **aplicada** contra la base real
(`drizzle/0002_nappy_blink.sql` — verificado: cada tabla con una sola PK, un FK a `user`, sin
duplicados).

**Dos bugs reales encontrados en la auditoría, corregidos antes del commit:**

1. **Condición de carrera en `pair/claim`.** La primera versión hacía `SELECT` para validar el
   código y recién después `UPDATE` para marcarlo consumido — dos requests con el mismo código
   casi simultáneas podían pasar el chequeo antes de que cualquiera escribiera, generando dos
   dispositivos para un código que debía ser de un solo uso. Corregido a un `UPDATE ... WHERE
   consumed_at IS NULL AND expires_at > now() RETURNING *` atómico (Postgres solo deja que una
   transacción concurrente gane esa carrera), envuelto en `db.transaction()` junto con el
   `INSERT` del dispositivo — si el insert falla, el código no queda quemado sin dispositivo
   creado. **Verificado contra la base real**: primer intento de canje afecta 1 fila, segundo
   intento con el mismo código afecta 0 filas.
2. **Error de lint real (no cosmético) en la UI**: `Date.now()` llamado directo en el cuerpo del
   render viola la regla de pureza de React del linter del proyecto — hubiera bloqueado cualquier
   build estricto. Corregido con `useState(() => Date.now())` (inicializador perezoso, la forma
   sancionada de sembrar un valor impuro una sola vez) + un `setInterval` dentro de un `useEffect`
   que además hace que la cuenta regresiva del código realmente cuente hacia atrás en pantalla
   (antes quedaba congelada en el primer render).

Verificado independientemente: `tsc --noEmit` limpio, `npm run lint` en 241 problemas — exactamente
la misma línea base preexistente, cero nuevos.

**Pendiente, explícito**: el daemon (Rust) todavía no sabe canjear un código — eso es Fase 2. No
se probó el flujo completo con la UI real de un navegador (la tarjeta de pairing no se clickeó de
verdad todavía), solo su lógica de backend contra la base real.

Tablas `devices` + `device_pairing_codes`, los dos endpoints de pairing, UI mínima para mostrar el
código (una pantalla, no hace falta que sea linda). Verificación: un dispositivo simulado (script,
no el daemon real todavía) puede canjear un código por un token y el token queda hasheado en DB,
nunca en claro.

### Fase 2 — Heartbeat saliente real desde el daemon (**EJECUTADO Y VERIFICADO CONTRA PRODUCCIÓN REAL** — 2026-08-08)

Ejecutado por un subagente Haiku, supervisado y auditado por el Orquestador antes de commitear.
`cloud_client.rs`, `POST /api/devices/heartbeat`, tabla `sync_commands` (vacía, sin productores
todavía — correcto para esta fase). Un bug real corregido en la auditoría: el loop de heartbeat
creaba un `reqwest::Client` nuevo en cada tick de 20s en vez de reusarlo — tira el connection
pooling y paga el costo de TLS/DNS en cada heartbeat. Corregido moviendo la construcción del
cliente fuera del loop.

**Este es el primer test real de todo el proyecto que prueba lo que Fase 3 de plan 24 no pudo
probar** — no local, no simulado:

1. Push a `main` → Vercel autodesplegó a producción real (`indra-next.vercel.app`), confirmado
   con `vercel ls` hasta que el build quedó `Ready`.
2. Se generó un código de pairing real en la base de datos real (insertado directo, sin pasar por
   browser porque el login local sigue roto — ver nota de Fase 3 de plan 24 sobre variables
   "Sensitive" de Vercel).
3. Se corrió el binario real, `indra-daemon.exe --pair E2ETEST1`, con `INDRA_CLOUD_URL` apuntando
   a su default (`https://indra-next.vercel.app`, producción real, no localhost) → pairing exitoso
   en ~2.6s, token de 68 caracteres guardado en `daemon-rs/data/device_token`.
4. Se arrancó el daemon normal (sin `--pair`) → log confirma `"Cloud sync enabled - heartbeat loop
   started"`.
5. Se consultó la base de datos real ~20s después: `devices.last_seen_at` pasó de `null` a un
   timestamp real, `device_name = "Airhon"` (hostname real de la máquina de Javier) — el heartbeat
   viajó de verdad desde esta PC hasta Vercel hospedado y se autenticó correctamente por hash del
   token.

El dispositivo emparejado (`Airhon`) queda como un pairing real, no dato de prueba — es
literalmente la primera vez que la máquina de Javier queda enlazada de verdad a su cuenta de Indra
hospedada. El daemon sigue corriendo en background mandando heartbeats cada 20s salvo que se
detenga manualmente.

**Pendiente, explícito**: `sync_commands` sigue vacía — no hay todavía ningún productor de
comandos (eso es Fase 3), así que el heartbeat nunca trae nada que procesar todavía. Eso es
esperado, no un bug.

### Fase 3 — Comando `download_file` y camino inverso real (diseño concreto, listo para delegar)

Lo que hoy Fase 4 de plan 24 resuelve escribiendo directo al filesystem local (porque Next.js y
el daemon comparten máquina) se reemplaza por: Next.js encola un `sync_command` cuando detecta un
archivo nuevo en el provider remoto, el daemon lo recibe en su próximo heartbeat y lo descarga él
mismo. Recién acá el camino inverso funciona de verdad entre dos máquinas distintas.

**Alcance explícito de esta fase**: la detección de "hay un archivo nuevo del lado remoto" queda
**disparada a mano** (un endpoint que el usuario o un script llama), no automática por cron/
Inngest — automatizar el disparo es trabajo futuro, no de esta fase (el proyecto ya usa Inngest
para otros jobs en `src/inngest/functions/`, pero sumar un cron nuevo antes de probar que el
mecanismo de comando→descarga funciona de punta a punta sería construir en el orden equivocado).

**3a. Productor — `POST /api/devices/sync-check`** (nuevo, sesión de NextAuth requerida):
1. Lee `local_sync_settings.provider` del usuario de la sesión. Sin target configurado → 400.
2. Resuelve el adapter real vía `getActiveUpstreams(session.user.id)` filtrando por ese
   `provider` (mismo patrón que ya usa `POST /api/desktop/sync` de plan 24 Fase 2).
3. `adapter.listInventory()` — ya existe en el contrato `IntegrationAdapter`, todos los adapters
   lo implementan.
4. Para cada objeto remoto: ¿ya hay una fila en `local_sync_state` con ese
   `remoteObjectId` para este `userId` + `provider`? Si sí, ya está sincronizado (en cualquier
   sentido), saltar. Si no, es nuevo del lado remoto.
5. Por cada objeto nuevo × cada dispositivo activo del usuario (`devices` donde `userId` matchea
   — un usuario puede tener más de uno emparejado, es multi-dispositivo de verdad): insertar una
   fila en `sync_commands` con `kind: 'download_file'`,
   `payload: { remoteObjectId, fileName }`.
6. Responde `{ enqueued: number, devices: number }`.

**3b. Proxy de descarga — `GET /api/devices/download-object?objectId=<id>`** (nuevo): auth por
`Authorization: Bearer <deviceToken>`, mismo lookup por hash que ya usa `heartbeat`. Resuelve el
adapter del `userId` del dispositivo vía `local_sync_settings.provider` +
`getActiveUpstreams()`, llama `adapter.downloadBlob(objectId)` (ya existe, ya lo usa
`s3/adapter.ts` para el portal de subida — no inventar un segundo mecanismo de descarga), y
transmite el `ReadableStream` de vuelta como body de la respuesta HTTP. El daemon nunca ve
credenciales del adapter — solo pide bytes con su device token, igual que el heartbeat.

**3c. Consumidor — daemon (Rust)**: en `cloud_client.rs`, dentro del loop de heartbeat, por cada
comando recibido con `kind == "download_file"`: `GET {cloud_url}/api/devices/download-object?
objectId=<payload.remoteObjectId>` con el mismo `Authorization: Bearer` que ya usa el heartbeat,
escribir los bytes recibidos en `<Indra Drive>/<payload.fileName>`. **No hace falta tocar el
file watcher ni el hasheo** — ya existen y ya están probados (Fase 0/1 de plan 24): en cuanto el
archivo se escribe, `notify` lo detecta solo y `process_file` lo hashea. Para esto,
`start_heartbeat_loop` necesita que le pasen el path de "Indra Drive" además de lo que ya recibe
(hoy solo recibe `cloud_url, token, engine`).

### Fase 4 — Test E2E real multi-máquina

El test que de verdad hacía falta desde el principio: dos dispositivos físicos distintos (o al
menos dos redes distintas — ej. la PC de Javier + un browser/dispositivo fuera de su LAN),
sincronizando a través de Indra hospedado. Recién ahí se puede decir que el goal ("replicar Google
Drive Desktop") está probado, no solo diseñado.

## Prohibiciones

- No guardar el device token en claro en Postgres — solo su hash.
- No reintroducir un bucket propio de Indra para resolver esto — el problema es de *transporte*
  (cómo se enteran uno del otro), no de *dónde viven los bytes*; Fase 2 de plan 24 sigue vigente
  sin cambios.
- No construir infraestructura de WebSockets/conexión persistente todavía — polling primero,
  medir, después decidir si hace falta más.
- No delegar el diseño de las tablas/endpoints de pairing a un ejecutor — es frontera de
  seguridad (identidad de dispositivo), diseño no delegable. Sí delegable: escribir el código una
  vez el contrato está fijado acá.

## Verificación (de este documento)

```
Test-Path "docs/plans/26_PLAN_puente-daemon-nube-hospedada.md"   # True
```

Criterio de éxito: un agente frío puede ejecutar Fase 1 leyendo solo este archivo + plan 24, sin
la conversación original.

## Commit

Este archivo es documentación pura — no toca código. Commitear junto con el registro en
`00_NORTH_STAR.md`.
