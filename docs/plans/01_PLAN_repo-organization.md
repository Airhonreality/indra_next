---
plan: 01_PLAN_repo-organization
estado: EJECUTADO
ejecutor: liviano
depende_de: []
---

# 01 — Reorganización del repositorio e índice de subsistemas

## Contexto

Este repo (`indra-next-sovereign_A`, Next.js 16 App Router) acumuló entropía documental:
planes sueltos en la raíz, specs mezcladas con papers de investigación en
`docs/5_Scientific_Research_Papers/`, y basura de la extensión Local History (`.history/`).
Tu tarea: mover archivos a una taxonomía limpia, actualizar `.gitignore`, y crear un
índice de subsistemas. **No interpretes ni resumas el contenido de los archivos movidos;
solo se mueven.** La doctrina general está en `docs/plans/00_NORTH_STAR.md` (léelo primero).

Taxonomía destino:

- `docs/plans/` — planes ejecutables con frontmatter de estado
- `docs/specs/` — especificaciones y diseños maestros
- `docs/research/` — papers de investigación (INVS/INS) y material de referencia
- `docs/archive/` — documentos obsoletos o temporales que no se borran aún

## Operaciones

### Paso 1 — `.gitignore`

Añadir al final de `.gitignore` (raíz):

```
# VSCode Local History extension
.history/

# scratch local
/scratch/
scratch_diagnose.js
```

### Paso 2 — Crear carpetas

`docs/specs/`, `docs/research/`, `docs/archive/` (docs/plans ya existe).

### Paso 3 — Movimientos exactos

Usa `git mv` para archivos rastreados; si `git mv` falla porque el archivo no está
rastreado, usa `Move-Item` y luego `git add` del destino. Comillas obligatorias (hay
espacios en los nombres).

Desde la **raíz**:

| Origen | Destino |
|--------|---------|
| `PLAN PENDIENTEsdk_embed_dev_plan.md` | `docs/plans/02_PLAN_sdk-embed.md` |
| `temporal plan javier.md` | `docs/archive/temporal-plan-javier.md` |
| `MASTER_MIGRATION_PROMPT.md` | `docs/archive/MASTER_MIGRATION_PROMPT.md` |
| `INS_Arnes agentico.md` | `docs/research/INS_Arnes agentico.md` |

`ROADMAP.md` y `README.md` **se quedan en la raíz**.

Desde `docs/`:

| Origen | Destino |
|--------|---------|
| `docs/MASTER_SPEC.md` | `docs/specs/MASTER_SPEC.md` |
| `docs/STORAGE_MASTER_PLAN.md` | `docs/specs/STORAGE_MASTER_PLAN.md` |
| `docs/IPW_MASTER_PLAN.md` | `docs/specs/IPW_MASTER_PLAN.md` |
| `docs/SME_MASTER_PLAN.md` | `docs/specs/SME_MASTER_PLAN.md` |
| `docs/TELEOLOGY_AND_USABILITY.md` | `docs/specs/TELEOLOGY_AND_USABILITY.md` |
| `docs/CLAUDE_CODE_MASTER_PROMPT.md` | `docs/archive/CLAUDE_CODE_MASTER_PROMPT.md` |

Carpetas completas:

| Origen | Destino |
|--------|---------|
| `docs/5_Scientific_Research_Papers/` (todo su contenido, incluidas subcarpetas `Video/` y `nuevo modulo engince de investigacion y diseño especulativo/`) | `docs/research/` |
| `docs/Maps/` | `docs/research/Maps/` |

Al terminar, `docs/5_Scientific_Research_Papers/` y `docs/Maps/` no deben existir.

### Paso 4 — Frontmatter del plan movido

Al inicio de `docs/plans/02_PLAN_sdk-embed.md` (sin tocar el resto del contenido), inserta:

```markdown
---
plan: 02_PLAN_sdk-embed
estado: BORRADOR
ejecutor: orquestador
depende_de: []
---
```

### Paso 5 — Reparar referencias rotas

Busca en el repo (excluyendo `node_modules`, `.next`, `.history`, `.git`) referencias a
las rutas viejas: `5_Scientific_Research_Papers`, `PLAN PENDIENTE`, `MASTER_MIGRATION_PROMPT`,
`CLAUDE_CODE_MASTER_PROMPT`, `INS_Arnes agentico`, `docs/Maps`. Actualiza cada referencia
encontrada a la ruta nueva. Reporta cuáles cambiaste.

### Paso 6 — Índice de subsistemas

Crea `docs/SUBSYSTEMS.md`. Para cada fila, inspecciona brevemente la carpeta (nombres de
archivos y primeras líneas) y escribe 1-2 frases de propósito. Si no puedes determinar el
propósito, escribe `TODO: auditar` — **no inventes**. Estructura obligatoria:

```markdown
# Índice de Subsistemas — Indra Next Sovereign
> Mantenido por planes. Última actualización: <fecha> por Plan 01.

| Subsistema | Ruta | Propósito | Estado | Docs |
|---|---|---|---|---|
```

Filas mínimas (añade las que descubras):
`src/app/api/storage`, `src/app/api/integrations`, `src/app/api/p` (portales públicos),
`src/app/dashboard`, `src/components/storage`, `src/components/ingestion`, `src/core`,
`src/features`, `src/hooks`, `src/inngest`, `src/integrations`, `src/lib`, `src/stores`,
`src/workers`, `drizzle/` (esquema DB), `docs/plans`, `docs/specs`, `docs/research`.

Columna **Estado**: usa solo `ESTABLE`, `EN_DESARROLLO`, `ROTO` (p. ej. el transcoder se
sabe roto), o `TODO: auditar`. Columna **Docs**: enlaces relativos a specs/research
relacionados si los identificas por nombre.

### Paso 7 — Actualizar estado y commit

Marca este plan como `estado: EJECUTADO` en su frontmatter.

## Prohibiciones

- **NO toques nada bajo `src/`** (hay trabajo en curso sin commitear en 5 archivos de
  `src/` — no deben entrar en tu commit).
- NO borres ningún archivo (solo mover).
- NO edites el contenido de los documentos movidos (excepto el frontmatter del Paso 4).
- NO hagas `git add -A` ni `git add .` — stagea explícitamente solo los archivos de este plan.

## Verificación (ejecutar todos; deben pasar)

```powershell
# 1. Las rutas viejas no existen
Test-Path 'docs/5_Scientific_Research_Papers'   # → False
Test-Path 'docs/Maps'                            # → False
Test-Path 'PLAN PENDIENTEsdk_embed_dev_plan.md'  # → False
Test-Path 'INS_Arnes agentico.md'                # → False

# 2. Las nuevas existen
Test-Path 'docs/plans/02_PLAN_sdk-embed.md'      # → True
Test-Path 'docs/SUBSYSTEMS.md'                   # → True
Test-Path 'docs/research/INS_Arnes agentico.md'  # → True

# 3. git status NO muestra .history/ como untracked y NO incluye archivos de src/ staged
git status --short

# 4. Cero referencias a rutas viejas fuera de este plan
git grep -l "5_Scientific_Research_Papers" -- ':!docs/plans/01_PLAN_repo-organization.md'  # → vacío
```

## Commit

Un solo commit, solo con los archivos de este plan (los `.md` movidos/creados y `.gitignore`):

```
chore(docs): reorganize repo into plans/specs/research taxonomy + subsystem index (Plan 01)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
```
