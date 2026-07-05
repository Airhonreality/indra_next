# 🛰️ INDRA NEXT: PROTOCOLO DE CONSTRUCCIÓN SOBERANA (v3.0 - AGNOSTICISMO RADICAL)

## 0. MANIFIESTO DE SIMETRÍA
Estás construyendo una **Infraestructura de Flujos de Datos**. En este sistema, **NO EXISTE** la diferencia entre una migración, una sincronización o una exportación. Todo es un flujo de `Records` entre dos `Adapters`.

**REGLA DE ORO:** Un archivo JSON local es un Silo. Una base de datos de Notion es un Silo. El motor los trata con absoluta simetría.

---

## 1. NOMENCLATURA DEV UNIVERSAL (Estricta)
- **Silo/Plataforma** → `Integration`
- **Conector** → `Adapter`
- **Dato Normalizado** → `Record`
- **Propiedad del dato** → `Field`
- **Esquema** → `FieldSchema`
- **Motor de Movimiento** → `DataPipeline` (Agnóstico)
- **Lógica de Mapeo** → `Transformer`

---

## 2. ARQUITECTURA DE DESACOPLAMIENTO TOTAL

### A. Registro Dinámico (`src/core/registry.ts`)
- Implementa un `AdapterRegistry`. Cada adaptador se registra a sí mismo.
- La aplicación resuelve los adaptadores por ID. **PROHIBIDO** usar `if/else` para instanciar adaptadores.

### B. El Gran Puente (`src/core/engines/pipeline.ts`)
- **Única Misión:** Mover registros de `sourceAdapter` a `targetAdapter`.
- **Agnosticismo:** El motor no sabe qué silos está conectando. Solo conoce la interfaz `IntegrationAdapter`.
- **Transformación:** Recibe un objeto `Transformer` (opcional) para mapear campos.

---

## 3. MISIONES DE EJECUCIÓN

### 🧩 Misión 1: El Corazón (Registro y Tipos)
- Crea `src/core/registry.ts`.
- Valida que `src/core/types/integration.ts` sea la ley para todos los adaptadores.

### 🧩 Misión 2: Notion Adapter (`src/integrations/notion/`)
- Porta `_notion_flattenProperties` y `_notion_resolveRelationNames`.
- Usa `nango.proxy`.

### 🧩 Misión 3: Google Sheets Adapter (`src/integrations/google-sheets/`)
- Simetría total con Notion.

### 🧩 Misión 4: Local File Adapter (`src/integrations/local-file/`)
- Porta la lógica de `provider_json_atom.gs`.
- **IMPORTANTE:** Trata la lectura/escritura de archivos JSON/CSV locales como si fuera una API externa. Esto es lo que permite "exportar" de forma agnóstica.

### 🧩 Misión 5: Data Pipeline Engine (`src/core/engines/pipeline.ts`)
- El motor único. Debe ser capaz de mover datos entre CUALQUIER combinación de los adaptadores anteriores.

### 🧩 Misión 6: Motor Peristáltico (Inngest)
- Workflow `run-agnostic-pipeline`. Llama al Engine de forma durable.

### 🧩 Misión 7: La Membrana (UI Proyectada)
- `FractalViewer`: Lista fuentes de forma canónica.
- `WidgetProjector`: Genera UI desde `FieldSchema[]`. Sin formularios específicos por silo.

---

## 🛡️ PREVENCIÓN DE VICIOS Y REPROCESOS
- **No copies fallbacks de GAS:** Si una lógica de `.gs` es secuencial e ineficiente, úsala como base pero **optimízala** para Node.js (paralelismo).
- **Error Handling Ruidoso:** Cada error debe ser capturado y devuelto en un `OperationResult` con contexto claro.
- **Validación con Zod:** Antes de que un `Record` entre al Pipeline, debe ser validado contra el esquema.

---
**¿Entendido? Comienza analizando la inteligencia en `source_material/` y construye el Registro y el NotionAdapter como primeros bloques de la infraestructura.**
