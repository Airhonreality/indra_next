# IPW MASTER PLAN: Ingestion Port Widget

## 1. Visión Técnica
Crear un sistema de "Puertos de Ingesta" públicos que permitan a terceros (sin cuenta de Indra) subir archivos masivos directamente a los silos del Admin (Drive/Notion), organizados automáticamente por metadatos y campos personalizados.

## 2. Componentes del Sub-Sistema

### A. Persistencia (`src/core/db/schema.ts`)
Añadir tabla `ingestion_ports`:
- `id`: UUID (Primary Key).
- `integrationId`: UUID (Relación con `integrations`).
- `targetPath`: string (Ruta base en el silo).
- `config`: JSONB (Reglas de organización: `{pattern: '{field}/{date}'}`).
- `schema`: JSONB (Campos personalizados para el formulario público).
- `slug`: string (URL amigable única).

### B. Port Designer (Admin UI)
- Componente `src/components/ports/port-designer.tsx`.
- Integración con el `MediaEngine` para previsualizar cómo se organizarían los archivos.
- Generador de Links Públicos con copia a portapapeles.

### C. Public Ingestion Page (`src/app/p/[slug]/page.tsx`)
- UI desacoplada del dashboard principal (Layout limpio).
- Formulario dinámico basado en el `schema` del puerto.
- Integración nativa con `src/core/media/engine.ts` (SME) para:
  - Procesamiento de archivos TB-level.
  - Extracción de metadata instantánea.
  - Subida peristáltica al `MediaVaultBridge`.

## 3. Axiomas de Resiliencia y Usabilidad (UX Cognitiva)

### A. Screen Wake Lock & Tab Persistence
- Implementar **Screen Wake Lock API** para evitar que el móvil se apague durante la transcodificación.
- **Visibility Detection**: Si el usuario cambia de pestaña, el sistema debe pausar y, al volver, lanzar un estado de "Reactor en Alerta" (pulsos visuales de color) para re-capturar la atención del usuario y re-solicitar el bloqueo de pantalla.

### B. Sistema "Smart-Match" de Resubida
- **Identidad Única**: Generar un `Sovereign_File_ID` basado en `[name + size + lastModified]`.
- **Persistent State**: Guardar un JSON de sesión en `IndexedDB` con el estado de cada chunk y metadatos.
- **Re-vinculación Automática**: Si la sesión se interrumpe, al volver a arrastrar los archivos, el sistema hace un match por ID y solo pone en cola los chunks faltantes, evitando duplicidad de data en TB.

### C. Interfaz de "Procesamiento Crítico"
- **Warning Pre-vuelo**: Alertas claras sobre el volumen de datos ("Estás por subir 50GB, esto tomará X tiempo. Recomendamos conexión estable y cargador").
- **Visual Feedback**: La UI debe simular un "estado de carga crítica" (efectos de reactor, barras de progreso de alta precisión, velocidad real en Mbps).

## 4. Motor de Organización Paramétrica (Agnosticismo de Ruta)
El sistema NO impone rutas. La ruta final es una proyección de un template configurable:

1. **Template Definition**: El Admin define un patrón en `config.pattern` (ej: `/{proyecto}/{capture_date}/{uploader}`).
2. **Dynamic Resolution**:
   - **Placeholders de Esquema**: `{proyecto}` se mapea automáticamente a un campo del Formulario Ingesta.
   - **Placeholders de Metadata**: `{capture_date}` se mapea automáticamente a la metadata extraída por el SME.
3. **Procesamiento de Ruta**:
   - Si un placeholder no tiene valor, se colapsa (no crea carpeta vacía).
   - Si no hay template, el destino es el `targetPath` plano.
4. **Zero-Hardcoding**: La UI pública no conoce campos fijos. Genera los `Inputs` iterando el objeto `schema` persistido en la DB.

## 6. Especificación de Componentes (Tactile UI/UX Spec)

### [A] El Contenedor "Reactor" (Layout Principal)
- **Visual Status**: Pulso rítmico perimetral durante la subida (Reactor Mode).
- **Control Global**: 
  - `Limpiar Sesión`: Borra caché de chunks en IndexedDB y resetea cola.
  - `Global Progress`: Barra de progreso total del lote (TB-Aware).

### [B] La Tarjeta de Asset (Sovereign Card)
Cada archivo se trata como una unidad de alta prioridad:
- **Header**: 
  - Miniatura (SME-Generated).
  - Nombre + Metadata de origen (Extraída del binario, no del objeto File).
- **Body**: 
  - `Progress Bar`: Basada en confirmación de Chunks (Chunk N/Total).
  - `Status Badge`: [Procesando...] -> [Subiendo...] -> [Verificando...] -> [OK en Drive].
- **Footer (Controles de Acción)**:
  - `Eliminar`: Cancela subida y limpia disco local.
  - `Edit Metadata`: Permite re-mapear campos personalizados para ese archivo específico.
- **Handshake de Éxito**: El icono de "OK" verde solo aparece tras la respuesta 200 del `MediaVaultBridge` confirmando persistencia final en el Silo.

### [C] Panel de Alertas Cognitivas
- **Inyección de Avisos**:
  - `Night Mode Suggestion`: Si el volumen > 10GB, sugerir subida nocturna.
  - `Tab Persistence Alert`: Aviso sonoro/visual si se detecta pérdida de foco de pestaña.

---
**Instrucción para Claude Code**: Implementa la UI siguiendo la estética de "Reactor Químico". Cada tarjeta de video debe ser resiliente y permitir la gestión individual (eliminar/mapear). El estado de éxito debe ser verificado contra el Drive real.
