---
plan: 11_PLAN_storage-adapter-contract
estado: LISTO
ejecutor: codex
depende_de: [01, 10]
---

# 11 — Contrato StorageAdapter: manifiesto de capacidades + Zod + suite de contrato

## Contexto

El contrato universal ya existe en `src/core/types/integration.ts` (`IntegrationAdapter`,
`IBlobCapable`, `OperationResult`) y el registro dinámico en `src/core/registry.ts`
(`UniversalRegistry`, factories perezosas). Hoy las capacidades se detectan por
duck-typing (`isBlobCapable`). Eso no escala hacia la visión del North Star: proveedores
heterogéneos (Drive, Mega, R2, y publish-targets como YouTube que NO son storage
completo) conviviendo en un panel único cuya UI se adapta a lo que cada proveedor puede
hacer.

Este plan añade tres piezas SIN romper nada existente:

1. **Manifiesto de capacidades explícito** que cada adaptador declara.
2. **Esquemas Zod en las fronteras** (regla del North Star: contratos rígidos).
3. **Suite de contrato** ejecutable por adaptador: el "linter mecánico" que convierte
   "añadir un proveedor" en "implementa la interfaz y pasa la suite".

Adaptadores existentes a cubrir: `src/integrations/{google-drive,google-sheets,notion,storage,mega,r2}`.

## Operaciones

### Paso 1 — Instalar dependencias

```
npm install zod
npm install -D vitest
```

Añadir a `package.json` → scripts: `"test:contract": "vitest run src/core/testing"`.

### Paso 2 — Crear `src/core/types/capabilities.ts`

Contenido exacto (ajusta solo imports si hace falta):

```typescript
import { z } from 'zod';

/**
 * CAPABILITY MANIFEST — declaración explícita de lo que un adaptador puede hacer.
 * La UI y los servicios NUNCA hacen duck-typing: leen este manifiesto.
 * Un publish-target (p. ej. YouTube) declara false en casi todo salvo canUpload/canPublish.
 */
export const CapabilityManifestSchema = z.object({
  canListInventory: z.boolean(),
  canDownload: z.boolean(),        // implica implementar IBlobCapable.downloadBlob
  canStream: z.boolean(),          // soporta HTTP Range en downloadBlob
  canUpload: z.boolean(),
  canResumableUpload: z.boolean(), // implica implementar createResumableSession
  canDelete: z.boolean(),
  canRename: z.boolean(),
  canMove: z.boolean(),
  canThumbnail: z.boolean(),       // el proveedor entrega o permite derivar miniaturas
  canQuota: z.boolean(),           // implica implementar IBlobCapable.getSpace
  canPublish: z.boolean(),         // publish-target (YouTube, etc.)
});

export type CapabilityManifest = z.infer<typeof CapabilityManifestSchema>;

/** Ítem de inventario normalizado — frontera validada con Zod. */
export const InventoryItemSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  type: z.enum(['folder', 'file', 'page', 'table']),
  rawMimeType: z.string().optional(),
});

export type InventoryItem = z.infer<typeof InventoryItemSchema>;

/**
 * Coherencia manifiesto ↔ implementación. Devuelve la lista de violaciones
 * (vacía = coherente). Es la base de la suite de contrato.
 */
export function auditManifestCoherence(
  adapter: { capabilities?: CapabilityManifest } & Record<string, unknown>
): string[] {
  const v: string[] = [];
  const caps = adapter.capabilities;
  if (!caps) return ['adapter no declara capabilities'];
  const parsed = CapabilityManifestSchema.safeParse(caps);
  if (!parsed.success) return ['capabilities no cumple el esquema Zod: ' + parsed.error.message];
  if (caps.canDownload && typeof adapter.downloadBlob !== 'function')
    v.push('canDownload=true pero downloadBlob no está implementado');
  if (caps.canStream && !caps.canDownload)
    v.push('canStream=true requiere canDownload=true');
  if (caps.canResumableUpload && typeof adapter.createResumableSession !== 'function')
    v.push('canResumableUpload=true pero createResumableSession no está implementado');
  if (caps.canQuota && typeof adapter.getSpace !== 'function')
    v.push('canQuota=true pero getSpace no está implementado');
  return v;
}
```

### Paso 3 — Extender el contrato en `src/core/types/integration.ts`

- Importar `CapabilityManifest` desde `./capabilities`.
- Añadir a la interfaz `IntegrationAdapter` el campo:
  `readonly capabilities: CapabilityManifest;`
- NO eliminar `isBlobCapable` (compatibilidad); añade encima un comentario:
  `/** @deprecated Leer adapter.capabilities en su lugar. */`

### Paso 4 — Declarar el manifiesto en cada adaptador existente

Para cada adaptador en `src/integrations/{google-drive,google-sheets,notion,storage,mega,r2}`:
añade la propiedad `capabilities` con valores **honestos leídos de la implementación
real** (¿tiene `downloadBlob`? ¿`createResumableSession`? ¿maneja Range?). Si no puedes
determinar una capacidad leyendo el código, declárala `false` y deja un comentario
`// TODO(plan-12): confirmar` — **nunca declares true sin evidencia en el código**.

### Paso 5 — Suite de contrato en `src/core/testing/adapter-contract.test.ts`

Test Vitest que, por cada adaptador registrado u obtenible por factory:

1. Valida `capabilities` contra `CapabilityManifestSchema`.
2. Ejecuta `auditManifestCoherence` y falla si hay violaciones (el mensaje del test debe
   listar las violaciones literales).
3. Verifica campos básicos del contrato: `id` y `label` no vacíos.

La suite corre **offline** (sin credenciales ni red): instancia los adaptadores con un
contexto mock mínimo. Si un adaptador no puede instanciarse sin red, cúbrelo importando
su clase/factory y validando el manifiesto estático; deja `// TODO(plan-12): live test`.

### Paso 6 — Registrar en el índice

En `docs/SUBSYSTEMS.md`: actualiza la fila `Core: Registry & Types` añadiendo en Docs
`docs/plans/11_PLAN_storage-adapter-contract.md`, y añade fila nueva:
`| Contract Testing | src/core/testing | Suite de contrato de adaptadores (Vitest): valida manifiesto de capacidades y coherencia manifiesto↔implementación. | ESTABLE | docs/plans/11_PLAN_storage-adapter-contract.md |`

### Paso 7 — Estado

Marca este plan `estado: EJECUTADO` en su frontmatter.

## Prohibiciones

- NO cambies la lógica de ejecución de ningún adaptador (solo AÑADES la propiedad
  `capabilities` y, si es imprescindible, imports/tipos).
- NO toques UI (`src/components`, `src/app/dashboard`).
- NO borres ni renombres nada de `src/core/types/integration.ts`; solo extender.
- NO declares capacidades `true` sin evidencia en el código del adaptador.
- NO uses `git add -A` / `git add .`.
- Si hay archivos modificados en el working tree que NO son de este plan, no los stagees.

## Verificación (correr todos; pegar salida literal)

```powershell
npx tsc --noEmit                 # → sin errores
npm run test:contract            # → suite en verde
git diff --cached --stat         # → solo archivos de este plan
```

Y verificación de honestidad: `git grep -n "capabilities" src/integrations/ | wc -l`
debe mostrar al menos una declaración por adaptador (6 mínimo).

## Commit

Archivos exactos del commit: `package.json`, `package-lock.json`,
`src/core/types/capabilities.ts`, `src/core/types/integration.ts`,
los archivos de adaptador editados bajo `src/integrations/`,
`src/core/testing/adapter-contract.test.ts`, `docs/SUBSYSTEMS.md`,
`docs/plans/11_PLAN_storage-adapter-contract.md`.

```
feat(core): capability manifest + Zod boundary schemas + adapter contract suite (Plan 11)
```
