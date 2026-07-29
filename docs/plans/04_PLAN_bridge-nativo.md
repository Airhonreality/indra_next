---
plan: 04_PLAN_bridge-nativo
estado: LISTO
ejecutor: codex
depende_de: [06, 03]
---

# 04 - Bridge Nativo: CFAPI (Windows) y FUSE (Linux) — Contratos y Documentación

## Contexto

Este plan NO implementa un daemon nativo funcional (eso sería Fase 6+). En su lugar:

1. Define los **contratos TypeScript** que un daemon nativo DEBE implementar
2. Crea **tipos y esquemas Zod** para el IPC (inter-process communication)
3. Documenta la **arquitectura esperada** para Windows CFAPI y Linux FUSE
4. Prepara **placeholders en el código** que señalen dónde el daemon se conectaría

Esto permite que el frontend esté listo para recibir datos del daemon sin bloquearse esperando su implementación.

## Objetivo

Crear una barrera clara entre lo que el repo hace HOY (web shell + carpeta local) y lo que el daemon FUTURO hará (sincronización real con SO).

## Operaciones

### 1. Crear archivo de especificación de contratos

Archivo: `src/lib/native-bridge-contract.ts`

Define:
```tsx
// Tipos para comunicación daemon ↔ frontend

export type NativeBridgeCapability = 'cfapi-windows' | 'fuse-linux' | 'none';

export interface NativeBridgeStatus {
  capability: NativeBridgeCapability;
  isRunning: boolean;
  lastCheck: string; // ISO timestamp
  rootPath: string;
  syncStatus: 'idle' | 'syncing' | 'error';
  errorMessage?: string;
}

export interface NativeBridgeSyncEvent {
  type: 'file-downloaded' | 'file-uploaded' | 'file-deleted' | 'sync-complete' | 'error';
  timestamp: string;
  filePath: string;
  provider?: string;
  sizeBytes?: number;
  errorMessage?: string;
}

// Endpoint contract
export async function checkNativeBridgeStatus(): Promise<NativeBridgeStatus> {
  // Retorna estado del daemon, o { capability: 'none', isRunning: false }
}

export async function subscribeToNativeBridgeEvents(
  callback: (event: NativeBridgeSyncEvent) => void
): Promise<() => void> {
  // Returns unsubscribe function
}
```

### 2. Crear esquema Zod para validación

Archivo: `src/lib/native-bridge-schema.ts`

```tsx
import { z } from 'zod';

export const NativeBridgeStatusSchema = z.object({
  capability: z.enum(['cfapi-windows', 'fuse-linux', 'none']),
  isRunning: z.boolean(),
  lastCheck: z.string().datetime(),
  rootPath: z.string(),
  syncStatus: z.enum(['idle', 'syncing', 'error']),
  errorMessage: z.string().optional(),
});

export const NativeBridgeSyncEventSchema = z.object({
  type: z.enum(['file-downloaded', 'file-uploaded', 'file-deleted', 'sync-complete', 'error']),
  timestamp: z.string().datetime(),
  filePath: z.string(),
  provider: z.string().optional(),
  sizeBytes: z.number().optional(),
  errorMessage: z.string().optional(),
});
```

### 3. Crear endpoint stub de verificación

Archivo: `src/app/api/desktop/bridge/route.ts`

```tsx
export async function GET() {
  // Retorna estado del bridge nativo, o { capability: 'none', isRunning: false }
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    // Hoy: siempre retorna 'none'
    // Futuro: llamará a daemon local en puerto X
    return NextResponse.json({
      capability: 'none',
      isRunning: false,
      lastCheck: new Date().toISOString(),
      rootPath: resolveDesktopRootPath(session.user.id),
      syncStatus: 'idle',
      message: 'Native bridge not yet implemented. See docs/plans/04_PLAN_bridge-nativo.md',
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to check bridge' }, { status: 500 });
  }
}
```

### 4. Documentar arquitectura esperada para daemon

Archivo: `docs/architecture/native-bridge-architecture.md`

Secciones:
1. **Windows CFAPI**
   - Requisitos: Win 10 1909+ con KB5005326
   - API: CfRegisterSyncRoot, CfConnectSyncRoot
   - Callback handlers: FETCH_DATA, CANCEL_FETCH
   - Registro en: HKCU\SOFTWARE\SyncEngines\Providers\IndraStorage
   - Port de comunicación: 9876 (default, configurable)

2. **Linux FUSE 3**
   - Requisitos: kernel 5.0+, libfuse3 >= 3.10
   - Mach call: readdirplus para directorios sin hidratar
   - Pass-through direct I/O para archivos descargados
   - Socket de comunicación: /tmp/indra-storage-fuse.sock

3. **IPC Protocol**
   - Transport: HTTP POST a localhost:9876/api/sync-event (Windows)
   - Transport: Unix socket JSON-line para Linux
   - Eventos: file-downloaded, file-uploaded, file-deleted, sync-complete
   - Heartbeat cada 5s

### 5. Crear UI stub en DesktopPanel

Modificar `src/features/connections/ui/DesktopPanel.tsx`:
- Agregar sección "Native Bridge Status"
- Mostrar "No disponible" (para ahora)
- Incluir link a documentación técnica

## Prohibiciones

- No implementar daemon real (eso es trabajo futuro)
- No hacer llamadas a kernel o APIs OS
- No crear dependencias en paquetes nativos
- No prometer sincronización que no existe

## Verificación

Criterio:
```
✅ Archivo de contratos compila sin errores
✅ Esquema Zod valida correctamente
✅ Endpoint /api/desktop/bridge retorna JSON válido
✅ npm run build y npm run test:contract pasan
✅ Documentación de arquitectura está clara y completa
```

## Resultado esperado

Documento con:
- Archivos creados: native-bridge-contract.ts, native-bridge-schema.ts, api route
- Documentación de arquitectura (Windows + Linux)
- Screenshots del UI stub
- Confirmación de que el contrato permite que un daemon futuro se conecte sin cambios en el frontend
