# 🛰️ INDRA NEXT: PROTOCOLO DE CONSTRUCCIÓN SOBERANA (v2.0)

## 0. MANIFIESTO DE EJECUCIÓN
Estás actuando como un Arquitecto de Software Senior. No estás simplemente portando código; estás **evolucionando** la inteligencia de Indra OS (GAS) hacia una **Infraestructura de Capacidades de Grado Industrial**.

**REGLA DE ORO:** Usa nomenclatura **DEV UNIVERSAL**. Nada de nombres místicos ("materia", "átomos", "soberanos") dentro del código. Usa estándares: `Integration`, `Adapter`, `Record`, `Payload`, `Engine`.

---

## 1. STACK TECNOLÓGICO (Ya configurado)
- **Framework:** Next.js 14+ (App Router)
- **Conectividad:** Nango (`src/lib/nango.ts`) → Úsalo como proxy para TODA API externa.
- **Orquestación:** Inngest (`src/lib/inngest.ts`) → Para procesos durables y peristálticos.
- **Persistencia:** Drizzle ORM + PostgreSQL (`src/core/db/schema.ts`).
- **UI:** Tailwind 4 + shadcn/ui.
- **Contratos:** Zod para validación de esquemas.

---

## 2. POLÍTICA DE ERRORES Y ROBUSTEZ
- **Loud & Clear:** No uses `try/catch` silenciosos. Los errores deben ser descriptivos y devueltos en el objeto `OperationResult`.
- **Refactorización Proactiva:** Si el código original en `.gs` es ineficiente (ej: bucles secuenciales), optimízalo usando `Promise.all` o Streams de Node.js.
- **Fail-Fast:** Valida los inputs con Zod antes de ejecutar cualquier lógica de adapter.

---

## 3. MISIONES DE CODIFICACIÓN (Orden de ejecución)

### 🧩 Misión 1: Notion Adapter (`src/integrations/notion/adapter.ts`)
Porta la inteligencia de `source_material/provider_notion.gs`:
- Usa `nango.proxy` para las llamadas.
- Porta `_notion_flattenProperties` (Lógica de aplanado de JSON).
- Porta `_notion_resolveRelationNames` (Resolución paralela de IDs).
- Implementa `getSchema()` mapeando propiedades a `FieldSchema[]`.

### 🧩 Misión 2: Google Sheets Adapter (`src/integrations/google-sheets/adapter.ts`)
Porta `source_material/provider_sheets.gs`:
- Gestión de filas como `Records`.
- Inferencia automática de tipos desde la cabecera.

### 🧩 Misión 3: JSON Adapter (`src/integrations/json-file/adapter.ts`)
Porta `source_material/provider_json_atom.gs`:
- Lectura/Escritura de archivos locales para backups y persistencia rápida.

### 🧩 Misión 4: File/Drive Adapter (`src/integrations/google-drive/adapter.ts`)
- Gestión de binarios y estructura de carpetas basada en `provider_drive.gs`.

### 🧠 Misión 5: Engines Agnósticos (`src/core/engines/`)
Crea motores que NO importan adapters específicos, solo usan la interfaz `IntegrationAdapter`:
- `export.ts`: Toma una fuente y devuelve un archivo (JSON/CSV).
- `migrate.ts`: Toma fuente y destino y mueve records en chunks.

### 🌊 Misión 6: Motor Peristáltico (`src/inngest/functions.ts`)
- Crea el workflow `process-peristaltic-job`.
- Debe manejar chunks, reintentos y actualizar el estado en la tabla `jobs` de Drizzle.

### 🕸️ Misión 7: Sistema Nervioso (API & Server Actions)
- `src/app/actions/execute.ts`: Server Action para invocación directa desde la UI.
- `src/app/api/actions/execute/route.ts`: Endpoint para Satélites externos.

### 🖼️ Misión 8: La Membrana (UI Agnostica)
- `src/components/fractal-viewer/`: Selector universal de fuentes (Notion, Sheets, Files).
- `src/components/widget-projector/`: Genera la UI automáticamente desde un `FieldSchema[]`.

---

## 🔐 VARIABLES DE ENTORNO REQUERIDAS
Asegúrate de que existan o solicita su creación:
- `NANGO_SECRET_KEY`
- `DATABASE_URL` (Postgres)
- `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY`
- `ANTHROPIC_API_KEY` (Para la capa de inteligencia)

---
**manten **
