---
plan: 18_PLAN_storage-local-claro-ui
estado: EJECUTADO
ejecutor: codex
depende_de: [12, 12B]
---

# 18 — Carpeta local, Claro Drive y UX del explorador

## Contexto

El repositorio ya tiene una base funcional para almacenamiento local y para unión de
storages, pero todavía no cumple la experiencia que el objetivo del proyecto pide:

- `storage` ya existe como adaptador para filesystem local y `mountLocalProvider('storage', path)` ya aparece en la UI.
- Claro Drive sigue siendo investigación, no un proveedor real con login y listado de archivos.
- La vista actual del explorador todavía se siente estrecha y poco cómoda: mucha anchura vacía,
  navegación poco guiada, falta de buscador/breadcrumbs y poca visibilidad de cuenta, proveedor y ruta.

Este plan compila tres frentes que deben avanzar juntos sin perder trazabilidad:

1. convertir la carpeta local en un origen first-class y claramente visible dentro de Indra;
2. integrar Claro Drive de forma honesta, solo si la compatibilidad real se verifica;
3. rediseñar la UX del explorador para que navegar archivos sea rápido, legible y accionable.

## Operaciones

### Fase 1 — Carpeta local como origen first-class

1. Formalizar el proveedor local actual (`storage`) como una carpeta de trabajo visible y trazable.
   - Reusar `src/integrations/storage/adapter.ts` y `src/integrations/storage/index.ts`.
   - Asegurar que el path montado sea absoluto, validado y legible/escribible antes de registrar la conexión.
   - Mantener el rastro de origen en metadata y UI para que cada archivo conserve su procedencia.

2. Ajustar la experiencia de conexión local para que el usuario entienda qué está montando.
   - Revisar `src/features/connections/logic/useIntegrationState.ts`.
   - Revisar `src/features/connections/ui/ConnectionsPanel.tsx`.
   - Revisar `src/features/connections/ui/ProviderEntityRow.tsx` si hace falta exponer mejor el estado del mount.
   - Exponer de forma clara la ruta montada, el estado de la conexión y el tipo de silo que representa.

3. Mantener la compatibilidad con la estructura actual del repo.
   - No inventar un driver nativo CFAPI/FUSE en este plan.
   - Si luego se decide ir a un disco virtual real del sistema operativo, eso debe vivir en un plan separado.

### Fase 2 — Claro Drive como proveedor real

1. Verificar primero la vía técnica real de Claro Drive antes de prometer compatibilidad.
   - Contrastar la investigación local con un endpoint o cuenta real.
   - Determinar si la integración viable es WebDAV/Nextcloud-compatible, login flow, app password o API propietaria.
   - Si no se puede verificar, detenerse y documentar el bloqueo en vez de inventar soporte.

2. Crear el proveedor Claro solo si la verificación anterior confirma una ruta estable.
   - Crear `src/integrations/claro/adapter.ts`.
   - Crear `src/integrations/claro/index.ts`.
   - Registrar el provider en `src/integrations/register-all.ts`.
   - Añadir el contrato de capacidades honesto según lo que realmente soporte el backend.

3. Integrar Claro en el contrato mecánico del repo.
   - Extender `src/core/testing/adapter-contract.test.ts` para cubrir el nuevo provider.
   - Si el login o el listado requieren una UI específica, ajustar `src/components/storage/CredentialVault.tsx` o el componente de conexión correspondiente.

### Fase 3 — UX del explorador

1. Rediseñar el explorador para que la navegación deje de sentirse comprimida.
   - Revisar `src/components/storage/StorageWidgetClient.tsx`.
   - Revisar `src/features/connections/ui/ExplorerPanel.tsx`.
   - Revisar `src/features/connections/ui/NodesPanel.tsx`.
   - Revisar `src/components/resource-explorer/index.tsx` y `src/components/storage` para reutilizar lo existente sin duplicar widgets.
   - Definir un explorador canonico: `StorageWidgetClient` como superficie principal, y `ResourceExplorer` solo como wrapper o apoyo si sigue siendo necesario.

2. Pasar de una vista de lista a una vista de trabajo.
   - Añadir breadcrumbs y contexto de ruta.
   - Añadir buscador y filtros rápidos por proveedor, tipo y estado.
   - Añadir selección múltiple y barra de acciones para operaciones frecuentes.
   - Añadir panel de detalle/preview con origen, tamaño, fecha, cuenta y ruta.

3. Mejorar jerarquía visual y densidad informativa.
   - Reducir zonas vacías improductivas.
   - Hacer el panel lateral más útil o colapsable.
   - Mejorar estados vacíos, loading y error para que la UI explique qué está pasando.
   - Conservar la trazabilidad visible: proveedor, conexión, cuenta y ruta original siempre a la vista.

### Fase 4 — Registro y consistencia

1. Actualizar el mapa del repo cuando el trabajo quede ejecutado.
   - Revisar `docs/SUBSYSTEMS.md`.
   - Revisar cualquier documento de plan que mencione el estado de almacenamiento local, Claro o la UX del explorador.

2. Cerrar el plan solo cuando la experiencia completa quede coherente.
   - Carpeta local usable.
   - Claro Drive integrado solo si la evidencia lo soporta.
   - Exploración de archivos más cómoda y legible.

## Prohibiciones

- No inventar compatibilidad con Claro Drive sin una verificación real.
- No tocar API routes ni UI fuera del alcance de este plan salvo wiring mínimo imprescindible para el nuevo proveedor.
- No introducir un driver nativo CFAPI/FUSE en este plan; eso, si se decide, debe ir en un plan separado.
- No romper trazabilidad de origen: cada archivo debe seguir indicando proveedor, conexión y ruta.
- No mezclar este trabajo con otros adaptadores no relacionados.
- No stagear `.claude/settings.local.json`.
- No usar `git add -A` ni `git add .`.

## Verificación

```powershell
npx tsc --noEmit
npm run test:contract
npm run build
npm run lint -- src/components/storage src/features/connections src/integrations/storage src/integrations/claro
git diff --cached --stat
```

## Commit

Archivos exactos del commit:

- `docs/plans/18_PLAN_storage-local-claro-ui.md`
- `src/integrations/storage/adapter.ts`
- `src/integrations/storage/index.ts`
- `src/features/connections/logic/useIntegrationState.ts`
- `src/features/connections/ui/ConnectionsPanel.tsx`
- `src/features/connections/ui/ProviderEntityRow.tsx`
- `src/features/connections/ui/ExplorerPanel.tsx`
- `src/features/connections/ui/NodesPanel.tsx`
- `src/components/storage/StorageWidgetClient.tsx`
- `src/components/storage/CredentialVault.tsx`
- `src/components/resource-explorer/index.tsx`
- `src/integrations/claro/adapter.ts`
- `src/integrations/claro/index.ts`
- `src/integrations/register-all.ts`
- `src/core/testing/adapter-contract.test.ts`
- `docs/SUBSYSTEMS.md`

```
feat(storage): local workspace folder, Claro Drive provider, and explorer UX overhaul (Plan 18)
```
