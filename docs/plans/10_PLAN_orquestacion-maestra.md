---
plan: 10_PLAN_orquestacion-maestra
estado: AUDITADO
ejecutor: orquestador
depende_de: [01]
---

# 10 — Plan de Orquestación Maestra

Protocolo que gobierna la ejecución de los planes 11–17. Este plan no se "ejecuta":
es la ley operativa del pipeline. Lo mantiene el Orquestador Maestro.

## Topología (actualizada 2026-07-04)

- **Orquestador Maestro** (Claude, sesión de Javier): diseña los planes con el diseño
  técnico embebido, redacta el prompt de despliegue, y audita cada ejecución de forma
  independiente (nunca confía en el auto-reporte del ejecutor).
- **Ejecutor**: **Codex** (cuota free de Javier). Javier pega el prompt de despliegue en
  Codex apuntando a este repo. No se usan subagentes Claude para ejecución.
- **Javier**: transporta prompts, decide producto, gate humano final.

## Protocolo de ejecución (por plan)

1. Orquestador escribe/actualiza `docs/plans/NN_PLAN_slug.md` con estado `LISTO` y
   entrega el prompt de despliegue en el chat.
2. Javier pega el prompt en Codex. Codex ejecuta SOLO la sección `## Operaciones`,
   corre `## Verificación`, commitea según `## Commit`, y marca `estado: EJECUTADO`.
3. Orquestador audita: re-ejecuta la verificación por su cuenta + inspección del diff.
   Veredicto: `AUDITADO` (avanza el pipeline) o `RECHAZADO` (añade sección
   `## Notas de Auditoría` con los defectos exactos y regenera el prompt).

## Prompt de despliegue — plantilla canónica

```text
Eres el ejecutor del pipeline agéntico del repo indra-next-sovereign_A.
Contexto obligatorio (léelos en este orden antes de tocar nada):
1. docs/plans/00_NORTH_STAR.md   (doctrina y goal)
2. docs/SUBSYSTEMS.md            (mapa del repo)
3. docs/plans/NN_PLAN_slug.md    (tu plan; es autocontenido)

Reglas duras:
- Ejecuta SOLO la sección ## Operaciones del plan, en orden. No improvises fuera de ella.
- Respeta ## Prohibiciones al pie de la letra.
- Usa `git mv` para mover archivos rastreados (las eliminaciones deben quedar staged).
- Nunca uses `git add -A` ni `git add .`: stagea explícitamente los archivos del plan.
- Corre TODOS los comandos de ## Verificación y pega su salida literal en tu reporte.
- Commit exactamente como dicta ## Commit. Luego marca el frontmatter del plan
  como estado: EJECUTADO e inclúyelo en el commit.
- Si un paso falla o hay ambigüedad no cubierta por el plan: DETENTE y repórtalo.

Reporte final: archivos creados/movidos/editados, salida literal de cada verificación,
hash del commit, y cualquier desviación (aunque parezca menor).
```

## Lecciones incorporadas (auditoría del Plan 01)

- El ejecutor reportó "todo verde" con 3 defectos reales (commit sin las eliminaciones,
  archivo fuera del commit, carpeta anidada). Por eso: **la verificación del auditor es
  independiente y obligatoria**, y todo plan debe **enumerar explícitamente cada archivo
  que entra en su commit**.
- Los planes deben exigir salida *literal* de los comandos de verificación, no resúmenes.

## Secuencia y compuertas

| Plan | Prerrequisito | El orquestador diseña antes de delegar |
|------|--------------|----------------------------------------|
| 11 — Contrato StorageAdapter + manifiesto de capacidades + Zod | 01 ✅ | Interfaces y esquemas embebidos en el plan (hecho) |
| 12 — Consolidación Drive/Mega/R2 contra el contrato | 11 auditado | Un sub-plan por proveedor, con los gaps que revele la suite del 11 |
| 13 — Transcoder: diagnóstico y reparación | 11 auditado (paralelo a 12) | El orquestador diagnostica primero en sesión; el plan de reparación sale del diagnóstico |
| 14 — BYODB: onboarding + bootstrap de esquema | 11 auditado | Esquema de migraciones y flujo de conexión |
| 15 — Colecciones inter-storage (metadata-only) | 12 y 14 auditados | Modelo de datos de colecciones |
| 16 — Usabilidad: previews, renombrado en bloque, panel | 13 y 15 auditados | Specs de UX por feature |
| 17 — Amplitud: nuevos proveedores (YouTube = publish-target) | 12 auditado | Manifiesto de capacidades por proveedor nuevo |

Los planes 12–17 se redactan cuando su prerrequisito esté AUDITADO — nunca antes, para
que se diseñen sobre el estado real del código y no sobre suposiciones.
