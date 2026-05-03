# 01 | Arquitectura Técnica: Speculative Engine

> **Principios rectores:** Agnosticismo de datos · Modularidad de motores · Soberanía local · Compatibilidad INDRA OS

---

## I. Separación Canónica: Datos vs. Motor

El sistema se divide en dos reinos que nunca se fusionan:

| Territorio | Rol | Tecnología |
|---|---|---|
| **Montechico Notebook** (`/data/`) | Fuente de verdad. Caos creativo soberano. | Archivos `.mdx`, `.json`, `.svg`, activos de media (`/assets/`) |
| **Speculative Engine** (`/app/`) | Proyector. Lee, visualiza e **ingesta** hacia el Notebook. | Next.js + React |

**Ley de Oro:** El directorio `/data/` no contiene código. El directorio `/app/` no contiene contenido.

**Ley de Media:** Todo activo capturado (foto, imagen pegada, captura de URL) es enviado al directorio `/data/assets/` vía la API del Kernel. Nunca se guarda directamente en el frontend.

---

## II. Arquitectura en Capas (Niveles de Anclaje)

```
┌────────────────────────────────────────────────────────────┐
│  NIVEL 3: Simulation Plugins (INDRA OS Bridge)             │
├────────────────────────────────────────────────────────────┤
│  NIVEL 2: UI Engines — Graph · Canvas · Narrative          │
├────────────────────────────────────────────────────────────┤
│  NIVEL 1: Workspace Kernel                                 │
│    ├── /api/notebook  (Read/Write de notas)                │
│    └── /api/media     (Ingesta multi-vector de activos)    │
├────────────────────────────────────────────────────────────┤
│  NIVEL 0: Montechico Notebook (Local Data Source)          │
│    ├── /data/notes    (.mdx)                               │
│    ├── /data/assets   (imágenes, capturas, recortes)       │
│    └── /data/canvases (.tldr.json)                         │
└────────────────────────────────────────────────────────────┘
```

---

## III. Los 4 Motores del Speculative Engine

### Motor I: Workspace Kernel (El Ancla)
- **Rol:** Ingesta y ploteo del cuaderno local como API dinámica.
- **Tecnología:** Next.js Content Layer / Astro Content Collections.
- **Contrato:** Cada nota debe tener un `frontmatter` con `id`, `type`, `tags`, `mentions` y `status` (`draft` | `tagged` | `published`).
- **Output:** Dos endpoints base que todos los demás motores consumen:
  - `GET/POST /api/notebook` → CRUD de notas `.mdx`
  - `POST /api/media` → Ingesta multi-vector de activos de media

#### Sub-Módulo: Media Ingestion Layer
Permite capturar información desde cualquier contexto, del campo al escritorio:

| Vector de Ingesta | Mecanismo del Browser | Librería |
|---|---|---|
| **Drag & Drop de archivos** | `dragover` + `drop` events | `react-dropzone` |
| **URL web + metadatos OpenGraph** | Fetch al servidor → scraping | `open-graph-scraper` |
| **Copiar-Pegar imagen desde web** | `Clipboard API` (`paste` event) | Nativa del browser |
| **Cámara (fotos en campo)** | `getUserMedia` + `<input capture>` | Nativa del browser |
| **Etiquetado diferido** | `status: draft` en frontmatter | Ninguna (schema Zod) |

**Flujo del nodo huérfano (captura en campo sin etiquetar):**
```
📱 Foto capturada desde la UI
        ↓
Se guarda como /data/assets/[uuid].jpg
        ↓
Se crea automáticamente /data/notes/[uuid].mdx
con status: "draft" y tags: []
        ↓
El Graph Engine muestra un "nodo huérfano"
(burbuja sin conexiones) → Cola visual de trabajo pendiente
```
El usuario puede completar el etiquetado en el momento (campo) o después (escritorio) sin perder la captura.

### Motor II: Graph Engine (El Motor de Causalidad)
- **Rol:** Visualizar la red de relaciones entre notas y conceptos.
- **Tecnología:** [React Flow](https://reactflow.dev/) + D3.js para layout.
- **Input:** Lee los campos `mentions[]` del frontmatter de cada nota vía API del Kernel.
- **Agnosticismo:** El nodo de React Flow es un componente agnóstico; no sabe si lo que visualiza es investigación de diseño o código de INDRA.

### Motor III: Canvas Engine (El Motor de Caos Controlado)
- **Rol:** Lienzo infinito para bocetado libre y mapas mentales.
- **Tecnología:** [tldraw](https://tldraw.dev/).
- **Persistencia:** Los trazos se guardan como `/data/canvases/[id].tldr.json` en el Notebook local, sin pasar por la lógica del motor.
- **Integración:** Los marcos ("frames") del lienzo pueden exportarse como imágenes al Narrative Engine.

### Motor IV: Narrative Engine (El Motor de Storytelling)
- **Rol:** Vista unificada de texto enriquecido. Permite leer y editar notas desde la web.
- **Tecnología:** [Tiptap](https://tiptap.dev/) (para edición) + MDX (para renderizado estático).
- **Modo Híbrido:** Los cambios en la web se persisten de vuelta al archivo `.mdx` local mediante un API endpoint de escritura (`POST /api/notebook/[id]`).

---

## IV. El Adaptador de Contexto (El Anti-Esquizofrenia)

Para que los motores no pisen el estado del otro, se usa un `ContextAdapter`:

1. **Input Adapter:** Transforma el JSON crudo de la API del Kernel al modelo de datos de cada motor.
2. **Engine Dispatcher (Zustand):** Distribuye solo los fragmentos necesarios. El Graph solo ve grafo; el Canvas solo ve trazos.
3. **Cross-Sync (Yjs):** Si un nodo se mueve en el Graph Engine, su referencia en el Narrative Engine se actualiza en tiempo real.

---

## V. Puente INDRA OS (Compatibilidad Radical)

El Workspace Kernel expone contratos estandarizados compatibles con el `PublicAPI.gs` de INDRA CORE:

- Un "Atom" de investigación en Montechico **es** un Artifact de INDRA.
- El `SchemaRegistry` de INDRA puede validar el `frontmatter` de las notas de Montechico.
- El Speculative Engine puede "reportar" a INDRA igual que lo hacen los macro-motores de `INDRA_SKIN`.

```
Montechico Note (.mdx)
        ↓
Workspace Kernel API (/api/notebook)
        ↓
INDRA PublicAPI Bridge (on demand)
        ↓
INDRA SchemaRegistry (validation)
```
