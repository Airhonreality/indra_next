# 03 | Plan de Instalación y Prevención de Entropía de Proyecto

> **Objetivo:** Instalar el stack del Speculative Engine en orden quirúrgico, evitando inconsistencias y dependencias circulares que fragmenten el codebase.

---

## I. Principios de Instalación (Las Leyes Antes del Código)

Antes de instalar una sola librería, establecemos las leyes del proyecto:

1. **Ley de Capa Única:** Cada librería existe en una sola capa. No se repite la misma funcionalidad en dos librerías distintas.
2. **Ley del Adaptador:** Ningún componente de UI importa una librería externa directamente. Lo hace a través de un módulo `adapter/` que la abstrae.
3. **Ley del Estado Global:** No existe `useState` para datos compartidos. Todo pasa por **Zustand**. La fuente de verdad es única.
4. **Ley del Contrato Primero:** Antes de implementar un motor, se define su esquema de datos con **Zod**. El contrato existe antes que el código.

---

## II. Estructura de Directorios (El ADN del Proyecto)

Crear esta estructura **antes** de comenzar a instalar librerías:

```
/speculative-engine
├── /data                   # Notebook local (NO es código)
│   ├── /notes              # Archivos .mdx del cuaderno
│   ├── /assets             # Imágenes, capturas, recortes (drag, cámara, clipboard)
│   ├── /canvases           # Archivos JSON del Canvas Engine
│   └── /schemas            # Contratos Zod del frontmatter
│
├── /app                    # Next.js App Router
│   ├── /api
│   │   ├── /notebook       # GET y POST de notas .mdx
│   │   └── /media          # Media Ingestion Layer
│   │       ├── /upload     # POST: drag & drop, cámara
│   │       ├── /scrape-url # POST: URL + metadatos OpenGraph
│   │       └── /clipboard  # POST: imagen pegada
│   └── /workspace          # UI principal
│
├── /components
│   ├── /engines            # Un directorio por motor
│   │   ├── /graph          # Graph Engine
│   │   ├── /canvas         # Canvas Engine
│   │   └── /narrative      # Narrative Engine
│   └── /media-ingestion    # Componentes de captura (DropZone, CameraCapture, UrlScraper)
│
├── /adapters               # Puentes hacia librerías externas
│   ├── reactflow.adapter.ts
│   ├── tldraw.adapter.ts
│   ├── tiptap.adapter.ts
│   └── media.adapter.ts    # Abstrae react-dropzone y Clipboard API
│
└── /store                  # Zustand Store (Estado Global)
    ├── workspace.store.ts
    └── ingestion.store.ts  # Estado de la cola de ingesta y nodos huérfanos
```

---

## III. Plan de Instalación por Fases

### Fase 0: La Cimentación (NUNCA saltarse este paso)
Instalar las leyes del sistema **antes** que cualquier motor visual.

```bash
# Framework base
npx create-next-app@latest speculative-engine --typescript --app --tailwind --eslint

# Estado global (La Ley)
npm install zustand

# Validación de contratos (Los Esquemas)
npm install zod

# Estilo y UI base
npm install tailwindcss postcss autoprefixer
```

**Punto de verificación:** La app corre en `localhost:3000` con rutas vacías y Zustand configurado. No continuar hasta que este paso sea estable.

---

### Fase 1: El Workspace Kernel (El Ancla)
Instalar la capacidad de leer y servir el cuaderno local.

```bash
# Lector de archivos MDX para Next.js
npm install contentlayer next-contentlayer

# Parser de frontmatter
npm install gray-matter

# Renderizador MDX
npm install @next/mdx @mdx-js/loader @mdx-js/react
```

**Punto de verificación:** El endpoint `/api/notebook` devuelve correctamente un JSON con las notas del directorio `/data/notes`. No continuar hasta que la API funcione.

---

### Fase 1.5: El Media Ingestion Layer (Versatilidad de Captura)
Instalar **justo después** del Kernel y antes de los motores visuales. Esta capa alimenta de activos a todo el sistema.

```bash
# Drag & Drop de archivos
npm install react-dropzone

# Scraping de metadatos OpenGraph desde URLs web
npm install open-graph-scraper

# Subida de archivos al servidor (manejo de multipart/form-data)
npm install formidable
# (si se prefiere alternativa más moderna)
npm install @fastify/multipart
```

> **Nota:** La captura por cámara (`getUserMedia`) y el pegado desde portapapeles (`Clipboard API`) son nativas del browser. No requieren librerías externas; se implementan directamente en el `media.adapter.ts`.

**Flujo de verificación por vector:**
- [ ] **Drag & Drop:** Arrastrar un `.jpg` a la UI → aparece en `/data/assets/` con su nota draft.
- [ ] **URL + OpenGraph:** Pegar una URL de artculo → se captura título, descripción e imagen de preview y se crea una nota draft.
- [ ] **Clipboard:** Copiar imagen de una web, `Ctrl+V` en la UI → aparece en `/data/assets/` como nota draft.
- [ ] **Cámara:** En móvil, botton "📷 Capturar" abre la cámara nativa → foto guardad en `/data/assets/` con nota draft.

---

### Fase 2: El Graph Engine (Causalidad Visual)
Solo instalar cuando el Kernel tiene datos para alimentar el motor.

```bash
npm install reactflow
npm install d3  # solo si se requiere layout personalizado
```

**Punto de verificación:** El Graph Engine renderiza nodos desde el JSON del Kernel. No debe tener estado local propio.

---

### Fase 3: El Canvas Engine (Caos Controlado)
Instalar en aislamiento total, nunca antes del Kernel.

```bash
npm install tldraw
```

**Punto de verificación:** tldraw persiste sus datos en `/data/canvases/[id].json` vía el Kernel. No debe usar `localStorage` directamente.

---

### Fase 4: El Narrative Engine (Storytelling)
El último motor en instalarse, porque depende de que los otros estén estables.

```bash
npm install @tiptap/react @tiptap/pm @tiptap/starter-kit
```

**Punto de verificación:** El editor puede leer y escribir un archivo `.mdx` del directorio `/data/notes` vía la API del Kernel.

---

### Fase 5 (Opcional): Colaboración en Tiempo Real
Solo si se requiere trabajo multiusuario en sesiones simultáneas.

```bash
npm install yjs y-indexeddb y-webrtc
```

---

## IV. Vectores de Esquizofrenia y su Prevención

| Vector de Entropía | Síntoma | Prevención |
|---|---|---|
| **Estado duplicado** | Un motor guarda en `useState` lo que ya está en Zustand | Regla de linting: prohibir `useState` en componentes de engine |
| **Importación directa** | Un componente de UI importa `reactflow` directamente | Todos los imports pasan por `/adapters/` |
| **Datos sin contrato** | Una nota `.mdx` tiene un campo nuevo que rompe el Graph | Validar todo frontmatter con el Schema Zod de `/data/schemas/` |
| **Librerías duplicadas** | Instalar `framer-motion` Y `gsap` para animaciones | Definir una sola librería de animación en el ADR del proyecto |
| **Fugas de persistencia** | tldraw guarda en `localStorage` y también en `/data/` | El adaptador de tldraw desactiva el storage nativo y redirige al Kernel |
| **Media sin contrato** | Una imagen se guarda en `/data/assets/` sin nota `.mdx` asociada | El `POST /api/media/upload` siempre crea la nota draft automáticamente |
| **Metadatos perdidos** | Una URL scrapeada pierde su origen | El frontmatter include siempre `source_url` y `og_data` del scraping |
| **Cámara sin feedback** | El usuario captura una foto y no sabe si se guardó | El `ingestion.store.ts` mantiene lista de activos pendientes visible en la UI |

---

## V. Checklist de Salud del Proyecto (Ejecutar en cada iteración)

- [ ] `npm run build` completa sin errores.
- [ ] El directorio `/data/` no contiene ningún archivo `.ts` o `.tsx`.
- [ ] El directorio `/adapters/` no contiene lógica de negocio, solo traducción de datos.
- [ ] El Zustand Store no tiene más de 3 slices activos.
- [ ] Todos los endpoints de `/api/notebook` tienen validación Zod.
