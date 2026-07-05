# 🌌 00 — NORTH STAR: Indra Next Sovereign

**Estado**: VIVO (este documento se actualiza, nunca se archiva)
**Dueño**: Orquestador Maestro (modelo pesado) + Javier (decisiones de producto)

---

## 1. El Goal (inmutable salvo decisión humana)

Indra Next es un **motor integral de integraciones y widgets de capacidades compuestas**.
La iniciativa actual: **consolidar al 100% el Widget de Storage Soberano**, definido por
cuatro leyes de producto:

1. **Unión agnóstica de storages**: el usuario conecta cualquier proveedor (Google Drive,
   Mega, R2/Cloudflare, OneDrive, y publish-targets como YouTube) y los administra desde
   un panel único: navegar, mover, renombrar en bloque, previsualizar.
2. **Colecciones inter-storage**: cajas virtuales que agrupan carpetas/espacios de uno o
   más drives por proyecto. Son **pura metadata** en la DB del usuario; jamás alteran la
   estructura de los storages.
3. **Soberanía BYODB**: cada usuario pega el link de su propio Postgres (Neon/Supabase)
   en el onboarding; Indra bootstrapea y versiona su esquema ahí. Indra se mantiene
   gratuito y open source porque no aloja datos de nadie.
4. **Transcodificación como ley**: todo archivo que pasa por un portal de subida genera
   siempre su derivado optimizado (miniatura grande + versión ultraliviana para filtrado
   rápido). La política sobre el original (conservar/reemplazar) es configurable por
   portal — el derivado no es opcional.

## 2. Doctrina del Arnés (cómo se trabaja en este repo)

Basado en `docs/research/INS_Arnes agentico.md`:

- **Planes = artefactos de primera clase**: todo trabajo nace como un plan versionado en
  `docs/plans/`, con estado explícito en frontmatter. No hay tareas "de palabra".
- **Ejecución delegable, diseño no delegable**: el ejecutor delegado (**Codex**, cuota
  free de Javier — protocolo en `10_PLAN_orquestacion-maestra.md`) ejecuta planes con
  rutas y criterios exactos. Los contratos, esquemas Zod, diseño de DB y decisiones de
  arquitectura los produce el Orquestador Maestro (Claude).
- **Verificación mecánica antes que auditoría**: cada plan define su sección
  `## Verificación` con comandos ejecutables. Un plan sin verificación mecánica no es
  delegable. La auditoría del Orquestador es la *última* compuerta, no la única.
- **Autocontención (reinicio de contexto)**: cada plan debe ser ejecutable por un agente
  frío sin acceso a ninguna conversación previa. Si el plan necesita contexto, el
  contexto va escrito dentro del plan.
- **Contratos rígidos en las fronteras**: toda frontera entre subsistemas (adaptadores de
  storage, API routes, protocolo embed) se valida con esquemas Zod.

### Ciclo de vida de un plan

```
BORRADOR → LISTO → EN_EJECUCION → EJECUTADO → AUDITADO ✅
                                      ↓
                                  RECHAZADO (vuelve a LISTO con notas del auditor)
```

### Formato obligatorio de plan

```markdown
---
plan: NN_PLAN_slug
estado: BORRADOR | LISTO | EN_EJECUCION | EJECUTADO | AUDITADO | RECHAZADO
ejecutor: codex | orquestador
depende_de: [NN, NN]
---
## Contexto        ← todo lo que un agente frío necesita saber
## Operaciones     ← pasos exactos, rutas absolutas dentro del repo
## Prohibiciones   ← qué NO tocar
## Verificación    ← comandos mecánicos de aceptación
## Commit          ← mensaje y archivos exactos a incluir
```

## 3. Matriz de Pipelines Agéncica

| # | Plan | Ejecutor | Compuerta de verificación | Estado |
|---|------|----------|---------------------------|--------|
| 01 | Reorganización del repo + índice de subsistemas | liviano | git status limpio de entropía, índice existe, cero referencias rotas | AUDITADO ✅ |
| 10 | Plan de Orquestación Maestra (protocolo Codex) | orquestador | n/a (es diseño) | AUDITADO ✅ |
| 11 | Contrato `StorageAdapter` + manifiesto de capacidades + Zod | orquestador diseña → codex ejecuta | suite de contrato en verde | AUDITADO ✅ |
| 12 | Adaptador S3/R2 real + ops de gestión (delete/rename/move) en el contrato | orquestador diseña → codex ejecuta | suite de contrato incluyendo `s3` | LISTO |
| 12B | Ops de gestión en Drive/Mega/OneDrive + wiring de rutas para `s3` | codex (por proveedor) | suite de contrato por proveedor | PENDIENTE |
| 13 | Diagnóstico y reparación del transcoder (prerrequisito de portales) | orquestador diagnostica → codex ejecuta | archivo de prueba sale optimizado, peso menor al origen | PENDIENTE |
| 14 | BYODB: onboarding "pega tu link" + bootstrap y versionado de esquema | orquestador diseña esquema → codex implementa UI | migración corre en DB Neon virgen | PENDIENTE |
| 15 | Colecciones inter-storage (metadata-only) | codex sobre spec del orquestador | CRUD de colecciones sin escrituras en storages | PENDIENTE |
| 16 | Usabilidad: previews ligeras, renombrado en bloque, panel unificado | codex | checklist visual + /verify | PENDIENTE |
| 17 | Amplitud: nuevos proveedores (YouTube como publish-target con capacidades reducidas) | codex (uno por proveedor) | suite de contrato | PENDIENTE |

**Regla de dependencia**: 11 abarata todo lo posterior; 15 solo tiene sentido con 12 y 14
auditados. 13 bloquea cualquier trabajo nuevo sobre portales de subida.

## 4. Roles

- **Orquestador Maestro** (Claude Fable/Opus): diseña planes y contratos, revisa el
  resultado de cada fase contra su verificación, emite auditoría final (AUDITADO o
  RECHAZADO con notas concretas).
- **Ejecutor delegado** (Codex, cuota free de Javier): ejecuta un plan LISTO de principio
  a fin, marca EN_EJECUCION al empezar y EJECUTADO al terminar, corre su propia sección de
  Verificación antes de reportar salida literal. Nunca improvisa fuera de `## Operaciones`.
- **Javier**: decide producto, aprueba mutaciones de esta doctrina, gate humano final.
