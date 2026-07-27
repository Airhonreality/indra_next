---
plan: 12B_PLAN_wiring-y-gestion
estado: EJECUTADO
ejecutor: codex
depende_de: [12]
---

# 12B — Wiring de `s3` en upstreams + operaciones de gestión en Drive/Mega/OneDrive

## Contexto

Hallazgos de la auditoría del Plan 12:

1. `getActiveUpstreams` en `src/integrations/storage-union/helpers.ts` (línea ~57) itera
   `storage_connections` pero solo instancia el provider `'mega'` (hardcodeado). Una
   conexión `s3` guardada por la UI **nunca aparece en el panel**. Hay que generalizar.
2. Los adaptadores Drive, Mega y OneDrive declaran `canDelete/canRename/canMove: false`
   (Plan 11) porque los métodos no existen. Sus APIs sí lo soportan; este plan los
   implementa contra el contrato del Plan 12 (`deleteItem`/`renameItem`/`moveItem`).

Patrones de cliente existentes (respétalos, no introduzcas otros):
- Drive y OneDrive: `this.client.request({ endpoint, method?, params?, data? })`
  (proxy Nango; ver usos en cada adapter).
- Mega: nodos `megajs` vía `storage.files[id]` (`MutableFile`).

## Operaciones

### Paso 1 — Generalizar `getActiveUpstreams`

En `src/integrations/storage-union/helpers.ts`, en el bucle de `activeStorage`:
conserva el caso especial de `'mega'` (credenciales por cabecera con fallback a
`decryptServerPayload`), y para **cualquier otro provider** (hoy `'s3'`):

```typescript
} else if (storage.encryptedCredentials) {
  const creds = decryptServerPayload(storage.encryptedCredentials, userId);
  if (creds) {
    const adapter = registry.resolveAdapter(storage.provider, creds);
    if (adapter) upstreams.push(adapter as any);
  }
}
```

Sin hardcodear `'s3'`: el registro resuelve por `storage.provider`. Mantén el
`try/catch` con `console.error` del patrón existente.

### Paso 2 — Google Drive: operaciones de gestión

En `src/integrations/google-drive/adapter.ts` (Drive REST v3 vía `this.client.request`):

- `deleteItem(itemId)`: `DELETE /drive/v3/files/{itemId}`.
- `renameItem(itemId, newName)`: `PATCH /drive/v3/files/{itemId}` con `data: { name: newName }`;
  devuelve `{ newId: itemId }` (Drive no cambia el id al renombrar).
- `moveItem(itemId, targetFolderId)`: primero `GET /drive/v3/files/{itemId}?fields=parents`,
  luego `PATCH /drive/v3/files/{itemId}` con params `addParents: targetFolderId,
  removeParents: <parents actuales unidos por coma>`; devuelve `{ newId: itemId }`.

Manifiesto: `canDelete/canRename/canMove` → `true`.

### Paso 3 — Mega: operaciones de gestión

En `src/integrations/mega/adapter.ts` (nodos `megajs`, espejo del estilo de
`downloadBlob`/`createResumableSession` existentes):

- `deleteItem(itemId)`: resolver `storage.files[itemId]` y llamar su método `delete`
  (megajs: `node.delete(permanent?)` — usa la papelera si existe la opción no permanente).
- `renameItem(itemId, newName)`: `node.rename(newName)`; `{ newId: itemId }`.
- `moveItem(itemId, targetFolderId)`: `node.moveTo(targetNode)` donde `targetNode` es
  `storage.root` si el destino es `'root'`, o `storage.files[targetFolderId]`;
  `{ newId: itemId }`.
- Si el nodo no existe, `ok: false` con error claro.

Manifiesto: `canDelete/canRename/canMove` → `true`.

### Paso 4 — OneDrive: operaciones de gestión

En `src/integrations/onedrive/adapter.ts` (Microsoft Graph vía `this.client.request`,
mismo prefijo de endpoint que ya usa el adapter para listar):

- `deleteItem(itemId)`: `DELETE /me/drive/items/{itemId}` (ajusta el prefijo al que ya
  use el adapter).
- `renameItem(itemId, newName)`: `PATCH` del ítem con `data: { name: newName }`; `{ newId: itemId }`.
- `moveItem(itemId, targetFolderId)`: `PATCH` con `data: { parentReference: { id: targetFolderId } }`;
  `{ newId: itemId }`.

Manifiesto: `canDelete/canRename/canMove` → `true`.

### Paso 5 — Regla de honestidad por operación

Si alguna operación NO se puede implementar con el cliente existente del adaptador
(p. ej. el proxy Nango rechaza el verbo o el endpoint), NO la fuerces: deja el método
sin implementar, mantén su capacidad en `false` con `// TODO(plan-12C): <motivo>` y
repórtalo como desviación. La suite de coherencia debe quedar en verde con lo que
declares.

### Paso 6 — Índice

En `docs/SUBSYSTEMS.md`, actualiza la fila `Integrations: Storage Union` añadiendo al
propósito: "getActiveUpstreams generalizado: resuelve cualquier provider de
storage_connections vía registry (mega conserva ruta de credenciales por cabecera)."

### Paso 7 — Estado

Marca este plan `estado: EJECUTADO` en su frontmatter.

## Prohibiciones

- NO toques rutas API (`src/app/api/**`) ni UI (`src/components`).
- NO toques `src/integrations/s3/` ni los adaptadores fuera de los tres listados.
- NO cambies firmas ni lógica existente de los adaptadores: solo AÑADES los tres
  métodos y actualizas el manifiesto.
- NO stagees `.claude/settings.local.json` ni nada fuera de la lista de ## Commit.
- NO uses `git add -A` / `git add .`.
- UN SOLO commit final.

## Verificación (correr todos; pegar salida literal)

```powershell
npx tsc --noEmit                # → sin errores
npm run test:contract           # → en verde (nota: si la 1.ª corrida dice "no tests",
                                #   es un flake de arranque en frío conocido — corre de
                                #   nuevo; debe pasar de forma consistente)
git diff --cached --stat        # → solo archivos de este plan
git grep -n "canDelete: true" -- src/integrations/   # → drive, mega, onedrive, s3
```

## Commit

Archivos exactos del commit: `src/integrations/storage-union/helpers.ts`,
`src/integrations/google-drive/adapter.ts`, `src/integrations/mega/adapter.ts`,
`src/integrations/onedrive/adapter.ts`, `docs/SUBSYSTEMS.md`,
`docs/plans/12B_PLAN_wiring-y-gestion.md`.

```
feat(integrations): wire s3 into active upstreams + management ops for Drive/Mega/OneDrive (Plan 12B)
```
