/**
 * 🛰️ ARTEFACTO: use-ingestion-orchestrator.ts
 * ────────────
 * CAPA: Hooks / Domain (Ingestion Logic)
 * VERSIÓN: 1.1.0
 * COMMIT: P3-M6.2-INGESTION-DECOUPLING
 * 
 * 🎯 FUNCTIONAL_SCOPE:
 * - Orquestador lógico de la cola de activos digitales (Queue Management).
 * - Negociación de sesiones resumibles y transferencia binaria vía XHR.
 * - Motor de telemetría de alta densidad (Velocidad, ETA, Progreso).
 * 
 * 🛡️ AXIOMATIC_CONTRACT:
 * - MUST: Mantener la independencia del flujo binario frente a la representación visual.
 * - NEVER: Permitir subidas paralelas que comprometan la estabilidad del socket en móviles.
 * - ALWAYS: Emitir estados atómicos (Idle, Uploading, Processing, Success, Error).
 * 
 * 📜 ARCH_DECISION: Se utiliza XHR en lugar de Fetch para obtener una granularidad superior 
 * en el rastreo del progreso de subida (Upload Events), esencial para archivos >1GB.
 */

import { useState, useCallback, useRef } from 'react';

export type IngestionStatus = 'idle' | 'uploading' | 'processing' | 'success' | 'error';

export interface IngestionTelemetry {
  speed: number;
  eta: number | null;
  progress: number;
  currentFileIndex: number;
  totalFiles: number;
}

export function useIngestionOrchestrator(slug: string) {
  const [status, setStatus] = useState<IngestionStatus>('idle');
  const [telemetry, setTelemetry] = useState<IngestionTelemetry>({
    speed: 0,
    eta: null,
    progress: 0,
    currentFileIndex: 0,
    totalFiles: 0,
  });

  const lastUpdateRef = useRef<{ time: number, loaded: number }>({ time: 0, loaded: 0 });

  const processQueue = useCallback(async (files: File[], formData: any) => {
    if (files.length === 0) return;

    setStatus('uploading');
    setTelemetry(prev => ({ ...prev, totalFiles: files.length }));

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setTelemetry(prev => ({ ...prev, currentFileIndex: i, progress: 5, speed: 0, eta: null }));
      lastUpdateRef.current = { time: Date.now(), loaded: 0 };

      try {
        // 1. Negotiation Phase
        const negRes = await fetch(`/api/p/${slug}/upload`, {
          method: 'POST',
          body: JSON.stringify({
            fileName: file.name,
            mimeType: file.type || 'application/octet-stream',
            fileSize: file.size,
            variables: formData
          })
        });
        const { uploadUrl, error } = await negRes.json();
        if (error) throw new Error(error);

        // 2. Binary Streaming Phase (XHR)
        await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('PUT', uploadUrl);
          xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');

          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              const currentProgress = Math.round((e.loaded / e.total) * 100);
              const now = Date.now();
              const timeDiff = (now - lastUpdateRef.current.time) / 1000;

              if (timeDiff >= 0.8) { // Update telemetry every ~800ms for smoothness
                const bytesDiff = e.loaded - lastUpdateRef.current.loaded;
                const currentSpeed = bytesDiff / timeDiff;
                const currentEta = Math.round((e.total - e.loaded) / currentSpeed);
                
                setTelemetry(prev => ({ 
                  ...prev, 
                  progress: currentProgress, 
                  speed: currentSpeed, 
                  eta: currentEta 
                }));
                lastUpdateRef.current = { time: now, loaded: e.loaded };
              } else {
                setTelemetry(prev => ({ ...prev, progress: currentProgress }));
              }
            }
          };

          xhr.onload = () => (xhr.status >= 200 && xhr.status < 300) 
            ? resolve(xhr.response) 
            : reject(new Error(`Transfer failed: ${xhr.status}`));
          
          xhr.onerror = () => reject(new Error('Network bridge failure'));
          xhr.send(file);
        });

        // 3. Simulated Intelligent Processing (Transcoding simulation)
        setStatus('processing');
        await new Promise(r => setTimeout(r, 1800));
        setStatus('uploading');

      } catch (err) {
        setStatus('error');
        throw err;
      }
    }

    setStatus('success');
  }, [slug]);

  const reset = useCallback(() => {
    setStatus('idle');
    setTelemetry({ speed: 0, eta: null, progress: 0, currentFileIndex: 0, totalFiles: 0 });
  }, []);

  return { processQueue, reset, status, telemetry };
}
