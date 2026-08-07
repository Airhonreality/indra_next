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

## Fase 1 — Cerrar el mismatch de puerto y decidir la arquitectura del puente (BORRADOR — bloqueada por decisión de producto)

**Decisión requerida antes de escribir código** (afecta el resto de las fases): cómo habla la
app Next.js con el daemon, y qué cuenta como "storage" para el test.

Opciones evaluadas (sin ejecutar aún, ver pregunta a Javier en la conversación):

- **(A) Endpoint HTTP ligero en el daemon** (ej. `axum`/`warp` sirviendo `/health`, `/files` en
  el mismo proceso). Next.js hace `fetch('http://127.0.0.1:50051/...')` directo desde el route
  handler. Menor superficie nueva, reutiliza el servidor que ya corre.
- **(B) Cliente gRPC real en Next.js** tal como lo esbozó `23_PLAN_multi-device-sync.md`
  (`@grpc/grpc-js` + `sync.proto`). Más fiel al diseño original multi-dispositivo, más trabajo.
- **(C) El daemon empuja los archivos al adaptador S3/R2 ya auditado** (plan 12/12B,
  `EJECUTADO`/`AUDITADO`) en vez de inventar un backend nube nuevo; `/api/storage/union` ya sabe
  listarlos. El daemon deja de ser la fuente de verdad del listado — solo hidrata/escribe local.

## Fase 2 — Camino de subida real: local → storage
## Fase 3 — Listado en API REST con marcador único de test + orden verificable por fecha
## Fase 4 — Camino inverso: nube → local
## Fase 5 — Test E2E real de uso (el pedido original), automatizado y repetible

Las Fases 2-5 se detallan (Operaciones + Verificación mecánica concretas) una vez cerrada la
decisión de arquitectura de la Fase 1 — especificarlas antes sería documentar código que
todavía puede cambiar de forma, violando la doctrina de este mismo plan (criterio de éxito
explícito, no aspiracional).

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
