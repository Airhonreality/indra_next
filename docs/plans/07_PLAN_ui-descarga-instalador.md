---
plan: 07_PLAN_ui-descarga-instalador
estado: LISTO
ejecutor: codex
depende_de: [05, 06]
---

# 07 - UI de Descarga del Instalador

## Contexto

Hoy el usuario necesita:
1. Saber que puede descargar un instalador
2. Tener un lugar donde descargarlo directamente desde la app

Este plan agrega una página `/downloads` donde el usuario puede:
- Ver versión disponible
- Descargar setup.bat (Windows)
- Descargar setup.sh (macOS/Linux)
- Ver instrucciones de instalación
- Compartir link de descarga

## Objetivo

Una página simple y clara que muestre:
```
Indra Desktop Storage v0.1.0

[Descargar para Windows] [Descargar para macOS/Linux]

Instrucciones:
1. Descarga el instalador
2. Ejecuta setup.bat o setup.sh
3. Abre http://localhost:3000
4. Login
5. Listo!
```

## Operaciones

### 1. Crear página de descargas

Archivo: `src/app/downloads/page.tsx`

- Tabla de descargas: Windows (.bat), macOS/Linux (.sh)
- Botones de descarga directo
- Información de versión (de package.json)
- Link a SETUP.md para instrucciones detalladas
- Badges: "Experimental", "Requires Node.js 18+"

### 2. Crear API de descarga

Archivo: `src/app/api/downloads/[file]/route.ts`

- GET: Retorna archivo (setup.bat o setup.sh)
- Headers: Content-Type, Content-Disposition (attachment)
- Logging: Quién descargó qué, cuándo

### 3. Integrar en navbar/menu

Agregar link en:
- `src/components/DesktopShellBootstrap.tsx` (si está visible)
- O en sidebar del dashboard si existe

### 4. Crear metadata clara

Archivo: `src/app/downloads/metadata.ts`

```tsx
export const DOWNLOADS_METADATA = {
  version: '0.1.0',
  files: {
    windows: { name: 'setup.bat', size: '976 bytes', requirements: 'Node.js 18+' },
    linux: { name: 'setup.sh', size: '897 bytes', requirements: 'Node.js 18+' },
  },
};
```

## Prohibiciones

- No comprimir en ZIP (simplificar - los scripts son chicos)
- No versionar binarios complejos (eso es Fase 10+)
- No crear CDN o bucket S3 para almacenar (usar repo local)
- No tracer datos personales en logs de descarga

## Verificación

```
✅ /downloads página accesible (autenticado)
✅ Botones de descarga funcionan (archivos se descargan)
✅ Content-Type correcto (text/plain o application/octet-stream)
✅ Content-Disposition: attachment (guarda como archivo)
✅ npm run build exitoso
```

## Resultado esperado

- Página `/downloads` funcional
- Usuario puede descargar instaladores directamente
- Links a instrucciones claras
- Confirmación de build exitoso
