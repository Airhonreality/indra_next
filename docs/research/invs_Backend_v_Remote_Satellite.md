# back end y control remoto de saltelite a indra — Reporte Técnico

**Fecha:** marzo–abril 2026  
**Alcance:** Schema Ignition Protocol + Satellite HUD  
**Estado:** Implementado. Pendiente de pruebas E2E y bundling de producción.

---

## 1. Qué se construyó

Dos subsistemas nuevos que trabajan juntos:

### 1.A Schema Ignition Protocol
Permite crear una tabla física (Google Sheet, Notion DB) a partir de un `DATA_SCHEMA` existente en Indra, desde la propia UI del Schema Designer.

- Flujo: Esquema sin silo → botón Ignitar → se crea la tabla con columnas tipadas → el esquema queda vinculado al ID del silo.
- Los tipos de campos del esquema (`DATE`, `NUMBER`, `SELECT`, etc.) se traducen a tipos nativos del provider destino.

### 1.B Remote Forge Connector (Satellite HUD)
Un módulo React auto-contenido que permite a un frontend externo (NOMON u otro proyecto) conectarse al Core de Indra para sincronizar esquemas e ignitar silos, sin abrir la UI de Indra.

- El desarrollador declara sus esquemas en su propio código y el HUD los compara con los que hay en el Core.
- El HUD es un overlay flotante que solo aparece en entornos `localhost` o con un token de admin explícito.

---

## 2. Archivos creados o modificados

### Backend (Google Apps Script — `system_core/core/`)

| Archivo | Cambio |
|---|---|
| `2_providers/provider_system_infrastructure.js` | +`_system_handleSchemaIgnite`: lee el schema, llama a ATOM_CREATE TABULAR, vincula el silo_id resultante al schema. +`_system_handleCoreDiscovery`: verifica un Google ID Token y devuelve la URL del Core + session_secret. |
| `2_providers/provider_system.js` | Registro de `SYSTEM_SCHEMA_IGNITE` y `SYSTEM_CORE_DISCOVERY` en el manifiesto de protocolos y el dispatch. |
| `2_providers/provider_drive.js` | ATOM_CREATE para clase TABULAR ahora acepta `fields` como array de objetos y escribe las cabeceras en negrita con fila congelada. |
| `2_providers/provider_notion.js` | ATOM_CREATE para clase TABULAR crea una Notion Database (no una página) con propiedades tipadas via `_notion_translateTypeToNotion`. |

### Frontend React — Schema Designer (`system_core/client/src/`)

| Archivo | Cambio |
|---|---|
| `macro_engines/SchemaDesigner/SchemaIgnitionPanel.jsx` | Componente nuevo. Panel de 3 estados: ORPHAN (sin silo) → IGNITING (spinner) → INCARNATED (ID del silo vinculado). |
| `macro_engines/SchemaDesigner/index.jsx` | El slot vacío del inspector derecho ahora monta `SchemaIgnitionPanel` en lugar de un placeholder estático. |

### Frontend React — Satellite HUD (`system_core/client/src/satellite/`)

| Archivo | Rol |
|---|---|
| `hud.js` | Entry point inyectable vía `<script>`. Crea un Shadow DOM y monta React dentro. |
| `index.js` | Barrel de exportaciones para uso como módulo (`import { IndraBridge }`). |
| `components/IndraBridge.jsx` | Wrapper `<IndraBridge>` que monta el ForgePanel como overlay en entornos dev. |
| `components/ForgePanel.jsx` | Panel principal: auth state, lista de schema cards, acciones. |
| `components/SchemaCard.jsx` | Una tarjeta por esquema detectado con indicador visual de estado y botones de acción. |
| `hooks/useCoreAuth.js` | Gestiona el ciclo de vida de la sesión: Google OAuth One Tap → Core Discovery → sessionStorage. |
| `hooks/useForgeSync.js` | Diff engine: lee `window.INDRA_SCHEMAS` vs átomos del Core y calcula el estado de cada uno. |
| `services/core_bridge.js` | Capa HTTP pura (`fetch`). Funciones: `executeUqo`, `discoverCore`, `syncSchemaToCor`, `updateSchemaInCore`, `igniteSchema`, `fetchCoreSchemas`. |

### Documentación (`system_core/Documentacion/`)

| Archivo | Contenido |
|---|---|
| `ADRs/ADR_032_SCHEMATIC_IGNITION_PROTOCOL.md` | Decisión arquitectónica del protocolo de ignición. |
| `ADRs/ADR_033_REMOTE_FORGE_CONNECTOR.md` | Decisión sobre el módulo satélite: aislamiento, auth, seguridad. |
| `ADRs/ADR_001_DATA_CONTRACTS.md` | Sección 11 añadida: contrato de ATOM_CREATE para TABULAR con `fields` como array de objetos. |
| `ADRs/ADR_020_INDUSTRIAL_INDUCTION_ENGINE.md` | Enlace a ADR-032 como contraparte simétrica (Forward Engineering). |
| `Manuales/MANUAL_FORGE_CONNECTOR.md` | Guía pública para desarrolladores externos. 5 pasos: declarar esquema → inyectar script → login → sincronizar → ignitar. |

---

## 3. Cómo usarlo

### Caso A: Ignitar un silo desde la UI de Indra

1. Abre el Schema Designer en cualquier esquema.
2. No selecciones ningún campo (haz clic en el fondo del blueprint).
3. El panel derecho muestra el estado del esquema (ORPHAN si no tiene silo).
4. Elige el provider (Drive o Notion) y pulsa **IGNITAR MATERIA FÍSICA**.
5. El Sheet o la DB se crea automáticamente con columnas tipadas.

### Caso B: Usar el Satellite desde un proyecto externo (modo React)

```jsx
// main.jsx de NOMON o cualquier proyecto externo
import { IndraBridge } from './satellite';

export default function App() {
  return (
    <IndraBridge>
      <TuApp />
    </IndraBridge>
  );
}
```

```js
// schemas.js — en cualquier archivo del proyecto externo
window.INDRA_SCHEMAS = {
  'aliados_hub': {
    label: 'Formulario de Aliados',
    fields: [
      { id: 'nombre',  label: 'Nombre',       type: 'TEXT'     },
      { id: 'email',   label: 'Email',         type: 'EMAIL'    },
      { id: 'fecha',   label: 'Fecha',         type: 'DATE'     },
      { id: 'monto',   label: 'Presupuesto',   type: 'CURRENCY' }
    ]
  }
};
```

El HUD aparece automáticamente en `localhost`. El botón **CONECTAR CON GOOGLE** inicia el handshake. El Core se descubre solo.

### Caso C: Inyección vía script (cualquier HTML)

```html
<!-- index.html del proyecto externo -->
<script src="https://tu-indra.io/satellite/v1/hud.bundle.js"></script>
```

> **Nota:** Requiere compilar `hud.js` previamente (ver sección 5).

---

## 4. Mapeo de tipos de campo

| Tipo en Indra | Notion | Google Sheets |
|---|---|---|
| `TEXT`, `LONG_TEXT` | `rich_text` | Columna de texto (default) |
| `NUMBER`, `CURRENCY` | `number` | Columna numérica |
| `DATE`, `DATETIME` | `date` | Columna de texto (formato libre) |
| `SELECT`, `RADIO`, `ENUM` | `select` | Columna de texto |
| `MULTISELECT`, `ARRAY` | `multi_select` | Columna de texto |
| `BOOLEAN`, `CHECKBOX` | `checkbox` | Columna de texto |
| `URL` | `url` | Columna de texto |
| `EMAIL` | `email` | Columna de texto |
| `PHONE` | `phone_number` | Columna de texto |

> Sheets no tiene tipos de columna nativos por API. Las cabeceras se crean en negrita con fila congelada. La inferencia de tipo queda para una versión futura con Sheets API v4 (Tablas).

---

## 5. Piezas faltantes para producción

### Crítico (bloqueante)

1. **Bundling del HUD como script autónomo:** `hud.js` usa JSX y ES Modules. Para servirse como `<script src="...">` externo necesita compilarse con Vite o Rollup en un único archivo con React embebido. Sin esto, la inyección vía `<script>` no funciona en HTML puro.

2. **CORS en Google Apps Script:** GAS no permite peticiones `fetch()` POST cross-origin desde dominios externos por defecto. Hay que verificar empíricamente si el redirect de GAS (status 302 → GET) rompe la solicitud del satélite. Si lo hace, se necesita un proxy intermedio o el uso de `no-cors` con las limitaciones que ello implica.

3. **`window.INDRA_GOOGLE_CLIENT_ID` sin valor por defecto:** El satélite necesita un Client ID de Google OAuth configurado. Actualmente se lee de `window.INDRA_GOOGLE_CLIENT_ID`. Si no está, el botón de login falla silenciosamente.

### Importante (no bloqueante)

4. **La función `discoverCore` llama a `window.INDRA_DISCOVERY_URL`:** Si el arquitecto no define esta variable, el satélite no sabe a qué URL de Indra apuntar para el handshake inicial. Habría que documentar o proveer un mecanismo de fallback (ej: que en `localhost` apunte a `localhost:5173`).

5. **`ATOM_READ` con filtro por clase no está testeado para Schemas:** El hook `useForgeSync` llama `ATOM_READ` con `query: { class: 'DATA_SCHEMA' }`. Hay que verificar que el handler `_system_handleRead` en el backend filtra correctamente por clase cuando el UQO llega desde el satélite (sin `context_id` explícito).

6. **No hay soporte para más de un workspace en el satélite:** El satélite lee todos los esquemas del Core sin segmentar por workspace. Si el arquitecto tiene múltiples workspaces, los esquemas de todos aparecen mezclados.

7. **Sin soporte SQL/Postgres:** El mapeo de tipos existe para Drive y Notion. Un tercer provider tabular requeriría su propio `_provider_handleAtomCreate` con traducción a `CREATE TABLE`.

### A futuro

8. **Polling automático:** Actualmente el satélite solo actualiza el diff al hacer login o pulsar Refresh. WebSockets no son posibles en GAS; se podría implementar polling cada N segundos.

9. **Compilación del satélite como paquete npm:** Para distribución simplificada (`npm install @indra-os/satellite`).

---

## 6. Resumen del proceso de diseño

El diseño se resolvió respondiendo tres preguntas en orden:

**¿Quién es responsable de crear la infraestructura?**  
El Core (GAS), nunca el frontend. El frontend solo declara la intención.

**¿Debe el satélite reutilizar componentes de la UI de Indra?**  
No. El satélite es una sonda ligera. Importar el SchemaDesigner completo (600+ líneas, Zustand, contextos) violaría el principio de mínima masa y lo haría inutilizable fuera del repo de Indra.

**¿Cómo se autentica sin hardcodear credenciales?**  
Google OAuth como fuente de identidad. El token de Google se verifica en el Core, que devuelve el `session_secret` propio. El frontend nunca toca el `session_secret` directamente; lo recibe del Core tras identificarse.

El resultado es un sistema donde:
- El código del frontend externo no contiene ningún secreto.
- El Core no acepta ninguna llamada sin que el `session_secret` esté presente.
- El satélite es el único puente, y solo existe en entornos de desarrollo.
