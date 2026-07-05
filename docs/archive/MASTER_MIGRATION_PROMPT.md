# 🧠 PROMPT MAESTRO: MIGRACIÓN ESTRATÉGICA INDRA NEXT

**Instrucción para Claude Code:**
Estás actuando como un Arquitecto de Software Senior especializado en TypeScript y Node.js. Tu misión es portar la inteligencia acumulada en los proveedores de Google Apps Script (GAS) a la nueva arquitectura hexagonal de **Indra NEXT**.

## 1. CONTEXTO DEL SISTEMA
- **Arquitectura:** Hexagonal (Ports & Adapters).
- **Contrato Principal:** `src/core/types/integration.ts`.
- **Objetivo:** Desacoplar la lógica de Notion, Sheets y Drive de la plataforma GAS para que corra en Next.js (Serverless).

## 2. RECURSOS DISPONIBLES
- `docs/MASTER_SPEC.md`: La ley del proyecto.
- `src/core/types/`: Interfaces que DEBES implementar.
- `source_material/`: Contiene los archivos `.gs` originales con la lógica robusta de Indra OS v21.0.

## 3. TU MISIÓN (Paso a Paso)

### PASO A: Los Adapters (Músculos)
Debes crear los siguientes archivos implementando la interfaz `IntegrationAdapter` y extendiendo `BaseAdapter`:

1.  **Notion Adapter (`src/integrations/notion/`)**:
    - Porta la lógica de `_notion_flattenProperties` y `_notion_resolveRelationNames` de `provider_notion.gs`.
    - Usa `@notionhq/client` para las llamadas.

2.  **Google Sheets/Drive Adapter (`src/integrations/google-sheets/`)**:
    - Usa la librería `googleapis`.
    - Porta la lógica de mapeo de filas de `provider_sheets.gs`.
    - Implementa la navegación de carpetas de `provider_drive.gs`.

3.  **JSON Adapter (`src/integrations/json-file/`)**:
    - Implementa la lectura/escritura de archivos JSON planos siguiendo la lógica de `provider_json_atom.gs`.

### PASO B: Maquinaria Pesada (Peristaltismo y Orquestación)
Esta es la parte crítica para la robustez industrial del sistema. Revisa `source_material/industrial_engine/`:

1.  **Motor Peristáltico**: Porta la lógica de `peristaltic_service.gs`. En Next.js, esto se traduce en una arquitectura de **Job Queues** o **Throttling** para evitar timeouts en Vercel.
2.  **Orquestación Inteligente**: Revisa `pipeline_logic.gs`, `automation_logic.gs` y `intelligence_logic.gs`. Indra NEXT no solo migra; orquesta flujos (IF X THEN Y) usando IA para transformar la materia.

### PASO C: La Membrana (Store de Widgets Soberanos)
Siguiendo la filosofía de `source_material/INDRA_V12_WIDGET_PHILOSOPHY.md`:
- El Frontend NO es una aplicación monolítica; es un **Proyector de Widgets**.
- **Auto-Proyección**: Los widgets deben auto-montarse consultando el `Schema` de la acción en la API de Indra. Si una acción de "Subida Multimedia" requiere un API Key y una Carpeta, el widget proyecta esos campos automáticamente basándose en el JSON del esquema.
- Diseña componentes React en `src/components/widgets/` que sean desacoplados y puedan ser embebidos en cualquier sitio web externo.

### PASO D: Las Acciones (Cerebro)
Implementa `src/core/actions/migrate.ts`:
- Debe aceptar un `sourceAdapter` y un `targetAdapter`.
- Flujo: `getRecords` -> `mapFields` -> `pushRecords`.
- Debe ser agnóstico: no sabe si está moviendo de Notion a Sheets o de JSON a Notion.

### PASO C: La API (Sistema Nervioso)
Crea las rutas en `src/app/api/integrations/` y `src/app/api/actions/` para exponer estos métodos.

## 4. REGLAS INQUEBRANTABLES
- **No pierdas lógica:** Si el código original maneja errores específicos o hace limpiezas de strings (slugify), consérvalas en TypeScript.
- **Tipado Estricto:** Usa interfaces de TS para todo. Nada de `any`.
- **Agnosticidad:** Los adapters no se conocen entre sí. La orquestación solo ocurre en `core/actions/`.
- **Fail-Fast:** Si una conexión falla, devuelve un `OperationResult` con el error claro.

---
**¿Entendido? Analiza los archivos en `source_material/` y confirma que estás listo para empezar con el Notion Adapter.**
