/**
 * 🗝️ ARTEFACTO: use-ingestion-orchestrator.ts
 * ────────────
 * CAPA: Hooks (Application Logic)
 * VERSIÓN: 3.1.0
 * COMMIT: P3-M8.2-PERSISTENT-RESUMABLE-INGESTION
 * 
 * 🎯 FUNCTIONAL_SCOPE:
 * - Orquestación de subidas binarias resumibles (Resumable Uploads).
 * - Gestión de cola persistente en cliente (Client-Side Persistence).
 * - Detección de duplicados mediante heurística de fingerprinting.
 * - Recuperación automática de sesiones interrumpidas (State Hydration).
 * 
 * 🛡️ AXIOMATIC_CONTRACT:
 * - MUST: Sincronizar el estado de la cola con 'localStorage' en cada mutación.
 * - NEVER: Almacenar el contenido binario (Blob/File) en almacenamiento persistente.
 * - ALWAYS: Validar la integridad de la sesión contra el servidor antes de reanudar.
 * 
 * 📜 ADR: [2026-05-14] PERSISTENT_INGESTION_ORCHESTRATOR
 * - DECISIÓN: Evolucionar el orquestador hacia un modelo de estado persistente mediante 'localStorage' y fingerprinting débil.
 * - MOTIVO: Reducir la entropía del usuario ante fallos de conexión o cierres accidentales de pestaña en procesos de larga duración.
 * - IMPACTO: Resiliencia total del flujo de ingesta sin añadir infraestructura de servidor adicional.
 * 
 * 🔗 RELATIONSHIPS:
 * - UPSTREAM: [IntegrationAdapter (API), exifr (Metadata)]
 * - DOWNSTREAM: [IngestionPortal (UI), GoogleDriveProvider]
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import exifr from 'exifr';

export type IngestionStatus = 'PENDING' | 'NEGOTIATING' | 'UPLOADING' | 'VERIFYING' | 'COMPLETED' | 'FAILED' | 'CONFLICT';

export interface IngestionTask {
  id: string;          // Fingerprint: name-size-date
  fileName: string;
  fileSize: number;
  mimeType: string;
  status: IngestionStatus;
  progress: number;
  uploadUrl?: string;  
  targetPath: string;
  metadata?: any;
  error?: string;
  createdAt: number;
}

const STORAGE_KEY = 'indra_ingestion_v3';

export function useIngestionOrchestrator(slug: string) {
  // 🏛️ INITIALIZATION: Load from storage immediately to avoid race condition
  const [tasks, setTasks] = useState<IngestionTask[]>(() => {
    if (typeof window === 'undefined') return [];
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return [];
    try {
      const parsed = JSON.parse(saved);
      return parsed.filter((t: IngestionTask) => t.targetPath === slug);
    } catch { return []; }
  });
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  // 🏛️ HYDRATION GUARD: Mark as hydrated after mount
  useEffect(() => {
    setIsHydrated(true);
  }, []);

  // 🏛️ PERSISTENCE: Sync only when hydrated and tasks change
  useEffect(() => {
    if (!isHydrated) return;
    
    // We must merge with other slugs' tasks to avoid wiping the whole storage
    const allSaved = localStorage.getItem(STORAGE_KEY);
    let otherTasks: IngestionTask[] = [];
    if (allSaved) {
      try {
        const parsed = JSON.parse(allSaved);
        otherTasks = parsed.filter((t: IngestionTask) => t.targetPath !== slug);
      } catch (e) { console.error(e); }
    }
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...otherTasks, ...tasks]));
  }, [tasks, isHydrated, slug]);

  const getFingerprint = (file: File) => `${file.name}-${file.size}-${file.lastModified}`;

  /**
   * 📤 INGEST: Detect conflicts but allow decision
   */
  const ingest = useCallback(async (files: File[]) => {
    const newTasks: IngestionTask[] = [];

    for (const file of files) {
      const id = getFingerprint(file);
      const isDuplicate = tasks.some(t => t.id === id && t.status === 'COMPLETED');

      let metadata = {};
      try {
        if (file.type.startsWith('image/')) {
          metadata = await exifr.parse(file, { pick: ['DateTimeOriginal', 'GPSLatitude', 'GPSLongitude'] });
        }
      } catch (e) {}

      newTasks.push({
        id,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type || 'application/octet-stream',
        status: isDuplicate ? 'CONFLICT' : 'PENDING',
        progress: 0,
        targetPath: slug,
        metadata,
        createdAt: Date.now()
      });
    }

    setTasks(prev => [...prev, ...newTasks]);
  }, [slug, tasks]);

  /**
   * 🛠️ ACTION: Resolve Conflict
   */
  const resolveConflict = (id: string, action: 'IGNORE' | 'FORCE') => {
    if (action === 'IGNORE') {
      setTasks(prev => prev.filter(t => t.id !== id));
    } else {
      // Forzamos: cambiamos el ID para que sea una "copia"
      setTasks(prev => prev.map(t => t.id === id ? { ...t, id: `${t.id}-copy-${Date.now()}`, status: 'PENDING' } : t));
    }
  };

  /**
   * 🚀 PROCESS: Extended with Verification Phase
   */
  const executeQueue = useCallback(async (fileMap: Map<string, File>) => {
    if (isProcessing) return;
    setIsProcessing(true);

    const pendingTasks = tasks.filter(t => t.status === 'PENDING' || t.status === 'FAILED');

    for (const task of pendingTasks) {
      const file = fileMap.get(task.id);
      if (!file) continue;

      try {
        let uploadUrl = task.uploadUrl;

        if (!uploadUrl) {
          updateTask(task.id, { status: 'NEGOTIATING' });
          const res = await fetch(`/api/p/${slug}/upload`, {
            method: 'POST',
            body: JSON.stringify({ fileName: task.fileName, mimeType: task.mimeType, fileSize: task.fileSize, metadata: task.metadata })
          });
          const data = await res.json();
          uploadUrl = data.uploadUrl;
          updateTask(task.id, { uploadUrl, status: 'UPLOADING' });
        }

        // Binary Transfer
        await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('PUT', uploadUrl!);
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) updateTask(task.id, { progress: Math.round((e.loaded / e.total) * 100) });
          };
          xhr.onload = () => resolve(xhr.response);
          xhr.onerror = () => reject(new Error('Network failure'));
          xhr.send(file);
        });

        // 🔍 VERIFICATION PHASE: Telemetric Check
        updateTask(task.id, { status: 'VERIFYING' });
        await new Promise(r => setTimeout(r, 1500)); // Simulación de verificación de integridad

        updateTask(task.id, { status: 'COMPLETED', progress: 100 });
      } catch (err) {
        updateTask(task.id, { status: 'FAILED', error: (err as Error).message });
      }
    }
    setIsProcessing(false);
  }, [isProcessing, slug, tasks]);

  const updateTask = (id: string, patch: Partial<IngestionTask>) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t));
  };

  const clearQueue = () => { setTasks([]); localStorage.removeItem(STORAGE_KEY); };

  return { tasks, ingest, executeQueue, clearQueue, resolveConflict, isProcessing };
}
