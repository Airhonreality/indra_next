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

- Agregar `reqwest` (con soporte TLS) a `crates/indra-daemon/Cargo.toml` — no está en el
  workspace hoy.
- Nuevo módulo `crates/indra-daemon/src/cloud_client.rs`: guarda/lee el device token localmente,
  hace `POST /api/devices/heartbeat` cada 15-30s con el resultado de `SyncEngine::list_recent()`
  (mismo dato que ya expone `Pull()` — no inventar un segundo formato), procesa los comandos que
  vengan en la respuesta.
- Primer comando soportado: `download_file` — mínimo indispensable para que el camino inverso de
  Fase 4 de plan 24 dejara de depender de que Next.js y el daemon compartan filesystem.

## Fases

### Fase 1 — Pairing y autenticación de dispositivo (sin esto, nada más tiene sentido)

Tablas `devices` + `device_pairing_codes`, los dos endpoints de pairing, UI mínima para mostrar el
código (una pantalla, no hace falta que sea linda). Verificación: un dispositivo simulado (script,
no el daemon real todavía) puede canjear un código por un token y el token queda hasheado en DB,
nunca en claro.

### Fase 2 — Heartbeat saliente real desde el daemon

`cloud_client.rs`, el endpoint `/api/devices/heartbeat`, tabla `sync_commands` (vacía por ahora,
sin productores todavía). Verificación: con el daemon corriendo en la máquina de Javier y la app
en Vercel de verdad (no local) — este es el primer test real que SÍ prueba lo que Fase 3 de plan
24 no pudo probar — el `lastSeenAt` del dispositivo se actualiza solo, sin túneles ni localhost.

### Fase 3 — Comando `download_file` y camino inverso real

Lo que hoy Fase 4 de plan 24 resuelve escribiendo directo al filesystem local (porque Next.js y
el daemon comparten máquina) se reemplaza por: Next.js encola un `sync_command` cuando detecta un
archivo nuevo en el provider remoto, el daemon lo recibe en su próximo heartbeat y lo descarga él
mismo. Recién acá el camino inverso funciona de verdad entre dos máquinas distintas.

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
