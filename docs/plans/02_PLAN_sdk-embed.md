---
plan: 02_PLAN_sdk-embed
estado: BORRADOR
ejecutor: orquestador
depende_de: []
---

# 🏛️ Plan de Desarrollo: SDK Embed Axiomático
─────────────────────────────────────────────────────────────────────────────
**REPOSITORIO**: `indra-next-sovereign_A`
**DISEÑO BASE**: `INVS SDK embed.md` (Auditoría Compilada)
**ESTADO**: Plan de Desarrollo (Pre-Implementación)

---

## 🗺️ Contexto Actual del Repositorio

### Estructura Relevante Existente
```
src/
├── app/
│   ├── layout.tsx                          ← Layout raíz (Geist font, Providers con SessionProvider)
│   ├── globals.css                         ← Tokens CSS oklch (dark/light), Tailwind v4
│   ├── page.tsx                            ← Landing principal
│   ├── p/
│   │   ├── layout.tsx                      ← Layout público sin nav (bg-[#06070d])
│   │   └── [slug]/
│   │       ├── page.tsx                    ← Portal público de ingesta (usa registry)
│   │       └── ingestion-client.tsx        ← Cliente pesado: hashing, chunks, Wake Lock, IndexedDB
│   ├── api/
│   │   ├── p/[slug]/
│   │   │   ├── route.ts                   ← GET metadata del port
│   │   │   ├── session/route.ts           ← POST crear sesión resumible en Drive
│   │   │   ├── upload/route.ts            ← POST subir chunk binario
│   │   │   └── finalize/route.ts          ← POST finalizar sesión
│   │   └── integrations/                  ← CRUD de integraciones (Nango)
│   └── dashboard/                         ← Panel admin (no relevante para embed)
├── components/
│   ├── ingestion/
│   │   └── sovereign-ingestor.tsx         ← Widget de ingesta (cola simple, sin chunking)
│   ├── storage/
│   │   └── StorageWidgetClient.tsx        ← Explorador de archivos (AgnosticTree wrapper)
│   └── ui/
│       └── agnostic-tree.tsx              ← File picker por columnas (usa useInventory)
├── hooks/
│   ├── use-inventory.ts                   ← Hook de descubrimiento de archivos (fetch a /api/integrations)
│   └── use-ingestion-orchestrator.ts      ← Orquestador de subida (localStorage, resumable)
└── integrations/
    └── google-drive/adapter.ts            ← Adaptador Drive (Nango, Resumable Upload)
```

### Dependencias Clave del package.json
- **next**: `16.2.4` (App Router)
- **next-auth**: `5.0.0-beta.31` (SessionProvider en root layout)
- **@nangohq/node**: `0.70.1` (Gestión de tokens OAuth server-side)
- **exifr**: `7.1.3` (Extracción EXIF client-side)
- **zustand**: `5.0.13` (No usado en embed, pero disponible)
- **NO hay**: `jsonwebtoken`, `jose`, `penpal`, `zoid`, `iframe-resizer`

### Variables de Entorno Existentes
- `DATABASE_URL` (Neon PostgreSQL)
- `NANGO_SECRET_KEY`
- `AUTH_SECRET`
- `ENCRYPTION_SECRET`

---

## 📁 Archivos a Crear (Nuevos)

### Fase 1: Infraestructura del Embed

| # | Archivo | Propósito |
|---|---------|-----------|
| 1 | `src/app/embed/layout.tsx` | Layout mínimo dedicado para embeds. Sin `<Providers>` (sin SessionProvider de next-auth). Sin barras de navegación. Solo inyecta `globals.css` y las fuentes. Este layout es el que garantiza el aislamiento del embed respecto al shell de la app principal. |
| 2 | `src/app/embed/ingest/page.tsx` | Página del widget embebible. Componente `'use client'` que: (a) lee el token de la URL, (b) lo valida contra el endpoint de verificación, (c) inyecta variables CSS dinámicas del satélite, (d) renderiza `SovereignIngestor` con el contexto decodificado, (e) inicializa el puente `MessageChannel` con el ERP padre. |
| 3 | `src/app/api/embed/verify-token/route.ts` | Endpoint POST que recibe el JWT del satélite, lo verifica criptográficamente con `jose` (librería estándar de JWT para Edge Runtime), y devuelve el payload decodificado (slug, metadata, styling). |
| 4 | `src/lib/embed-protocol.ts` | Módulo compartido con las constantes del protocolo de comunicación: tipos de mensajes (`INDRA_HANDSHAKE_CLIENT`, `INDRA_HANDSHAKE_SERVER`, `INDRA_RESIZE`, `INDRA_INGEST_COMPLETE`, `INDRA_ERROR`), interfaces TypeScript de los payloads, y la función de validación de origen. Este archivo centraliza el "contrato de red" entre padre e hijo. |
| 5 | `src/hooks/use-embed-bridge.ts` | Hook `'use client'` que encapsula toda la lógica del protocolo de handshake MCP y el `MessageChannel`. Responsabilidades: (a) escuchar el mensaje inicial `INIT_COMMUNICATION` del padre, (b) capturar el `MessagePort` transferido, (c) instanciar un `ResizeObserver` en el `document.documentElement`, (d) emitir eventos de altura dinámica por el puerto, (e) exponer una función `emit(type, payload)` para que la página de embed pueda enviar `INGEST_COMPLETE` al padre. |

### Fase 2: Documentación del SDK para el Satélite

| # | Archivo | Propósito |
|---|---------|-----------|
| 6 | `docs/SDK_EMBED_INTEGRATION_GUIDE.md` | Guía de integración para el desarrollador del ERP satélite. Incluye: (a) cómo generar el JWT en su backend, (b) el snippet HTML/JS mínimo para montar el iframe con sandbox, (c) cómo escuchar eventos del `MessageChannel`, (d) referencia de todos los tipos de mensaje del protocolo. |

---

## ✏️ Archivos Existentes a Modificar

| # | Archivo | Modificación |
|---|---------|-------------|
| 1 | `next.config.ts` | Añadir cabeceras HTTP de seguridad para la ruta `/embed/*`: `Content-Security-Policy: frame-ancestors 'self' [dominios-autorizados]` y `X-Frame-Options: SAMEORIGIN` como fallback. El resto de rutas de Indra (`/dashboard`, `/p/*`) deben mantener `X-Frame-Options: DENY` para que nadie las pueda embeber. |
| 2 | `.env` | Añadir nueva variable `INDRA_EMBED_SHARED_SECRET` (clave simétrica compartida con el backend del ERP satélite para firmar y verificar JWTs). |
| 3 | `package.json` | Añadir dependencia `jose` (~3KB, runtime-agnostic, compatible con Edge Runtime de Next.js). **No** usar `jsonwebtoken` porque requiere Node.js crypto y no funciona en Edge Runtime. |

---

## 🚫 Antipatrones Prohibidos

### 1. No Reutilizar el Layout Raíz (`src/app/layout.tsx`)
**Por qué**: El layout raíz inyecta `<Providers>` con `<SessionProvider>` de next-auth. El embed no debe iniciar una sesión de autenticación propia; opera bajo el contexto del JWT del satélite. Inyectar SessionProvider dentro del iframe generaría cookies de terceros innecesarias (violación GDPR) y conflictos de sesión con el ERP padre.

**Solución**: El layout de `/embed/` debe ser completamente independiente. Solo inyecta fuentes y CSS.

### 2. No Usar `jsonwebtoken` (npm)
**Por qué**: El paquete `jsonwebtoken` depende del módulo nativo `crypto` de Node.js. Las API Routes de Next.js 16 pueden ejecutarse en Edge Runtime, donde `crypto` nativo no está disponible. Además, `jsonwebtoken` pesa ~35KB.

**Solución**: Usar `jose` (Web Crypto API, compatible con Edge y Node, ~3KB).

### 3. No Pasar Datos Sensibles por Query Params sin Firmar
**Por qué**: Si se pasa el `slug`, `userId` o `metadata` directamente en la URL del iframe (`?slug=billing&userId=123`), cualquier empleado puede alterar los valores en la barra del navegador (o en DevTools) y acceder a carpetas de Drive ajenas o suplantar identidades.

**Solución**: Todos los parámetros de contexto viajan encapsulados y firmados dentro del JWT. La URL del iframe solo transporta `?token=eyJ...`.

### 4. No Combinar `allow-scripts` + `allow-same-origin` en el Sandbox
**Por qué**: Documentado extensamente en la auditoría OWASP. Esta combinación permite al JavaScript del iframe acceder al DOM del padre, remover su propio sandbox y ejecutar código con privilegios completos sobre el ERP.

**Solución**: El sandbox del iframe debe ser estrictamente `sandbox="allow-scripts"` (sin `allow-same-origin`). Si Indra y el ERP comparten dominio, esta restricción es **obligatoria**.

### 5. No Usar `window.addEventListener('message')` Global para la Comunicación Post-Handshake
**Por qué**: El listener global de `message` captura todos los eventos `postMessage` de cualquier origen y cualquier script (extensiones del navegador, analytics, chatbots). Filtrar por origen es insuficiente; genera colisiones de eventos y es propenso a errores en ERPs con múltiples plugins.

**Solución**: El listener global se usa **solo** durante la fase de handshake (para intercambiar el `MessagePort`). Una vez transferido el puerto, toda la comunicación viaja exclusivamente por los puertos privados del `MessageChannel`, y el listener global se destruye.

### 6. No Instalar `iframe-resizer` ni `penpal` ni `zoid`
**Por qué**: 
- `iframe-resizer`: Declarada obsoleta oficialmente (abril 2026).
- `penpal`: Innecesaria para comunicación unidireccional de eventos simples. Añade 1.1KB de dependencia innecesaria.
- `zoid`: Sobreingeniería extrema, problemas de bfcache, ~30KB.

**Solución**: `MessageChannel` + `ResizeObserver` nativos del navegador (0KB de dependencias).

### 7. No Renderizar React Completo dentro del Iframe en Producción Futura
**Por qué**: El bundle de React + React DOM pesa ~45KB min+gzip. Para un file picker embebido, esto roza el límite de 50KB recomendado para proteger los Core Web Vitals (INP, LCP) del ERP.

**Solución (Fase 1)**: Aceptable usar React/Next.js porque el embed reutiliza componentes existentes del repo (`SovereignIngestor`, `AgnosticTree`) y la velocidad de desarrollo es prioritaria. **Fase futura (opcional)**: Si el performance budget se vuelve crítico, compilar una versión Vanilla JS del widget.

### 8. No Hardcodear `'*'` como Origen en `postMessage` en Producción
**Por qué**: Enviar mensajes con `targetOrigin: '*'` permite que cualquier página que embeba el iframe intercepte los datos de archivos subidos.

**Solución**: El origen del ERP autorizado se configura en `.env` (`INDRA_EMBED_ALLOWED_ORIGINS`) y se inyecta como `targetOrigin` explícito en cada `postMessage`.

---

## 📋 Desglose de Tareas (Ordenado por Dependencia)

### Tarea 1: Instalar `jose` y Configurar Variable de Entorno
- Añadir `jose` a `package.json`
- Añadir `INDRA_EMBED_SHARED_SECRET` y `INDRA_EMBED_ALLOWED_ORIGINS` a `.env`
- **Sin dependencias previas**

### Tarea 2: Crear `src/lib/embed-protocol.ts`
- Definir las interfaces TypeScript del protocolo de mensajería
- Definir los tipos de mensaje como constantes (`as const`)
- Definir la función `isAllowedOrigin(origin: string): boolean`
- **Sin dependencias previas**

### Tarea 3: Crear `src/app/api/embed/verify-token/route.ts`
- Importar `jose` para verificación de JWT
- Leer `INDRA_EMBED_SHARED_SECRET` de `process.env`
- Validar estructura del payload (slug, sub, metadata, styling)
- Retornar payload decodificado o error 401
- **Depende de**: Tarea 1

### Tarea 4: Crear `src/app/embed/layout.tsx`
- Layout mínimo: solo `<html>`, `<body>`, fuentes Geist, `globals.css`
- **Sin** `<Providers>`, **sin** `<SessionProvider>`
- Clase `dark` por defecto (el satélite puede sobrescribir vía JWT)
- **Sin dependencias previas**

### Tarea 5: Crear `src/hooks/use-embed-bridge.ts`
- Hook que gestiona el handshake MCP completo
- Inicia escucha global de `message` para capturar el `MessagePort`
- Valida el origen contra la lista autorizada
- Instancia `ResizeObserver` sobre `document.documentElement`
- Emite `INDRA_RESIZE` por el puerto privado en cada cambio de altura
- Expone `emit(type, payload)` para enviar eventos al padre
- Destruye el listener global tras completar el handshake
- **Depende de**: Tarea 2

### Tarea 6: Crear `src/app/embed/ingest/page.tsx`
- Lee `?token=` de los search params
- Llama a `/api/embed/verify-token` para validar
- Inyecta CSS custom properties dinámicas (`--primary`, clase `dark`)
- Renderiza `SovereignIngestor` con `slug` del payload verificado
- Usa `useEmbedBridge` para emitir `INGEST_COMPLETE` al padre
- **Depende de**: Tareas 3, 4, 5

### Tarea 7: Modificar `next.config.ts`
- Añadir headers de seguridad condicionados por ruta:
  - `/embed/:path*` → `Content-Security-Policy: frame-ancestors 'self' https://erp-autorizado.com`
  - Resto de rutas → `X-Frame-Options: DENY`
- **Depende de**: Tarea 6 (para poder testear)

### Tarea 8: Crear `docs/SDK_EMBED_INTEGRATION_GUIDE.md`
- Documentar: generación de JWT en el backend del satélite
- Documentar: snippet HTML mínimo con sandbox correcto
- Documentar: script JS del ERP para handshake y escucha de eventos
- Documentar: referencia de tipos de mensajes del protocolo
- **Depende de**: Todas las tareas anteriores (refleja la implementación final)

---

## 🗂️ Mapa Visual de Archivos Nuevos vs Existentes

```
src/
├── app/
│   ├── embed/                              ← 🆕 NUEVO directorio
│   │   ├── layout.tsx                      ← 🆕 Tarea 4
│   │   └── ingest/
│   │       └── page.tsx                    ← 🆕 Tarea 6
│   ├── api/
│   │   └── embed/
│   │       └── verify-token/
│   │           └── route.ts                ← 🆕 Tarea 3
│   ├── layout.tsx                          ← ⬜ SIN CAMBIOS
│   ├── globals.css                         ← ⬜ SIN CAMBIOS
│   └── p/                                  ← ⬜ SIN CAMBIOS
├── lib/
│   └── embed-protocol.ts                   ← 🆕 Tarea 2
├── hooks/
│   └── use-embed-bridge.ts                 ← 🆕 Tarea 5
├── components/
│   └── ingestion/
│       └── sovereign-ingestor.tsx          ← ⬜ SIN CAMBIOS (Se reutiliza tal cual)
│
next.config.ts                              ← ✏️ Tarea 7
.env                                        ← ✏️ Tarea 1
package.json                                ← ✏️ Tarea 1
docs/SDK_EMBED_INTEGRATION_GUIDE.md         ← 🆕 Tarea 8
```

---

## 🛡️ Restricciones Arquitectónicas Inmutables

1. **Cero librerías de iframe/comunicación**: Solo APIs nativas del navegador (`MessageChannel`, `ResizeObserver`, `postMessage`).
2. **Cero cookies de terceros**: El embed no debe escribir cookies propias. El contexto viaja por JWT en URL + MessagePort.
3. **Bundle < 50KB** (objetivo a futuro): Fase 1 acepta React. Fase 2 evaluará si se requiere un bundle Vanilla.
4. **Sandbox opaco obligatorio**: `sandbox="allow-scripts"` sin `allow-same-origin`.
5. **CSP `frame-ancestors`**: Solo los dominios registrados en `INDRA_EMBED_ALLOWED_ORIGINS` pueden embeber Indra.
6. **El embed NO hereda SessionProvider**: Tiene su propio layout independiente. El usuario del embed es identificado por el `sub` del JWT, no por una sesión de next-auth.
