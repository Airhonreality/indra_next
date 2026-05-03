# ADR-036: Peristaltic Upload Protocol (PUP)

- **Estado**: PROPUESTO
- **Fecha**: 2026-04-01
- **Autores**: Arquitecto Soberano + Antigravity
- **Módulos Afectados**: `apps/ingesta/EmergencyIngest.jsx`, `services/multimedia_core/`, `core/0_gateway/api_gateway.js`
- **Contexto de Origen**: Taller de Tejido Territorial — Barichara, 2026

---

## 1. Contexto y Problema

Durante el despliegue del formulario de recopilación documental para el taller de Bio-Inspiración en Barichara, se identificó una falla estructural en la arquitectura de carga de archivos multimedia:

El sistema actual trata cada archivo como una **unidad monolítica**. El pipeline completo es:

```
Archivo → RAM completo → Compresión completa → Base64 completo → 1 llamada HTTP gigante → Drive
```

Este diseño colapsa bajo condiciones reales de campo:
- Dispositivos móviles con 3-4GB de RAM compartida no pueden sostener el archivo completo en memoria durante la transcodificación.
- Una sola llamada HTTP con 5GB de base64 viola los límites de ejecución de GAS (6 minutos máximo).
- La pérdida de conexión en cualquier punto del proceso implica pérdida total del progreso.
- El progreso reportado al usuario es estimado, no real (el 33% puede durar horas sin moverse).
- Con 5 participantes simultáneos subiendo 5GB cada uno, el sistema enfrenta 25GB de demanda concurrente con cero tolerancia a fallos.

**Ningún sistema natural transfiere información compleja en un solo bloque.** El DNA no se replica en un paso. El sistema nervioso no transmite señales como un volcado masivo. TCP/IP fragmenta y verifica cada paquete individualmente.

---

## 2. Decisión

Se adopta el **Peristaltic Upload Protocol (PUP)**: una arquitectura de carga inspirada en el movimiento peristáltico biológico — compresión progresiva, por segmentos, verificada, reanudable.

**Axioma Central:**
> Ningún archivo entra completo a la memoria del dispositivo ni a una sola llamada de red. Cada archivo es una secuencia de paquetes soberanos. Cada paquete puede ser enviado, verificado, fallado y reintentado de forma completamente independiente.

**Corolario de Campo:**
> El sistema debe ser ecológicamente compatible con su entorno de despliegue. En zonas rurales con señal intermitente, el proceso de subida es un servicio de fondo, no una ceremonia de espera. El usuario deposita los archivos y continúa su vida. El sistema los entrega inevitablemente.

---

## 3. Diseño Axiomático

### Ley 1: Soberanía del Chunk
Cada segmento del archivo (chunk de 2MB) es una unidad completamente autónoma. Tiene su propio identificador, su propio hash de integridad, y su propio ciclo de vida (PENDING → SENDING → CONFIRMED | FAILED). El estado global de un archivo es únicamente la suma del estado de sus chunks.

### Ley 2: Persistencia en Disco (No en RAM)
Los archivos seleccionados se escriben inmediatamente en IndexedDB (disco del navegador, capacidad de gigabytes). La RAM del dispositivo permanece libre para el proceso de lectura-envío de un chunk a la vez. El límite de memoria del sistema es el tamaño de un chunk, no el tamaño del archivo.

### Ley 3: Semáforo de Cortesía (1 concurrent per device)
Cada dispositivo mantiene un semáforo interno: máximo 1 chunk viajando a GAS en cualquier momento. Esto limita la contribución de cada usuario a 1 llamada concurrente simultánea. Con 5 participantes, GAS recibe máximo 5 llamadas concurrentes — dentro de su límite operativo cómodo.

### Ley 4: Jitter Estocástico de Arranque
Al iniciar el proceso de subida, cada dispositivo espera un tiempo aleatorio entre 0 y 10 segundos antes de enviar el primer chunk. Esto convierte el peor escenario (todos presionan "subir" simultáneamente) en una ola escalonada que GAS procesa sin saturación.

### Ley 5: Idempotencia por Hash
Cada chunk incluye su hash MD5 en el payload hacia GAS. Si el mismo chunk llega dos veces (por reintento del cliente), GAS detecta el hash duplicado y responde éxito sin escribir dos veces. Los reintentos son completamente seguros.

### Ley 6: Circuit Breaker con Cooling
Tras 5 chunks consecutivos fallidos, el cliente entra en modo cooling por 60 segundos. Al reanudar, envía un chunk pequeño de prueba antes de restaurar el ritmo normal. Esto protege a GAS de ataques de reintentos desde dispositivos con problemas de red.

### Ley 7: Adaptación de Tamaño de Chunk
El sistema mide el tiempo de confirmación de cada chunk. Si el promedio es menor a 2 segundos durante 5 chunks consecutivos, incrementa el tamaño a 3MB. Si supera 8 segundos, reduce a 512KB. El sistema se autorregula sin intervención humana.

### Ley 8: Comunicación Radical con el Usuario
El spinner de carga es inaceptable como única retroalimentación. El sistema debe comunicar en todo momento: qué archivo está procesando, cuántos chunks faltan, velocidad actual de subida, estimación de tiempo restante basada en medición real, y mensajes contextuales según la condición de red detectada.

---

## 4. Arquitectura del Sistema

### 4.1 Pipeline por Tipo de Medio

**Imágenes:**
```
File → IndexedDB → Canvas.toBlob() (calidad 0.75, max 1920px) → Chunks → GAS → Drive
```
Compresión nativa del navegador. Sin Workers. Sin WebAssembly. Una foto de 8MB queda en ~400KB. Es paralelo al envío de video.

**Videos:**
```
File → IndexedDB → Chunks sin modificar → GAS → Drive
```
Los teléfonos modernos graban en H.264/HEVC, que es exactamente el formato canónico deseado. Re-encodificar es trabajo redundante que explota la RAM sin beneficio real. Se documenta el formato original en los metadatos del registro Sheet.

**Audio:**
```
File → IndexedDB → Chunks sin modificar → GAS → Drive
```
Mismo razonamiento que video.

### 4.2 Flujo de Sesión

```
1. Usuario selecciona archivos
   → Escritura inmediata a IndexedDB
   → Generación de session_id local (UUID)
   → UI confirma archivos recibidos ("3 archivos listos para enviar")

2. Usuario presiona "Enviar"
   → Jitter aleatorio (0-10s)
   → Llamada de pre-señalización a GAS:
      { protocol: 'EMERGENCY_INGEST_INIT', uploader, contact, files_manifest }
   → GAS crea carpetas en Drive, devuelve session_id confirmado

3. Para cada archivo, secuencialmente:
   → Comprimir si es imagen (Canvas, síncrono, rápido)
   → Dividir en chunks de 2MB
   → Para cada chunk:
      a. Calcular MD5 del chunk
      b. Enviar a GAS: { session_id, file_id, chunk_index, chunk_total, md5, data_base64 }
      c. GAS verifica MD5, escribe chunk en Drive, devuelve confirmación
      d. Actualizar UI con progreso real
      e. Si falla: espera exponencial (2^n segundos) y reintenta hasta 3 veces
      f. Si falla 5 chunks consecutivos: Circuit Breaker, cooling 60s

4. Cuando todos los chunks de un archivo son confirmados:
   → GAS finaliza el archivo en Drive (consolida chunks)
   → GAS registra fila en REGISTRO_SUBIDAS_BARICHARA Sheet
   → UI marca el archivo como completado

5. Al finalizar todos los archivos:
   → Limpiar IndexedDB
   → Mostrar reporte final (archivos exitosos / fallidos)
   → Ofrecer opción de reintento para fallidos
```

### 4.3 Recuperación de Sesión

Al iniciar la aplicación, el sistema verifica IndexedDB en busca de sesiones incompletas. Si las encuentra, muestra un banner:

> "Tienes archivos pendientes de una sesión anterior. ¿Deseas reanudar la subida?"

El usuario puede reanudar desde el último chunk confirmado sin repetir trabajo ya realizado.

---

## 5. Contrato de Comunicación GAS

### EMERGENCY_INGEST_INIT
```json
{
  "protocol": "EMERGENCY_INGEST_INIT",
  "data": {
    "uploader": "Nombre del participante",
    "contact": "celular o email",
    "date": "2026-04-02",
    "files_manifest": [
      { "file_id": "uuid", "filename": "video.mp4", "total_size": 524288000, "total_chunks": 250, "mime_type": "video/mp4" }
    ]
  }
}
```
**Respuesta:** `{ session_id, folder_url }`

### EMERGENCY_INGEST_CHUNK
```json
{
  "protocol": "EMERGENCY_INGEST_CHUNK",
  "data": {
    "session_id": "uuid-sesion",
    "file_id": "uuid-archivo",
    "chunk_index": 4,
    "chunk_total": 250,
    "md5": "a1b2c3d4...",
    "data_base64": "..."
  }
}
```
**Respuesta:** `{ status: "CONFIRMED", chunk_index: 4 }` o `{ status: "DUPLICATE" }` o `{ status: "HASH_MISMATCH" }`

### EMERGENCY_INGEST_FINALIZE
```json
{
  "protocol": "EMERGENCY_INGEST_FINALIZE",
  "data": {
    "session_id": "uuid-sesion",
    "file_id": "uuid-archivo"
  }
}
```
**Respuesta:** `{ status: "OK", drive_url, sheet_row_id }`

---

## 6. Sistema de Retroalimentación Inteligente (UX Comunicativa)

El spinner genérico es una mentira de interfaz. El sistema PUP reemplaza el spinner con un **panel de estado consciente del contexto**:

### Estados del Panel y Mensajes Adaptativos

| Condición Detectada | Mensaje al Usuario |
|:--------------------|:-------------------|
| Velocidad > 2 Mbps, archivos pequeños | "Subiendo en buenas condiciones. Listo en aproximadamente X minutos." |
| Velocidad 500Kbps - 2Mbps | "Señal moderada. Tus archivos llegarán en aproximadamente X hora(s). Puedes guardar el teléfono." |
| Velocidad < 500Kbps | "Señal débil — el proceso continuará en segundo plano. Puede tomar hasta 3 horas. No necesitas mantener la pantalla encendida." |
| Chunk reintentando (1-3) | "Reconectando con el servidor... reintentando." |
| Circuit Breaker activo | "Pausa temporal por señal inestable. Retomando en 60 segundos automáticamente." |
| Sesión reanudada | "Retomando sesión anterior desde donde se quedó. 3 archivos pendientes." |
| Archivo completado | "✓ [nombre del archivo] — guardado en el repositorio." |
| Todos completados | "Sesión finalizada. [N] archivos registrados en el repositorio documental." |

### Componentes del Panel de Progreso

```
┌─────────────────────────────────────────────────┐
│  ARCHIVO ACTUAL: entrevista_campo_1.mp4          │
│  ████████████░░░░░░░░░ 60% (Chunk 150 de 250)   │
│  Velocidad: 1.2 Mbps · Faltan ~8 minutos         │
│                                                   │
│  EN COLA:                                         │
│  ✓ foto_telar_001.jpg   — Enviado                │
│  ⟳ entrevista_campo_1.mp4 — Enviando...          │
│  ○ panoramica_taller.mp4 — En espera             │
│                                                   │
│  "Señal moderada. Puedes guardar tu teléfono,    │
│   el proceso continuará en segundo plano."        │
└─────────────────────────────────────────────────┘
```

---

## 7. Análisis de Estrés: 5 Participantes × 5GB Simultáneos

### Proyección de Carga sobre GAS

Con Semáforo de Cortesía (1 chunk concurrente por dispositivo):

| Parámetro | Valor |
|:----------|:------|
| Chunk size base | 2MB |
| Chunks por GB | 500 |
| Chunks por participante (5GB) | 2,500 |
| Chunks totales (5 participantes) | 12,500 |
| Llamadas GAS concurrentes máximas | 5 |
| Tiempo estimado por chunk (señal rural) | 3-8 segundos |
| Tiempo total estimado | 2-6 horas en segundo plano |

GAS nunca recibe más de 5 llamadas simultáneas. Su límite de concurrencia segura es 20-30. El sistema opera con margen cómodo incluso en el peor escenario.

### Proyección de Memoria en Dispositivos Móviles

| Componente | RAM utilizada |
|:-----------|:-------------|
| Archivo en IndexedDB | 0 (disco) |
| Chunk activo en proceso | ~2.67MB (base64 de 2MB) |
| Motor de compresión de imagen | ~15MB (Canvas) |
| **Total máximo en RAM** | **~18MB** |

Comparado con el sistema actual que requería cargar el archivo completo (potencialmente 500MB+), esto representa una reducción del 97% en presión de memoria.

---

## 8. Resiliencia por Tipo de Fallo

| Fallo | Mecanismo de Respuesta | Pérdida de Datos |
|:------|:----------------------|:-----------------|
| Señal cae 30 minutos | Reanuda desde último chunk confirmado | Ninguna |
| Dispositivo entra en suspensión | Service Worker mantiene estado | Ninguna |
| GAS devuelve 429 (rate limit) | Backoff exponencial automático | Ninguna |
| Chunk llega corrupto | Hash MD5 detecta diferencia, reenvío automático | Ninguna |
| GAS timeout (>6 min) | Imposible: chunks de 2MB jamás superan 6 min | Ninguna |
| 5 chunks consecutivos fallan | Circuit Breaker + cooling 60s | Ninguna |
| Reintento de chunk ya confirmado | Idempotencia por hash MD5 | Ninguna |
| Cierre accidental del navegador | IndexedDB persiste, UI ofrece reanudación | Ninguna |
| Drive sin espacio | GAS responde ERROR específico, usuario notificado | Ninguna (el archivo queda en cola) |

---

## 9. Estado de Implementación

- [ ] Fase 1: Contratos GAS (INIT, CHUNK, FINALIZE) en `api_gateway.js`
- [ ] Fase 2: Servicio de cola persistente en IndexedDB (`PeristalticQueue.js`)
- [ ] Fase 3: Motor de compresión liviana de imágenes (Canvas API, sin Workers)
- [ ] Fase 4: Orquestador de envío con Semáforo, Jitter, Circuit Breaker y Adaptación de Chunk
- [ ] Fase 5: Panel de retroalimentación inteligente (UX Comunicativa)
- [ ] Fase 6: Service Worker para proceso en segundo plano
- [ ] Fase 7: Sistema de recuperación de sesión al reabrir la aplicación
- [ ] Fase 8: Pruebas de estrés con 5 dispositivos simultáneos

---

## 10. Relación con ADRs Existentes

- **ADR-034 (MIE)**: PUP reemplaza al MIE para el caso de uso de campo (baja RAM, señal intermitente). MIE sigue siendo válido para uso en estación de trabajo con recursos abundantes.
- **ADR-008 (Ley de Aduana)**: PUP extiende el axioma de aduana al nivel de transporte: no solo el contenido debe ser canónico, el proceso de entrega también debe serlo.
- **ADR-019 (Share Tickets)**: El `session_id` de PUP comparte filosofía con los tickets de compartición — un token liviano que representa una operación de larga duración.

---

*El sistema que no comunica su estado interior es un sistema que miente por omisión. La retroalimentación radical no es una feature de UX — es un axioma de soberanía del usuario sobre el proceso.*
