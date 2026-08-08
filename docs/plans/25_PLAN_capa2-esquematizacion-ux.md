---
plan: 25_PLAN_capa2-esquematizacion-ux
estado: BORRADOR
ejecutor: orquestador
depende_de: [11, 24]
---

# 25 — Capa 2 (Esquematización): diseño UX de tags y contextos personalizados

## Contexto

Durante el diseño de Fase 2 de `24_PLAN_verificacion-e2e-storage.md` se explicitó el modelo de
tres capas que hace diferencial a Indra frente a "otro cliente de Drive más":

1. **Capa 1 — Adapters** (`AUDITADO`, plan 11/12): unión agnóstica de storages reales. El usuario
   conecta Google Drive, YouTube (como drive de video), OneDrive, R2/S3, Mega, etc. Es la capa que
   sabe "qué vive técnicamente dónde". Ya existe.
2. **Capa 2 — Esquematización** (esta línea de trabajo, sin empezar): unifica todo en una sola
   interfaz y permite crear semi-buckets de storage y un sistema de etiquetado avanzado para
   organización personal — por temas, etiquetas relacionadas, etc. Es **pura capa informacional/
   cognitiva**: metadata en el Postgres del propio usuario (Ley 2 del North Star — "colecciones
   inter-storage... pura metadata... jamás alteran la estructura de los storages"), nunca
   escritura sobre los storages reales.
3. **Capa 3 — Sync local** (`EN_EJECUCION`, plan 24): el daemon, CFAPI, la experiencia tipo Google
   Drive Desktop.

Esta es la línea de trabajo pendiente para la Capa 2. **No está lista para ejecución delegada** —
es diseño de producto/UX, y por doctrina (`00_NORTH_STAR.md` §2: "diseño no delegable") le
corresponde al Orquestador antes de que exista un plan ejecutable por Codex/Haiku.

## Goal (palabras de Javier, 2026-08-07)

> Diseñar una capa de tags que sea relevante y útil para que el usuario pueda tener control tanto
> de sus storages a nivel técnico (saber exactamente qué vive dónde) y al mismo tiempo usar la
> capa de contextos personalizados de Indra olvidando por completo que la sub-capa de sub-servicios
> existe. Si Indra es bueno, el usuario nunca vuelve a abrir Drive manualmente.

En otras palabras: el diseño debe resolver **dos modos de uso en tensión** con la misma capa de
datos:

- **Modo técnico** (control): "¿qué archivo vive en qué proveedor, con qué proveedor estoy cerca
  de mi cuota, qué pasa si desconecto esta cuenta?" — visibilidad honesta del origen (Capa 1).
- **Modo cognitivo** (olvido deliberado): "quiero mis fotos del viaje, mis facturas de marzo, mis
  ideas para el proyecto X" — sin que el usuario tenga que recordar ni pensar en qué proveedor
  las subió. La capa de tags/contextos personalizados debe ser la interfaz por defecto; el origen
  técnico es información de soporte, no el modelo mental principal.

## Preguntas de diseño abiertas (semillas, no respuestas — para cuando arranque el diseño real)

- ¿Progressive disclosure? — vista por defecto = 100% contextos/tags de Indra, con un toggle
  explícito "ver origen técnico" para el modo control, en vez de dos vistas separadas que hay que
  elegir de entrada.
- ¿Cómo se relacionan tags entre sí? ("etiquetas relacionadas" — mencionado por Javier) ¿Jerarquía,
  grafo, o ambos? Un grafo de tags con similitud/co-ocurrencia puede alimentar sugerencias
  automáticas de clasificación.
- Heterogeneidad de proveedores: algunos adapters solo tienen carpetas (jerarquía rígida), otros
  tienen labels nativos (Gmail-style). ¿La Capa 2 ignora la organización nativa del proveedor por
  completo (todo se re-clasifica en Indra) o la importa como punto de partida?
- Los "semi-buckets" (colecciones inter-storage, ya nombrados en el North Star) — ¿son una vista
  guardada sobre combinaciones de tags, o una entidad de primera clase distinta de los tags
  sueltos? Afecta directamente el modelo de datos.
- Auto-tagging: dado que el North Star ya manda transcodificación + derivados optimizados (Ley 4)
  en cada portal de subida, ¿hay lugar para sugerencia automática de tags en ese mismo paso
  (metadata EXIF, tipo de archivo, contenido), o el etiquetado es 100% manual en esta primera
  iteración?

## Diseño resuelto (2026-08-08) — a partir de la corrección de producto en plan 26

Al auditar la Fase 3 de `26_PLAN_puente-daemon-nube-hospedada.md`, Javier corrigió el modelo de
sync (ver ese documento, sección "Corrección de producto") y de paso resolvió la pregunta abierta
más importante de este plan: **las colecciones no son una vista guardada sobre tags sueltos — son
la pieza que responde "a qué proveedor va un archivo nuevo" cuando el usuario marca una carpeta
local para sincronizar.** Sin esto, la subida automática (Fase de plan 26 deliberadamente sin
tocar) no tiene una respuesta de diseño real, solo una regla default apurada.

**Nota de alcance**: el plan 15 ("Colecciones inter-storage") nunca tuvo archivo propio — solo
existía como fila en la matriz del North Star, sin diseño. Este documento lo absorbe; se actualiza
la matriz para que la fila 15 apunte acá en vez de a un plan fantasma.

### Qué es una colección (entidad de primera clase, no una vista)

Una colección agrupa:
- **Fuentes de lectura** (`collection_sources`): una o más referencias `(provider, remotePath)`
  de solo lectura — de dónde vienen los archivos que se ven agregados en esa colección. Puede
  combinar proveedores distintos (ej. "Fotos del viaje" = carpeta de Drive + carpeta de S3).
- **Destino de escritura** (opcional, un único `(provider, remotePath)` en la propia colección):
  a dónde van los archivos nuevos. Una colección sin destino es de solo agregación/lectura —
  nunca recibe uploads. Se elige **una vez, al crear la colección o al vincularla a una carpeta
  local**, nunca por archivo — coincide con "no hay botón de sincronizar, las acciones solo
  pasan".
- Pura metadata en el Postgres del usuario — jamás reescribe ni reorganiza lo que ya vive en cada
  storage real (Ley 2 del North Star, sin cambios).

### Cómo resuelve el problema de subida (plan 26, Fase 3, sección "Subida... queda sin tocar")

El usuario marca una carpeta local (`local_folder_mappings`) como vinculada a una colección
existente. Esa colección ya tiene su destino de escritura definido. A partir de ahí, todo archivo
nuevo en esa carpeta sube solo al destino de la colección — sin selector de proveedor, sin
confirmación por archivo. Esto reemplaza el rol que hoy cumple (mal) `local_sync_settings` como
único target global.

### Cómo resuelve la vista "sub-buckets vs. proveedor literal"

No hace falta un componente nuevo desde cero: `StorageWidgetClient.tsx` ya tiene un selector tipo
tabs entre "Union Unificada" y "por proveedor" (`activeSilo`, confirmado por auditoría de UI del
2026-08-08). Las colecciones se suman como un **tercer tipo de silo** navegable ahí mismo —
mismo patrón de columnas Miller que ya existe (`AgnosticTree`), sin rediseñar el explorador.

### Modelo de datos (propuesta, todavía sin Operaciones — ver preguntas abiertas)

```ts
export const collections = pgTable("collections", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  writeProvider: text("write_provider"),       // null = colección solo-lectura/agregación
  writeRemotePath: text("write_remote_path"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const collectionSources = pgTable("collection_sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  collectionId: uuid("collection_id").notNull().references(() => collections.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  remotePath: text("remote_path").notNull(),
});

export const localFolderMappings = pgTable("local_folder_mappings", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  deviceId: uuid("device_id").notNull().references(() => devices.id, { onDelete: "cascade" }),
  localPath: text("local_path").notNull(),
  collectionId: uuid("collection_id").notNull().references(() => collections.id, { onDelete: "cascade" }),
});
```

**Alcance explícito**: en esta primera iteración, las colecciones resuelven la subida (local →
nube). **No** filtran ni acotan la descarga (nube → local) — `sync-check` de plan 26 sigue
revisando todos los proveedores conectados sin excepción, tal como quedó corregido. Acotar qué se
descarga por colección es una extensión futura, no parte de este alcance.

## Preguntas reales que quedan abiertas (necesitan decisión de Javier, no las resuelvo sola)

1. **¿Un `local_folder_mappings` es por dispositivo o por cuenta?** Si Javier tiene dos máquinas
   emparejadas, ¿una carpeta local marcada en la Máquina A implica que la Máquina B también debe
   mantener una copia local de esa colección, o cada dispositivo elige sus propias carpetas de
   forma independiente? Afecta si `deviceId` en la tabla de arriba es correcto o si el mapeo
   debería vivir a nivel de colección (todo dispositivo que la vincula, sincroniza).
2. **¿Tags sueltos siguen siendo una capa aparte, o colecciones alcanzan por ahora?** El goal
   original mencionaba etiquetas relacionadas/grafo de tags además de colecciones. Sugerencia:
   colecciones primero (resuelven un problema real y bloqueante), tags como iteración futura — pero
   es una decisión de roadmap de producto, no técnica.
3. **¿Colección sin destino de escritura es un tipo de primera clase desde el día uno, o se fuerza
   a elegir un proveedor al crearla?** Permitir "solo agregación" es más flexible pero es una
   decisión extra en el flujo de creación.

**Estado**: diseño core resuelto, sin Operaciones/Verificación todavía — depende de las 3
respuestas de arriba antes de convertirse en un plan ejecutable por Codex/Haiku.
