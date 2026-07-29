---
plan: 03_PLAN_explorador-trazabilidad
estado: LISTO
ejecutor: codex
depende_de: [06]
---

# 03 - Explorador con Trazabilidad (Proveedor/Cuenta/Ruta)

## Contexto

El sistema ya tiene:
- Un explorador de archivos en `ExplorerPanel` (conexiones UI)
- Múltiples providers: s3, claro, mega, storage
- Una raíz local gestionada (Indra Drive) en la Fase 1-2

Lo que falta: integrar la trazabilidad de origen en la UI. Cada archivo mostrado debe indicar:
1. **Proveedor**: s3, claro, mega, o local
2. **Cuenta/Conexión**: qué integración lo expone
3. **Ruta remota/local**: dónde reside en el origen

## Objetivo

Modificar el explorador para que muestre badges/indicators indicando:
- Icono del proveedor (S3, Claro, Mega, Local)
- Nombre de la conexión (ej: "Mi Google Drive", "R2 Production")
- Ruta remota o ruta local en Indra Drive

Sin cambiar la navegación ni la carga, solo la presentación visual.

## Operaciones

### 1. Auditar estado actual del explorador

Archivos clave:
- `src/features/connections/ui/ExplorerPanel.tsx`
- `src/components/storage/StorageWidget.tsx`
- `src/components/storage/StorageWidgetClient.tsx`

Tareas:
- Leer estructura de datos actual (cómo se representan archivos)
- Identificar dónde viene la info de proveedor/conexión
- Ver cómo se renderiza cada fila

### 2. Crear componente de badge de origen

Archivo: `src/components/storage/OriginBadge.tsx`

Debe mostrar:
- Icono + nombre de proveedor
- Nombre de conexión (opcional, si está disponible)
- Ruta remota en tipografía mono pequeña (opcional)

```tsx
interface OriginBadgeProps {
  provider: string;
  connectionLabel?: string;
  remotePath?: string;
}

export function OriginBadge({ provider, connectionLabel, remotePath }: OriginBadgeProps) {
  // Mapear icono por provider (S3 Icon, WebDAV Icon, etc)
  // Renderizar badge compacto
}
```

### 3. Integrar badge en el explorador

Archivos a modificar:
- `ExplorerPanel.tsx`: pasar provider/connectionLabel en props
- `StorageWidget.tsx`: renderizar OriginBadge junto al nombre del archivo

No cambiar lógica de navegación, solo agregar visual.

### 4. Pruebas visuales

- Verificar que el badge aparece en cada fila
- Verificar que la información es correcta (proveedor, conexión)
- Verificar que responsive en mobile

## Prohibiciones

- No tocar lógica de sincronización (eso es Fase 5)
- No agregar API calls nuevas (usar datos ya existentes)
- No cambiar estructura de datos de archivos
- No tocar StorageAdapter

## Verificación

Criterio visual:
```
✅ Badge visible en cada archivo/carpeta del explorador
✅ Icono correcto según provider (S3, Claro, Mega, Local)
✅ Nombre de conexión legible cuando está disponible
✅ No rompe navegación existente
✅ npm run build y npm run test:contract pasan
```

## Resultado esperado

Documento con:
- Archivos creados/modificados
- Screenshots del explorador con badges
- Confirmación de que tests pasan
- Notas sobre edge cases (archivos sin proveedor claro, etc)
