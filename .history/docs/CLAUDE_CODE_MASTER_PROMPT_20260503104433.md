# 🛰️ INDRA NEXT: PROTOCOLO DE CONSTRUCCIÓN SOBERANA (v3.0)
## 🎯 OBJETIVO: AGNOSTICISMO RADICAL Y SIMETRÍA TOTAL

Estás actuando como un Arquitecto de Software Senior. No estás construyendo una "app de integraciones", estás construyendo una **Infraestructura de Flujos de Datos Agnósticos**. 

**AXIOMA CENTRAL:** El sistema no diferencia entre una migración entre nubes, una exportación a archivo o una sincronización. Todo es un **Data Pipeline** entre dos **Adapters**.

---

## 1. REGLAS DE NOMENCLATURA (Dev Universal)
PROHIBIDO usar términos místicos en el código. Cumplir estrictamente:
- **Silo/Plataforma** → `Integration`
- **Conector** → `Adapter`
- **Dato Normalizado** → `Record`
- **Propiedad del dato** → `Field`
- **Esquema** → `FieldSchema`
- **Motor de Movimiento** → `Pipeline`
- **Lógica de Mapeo** → `Transformer`

---

## 2. ARQUITECTURA DE DESACOPLAMIENTO CRÍTICO

### A. El Registro de Adaptadores (`src/core/registry.ts`)
- Implementa un patrón **Registry**. Los adaptadores se registran a sí mismos.
- El sistema NO usa `if/else` para elegir adaptadores. Los resuelve dinámicamente por ID.

### B. El Motor de Pipeline (`src/core/engines/pipeline.ts`)
- **Única Responsabilidad:** Mover datos entre un `sourceAdapter` y un `targetAdapter`.
- **Inyección de Transformadores:** El motor no sabe mapear campos. Recibe un objeto `Transformer` que indica la lógica de conversión.
- **Simetría:** Un archivo JSON local es un `Adapter`. Una base de datos de Notion es un `Adapter`. El motor los trata exactamente igual.

### C. Los Músculos Inteligentes (`src/integrations/`)
Cada carpeta (`notion`, `google-sheets`, `json-file`) contiene su propio `adapter.ts`.
- **Autonomía:** El adapter contiene TODA la lógica de su silo (flattening, schema, traducción).
- **Aislamiento:** Un adapter nunca importa a otro ni sabe que el otro existe.

---

## 3. MISIONES DE EJECUCIÓN (Claude Code)

### 🧩 Misión 1: Registro y Contratos
- Crea `src/core/registry.ts` para la resolución dinámica de adaptadores.
- Asegura que `src/core/types/integration.ts` sea la ley absoluta.

### 🧩 Misión 2: Notion Adapter (`src/integrations/notion/`)
- Porta la inteligencia de `provider_notion.gs`.
- Usa `nango.proxy` para conectividad.
- Implementa `getSchema()` y `flattenProperties()`.

### 🧩 Misión 3: Google Sheets Adapter (`src/integrations/google-sheets/`)
- Simetría total con Notion. Gestión de filas como `Records`.

### 🧩 Misión 4: JSON/File Adapter (`src/integrations/json-file/`)
- **CRÍTICO:** Trata al sistema de archivos local como un Silo más. 
- Permite que el motor de Pipeline "migre" datos a un archivo `.json` como si fuera otra nube.

### 🧩 Misión 5: Data Pipeline Engine (`src/core/engines/pipeline.ts`)
- Crea el motor agnóstico de bombeo de datos.
- Debe soportar procesamiento por Chunks (para delegar a Inngest si es necesario).

### 🧩 Misión 6: Motor Peristáltico (Inngest)
- Workflow `run-agnostic-pipeline`: Recibe source, target y transformer.
- Ejecuta el motor de Pipeline de forma durable.

### 🧩 Misión 7: UI de Proyección (La Membrana)
- `FractalViewer`: Renderiza cualquier Silo basado en lo que devuelva `listSources()`.
- `WidgetProjector`: Genera formularios dinámicos basados en `FieldSchema[]`. No hay formularios para "Notion" o "Sheets", hay proyecciones de esquemas.

---

## 🔐 PREVENCIÓN DE REPROCESOS (Audit)
- **Error Handling:** Cada fallo debe devolver un `OperationResult` ruidoso y claro.
- **No Fallbacks:** Si un patrón de GAS es ineficiente en Node.js, **REFACTORIZA**. Usa concurrencia real (`Promise.all`).
- **Validación:** Usa Zod para validar que los datos cumplen el `FieldSchema` antes de entrar al Pipeline.

---
**¿Entendido? Comienza construyendo el Registro y el NotionAdapter basándote en la inteligencia de `source_material/`.**
