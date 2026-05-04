# SME MASTER PLAN: Indra Sovereign Media Engine

## 1. Visión Técnica
Construir un sub-sistema de procesamiento multimedia hipereficiente, agnóstico y soberano capaz de manejar archivos de hasta 30GB (escalable a TB) con integridad total de datos y metadatos.

## 2. Axiomas Arquitectónicos (Estandar NASA)
- **Agnosticidad Radical**: El motor opera sobre buffers binarios puros. No conoce silos externos.
- **Protocolo Peristáltico (PUP)**: Fragmentación en chunks soberanos (2MB-5MB), envío rítmico (1 concurrente), e integridad por hash MD5/SHA.
- **Memoria Constante**: Uso de `File.slice()` y `Streams`. RAM máxima permitida: 50MB independientemente del tamaño del archivo.
- **Preservación Binaria**: Inyección quirúrgica de segmentos APP1 (imágenes) y átomos moov/udta (video) para compatibilidad con Adobe Premiere/Lightroom.

## 3. Componentes a Implementar

### A. Core Integrity Engine (`src/core/media/integrity.ts`)
- Lógica de fragmentación (Chunking).
- Generación de hashes por chunk y hash global.
- Verificación de integridad bit-perfect.

### B. Transcoder Worker (`src/workers/transcoder.worker.ts`)
- Uso de `WebCodecs` con aceleración por hardware.
- Integración de `mp4box.js` para manipulación de átomos.
- Generación de `Identity Map` (índice de frames) para navegación instantánea.
- Extracción de `Waveform Peak Map` para audio.

### C. Sovereign Pipeline (`src/core/media/pipeline.ts`)
- Orquestador de subida con Backoff exponencial y Circuit Breaker.
- Semáforo de cortesía (1 llamado concurrente).
- Manejo de sesiones reanudables (Idempotencia).

## 4. Manejo de Errores (Noisy Error Handling)
- Cada error debe devolver un `OperationResult` con:
  - Código de error único.
  - Contexto binario (en qué chunk falló).
  - Sugerencia de recuperación automática.

## 5. Antipatrones Prohibidos
- NO usar `ffmpeg.wasm` para archivos > 500MB.
- NO procesar media en el Main Thread.
- NO perder metadatos originales (UTC offsets, EXIF).
- NO duplicar memoria (usar Transferable Objects).

---
**Instrucción para Claude Code**: Ejecuta este plan con rigor absoluto. Empieza por la infraestructura de integridad y el worker. No aceptes código mediocre.
