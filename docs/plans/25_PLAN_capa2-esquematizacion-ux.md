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

## Estado

**BORRADOR — sin Operaciones ni Verificación todavía.** No delegar a ningún ejecutor hasta que el
Orquestador convierta esto en un plan con wireframes/flujos concretos y, recién ahí, un contrato
de datos (Zod) para tags/colecciones. Verificado (`grep -rn "collections|Collection" src`, sin
resultados relevantes): el plan 15 ("Colecciones inter-storage") sigue `PENDIENTE` — no hay
implementación previa que este diseño deba respetar o evitar duplicar. Sí conviene coordinar con
quien retome el plan 15, porque "colecciones" y "tags/contextos personalizados" son
probablemente la misma pieza de producto vista desde dos planes distintos.
