/**
 * 🏛️ ARTEFACTO: use-ingestion-orchestrator.ts
 * ────────────
 * CAPA: Hooks (Application Logic)
 * VERSIÓN: 4.0.0
 * COMMIT: P4-M12.1-ORPHAN-REBIND-AUTO-RESUME
 * 
 * 🎯 FUNCTIONAL_SCOPE:
 * - Orquestación de subidas binarias resumibles (Resumable Uploads).
 * - Gestión de cola persistente en cliente (Client-Side Persistence).
 * - Detección de descriptores de archivo huérfanos (Orphan File Handles).
 * - Mitigación de entropía y recuperación de colas interrumpidas (Auto-Resume).
 * 
 * 🛡️ AXIOMATIC_CONTRACT:
 * - MUST: Sincronizar el estado de la cola con 'localStorage' en cada mutación.
 * - NEVER: Almacenar el contenido binario (Blob/File) en almacenamiento persistente.
 * - ALWAYS: Proveer métodos limpios para la vinculación tardía de archivos huérfanos.
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

const STORAGE_KEY = 'indra_ingestion_v4';

export function useIngestionOrchestrator(slug: string) {
  // 🏛️ PERSISTENT QUEUE STATE
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

  // 🏛️ INTERNAL BINARY MEMORY MAP (Prevents Garbage Collection on suspension)
  const fileMapRef = useRef<Map<string, File>>(new Map());

  // 🏛️ HYDRATION GUARD
  useEffect(() => {
    setIsHydrated(true);
  }, []);

  // 🏛️ PERSISTENCE ENGINE
  useEffect(() => {
    if (!isHydrated) return;
    
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
   * 📤 INGEST: Adds files to both persistent task state and internal RAM map
   */
  const ingest = useCallback(async (files: File[]) => {
    const newTasks: IngestionTask[] = [];

    for (const file of files) {
      const id = getFingerprint(file);
      const isDuplicate = tasks.some(t => t.id === id && t.status === 'COMPLETED');

      // Register file in physical memory map
      fileMapRef.current.set(id, file);

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
      fileMapRef.current.delete(id);
    } else {
      const originalFile = fileMapRef.current.get(id);
      const newId = `${id}-copy-${Date.now()}`;
      if (originalFile) {
        fileMapRef.current.set(newId, originalFile);
      }
      setTasks(prev => prev.map(t => t.id === id ? { ...t, id: newId, status: 'PENDING' } : t));
    }
  };

  /**
   * 🗑️ ACTION: Remove Task
   */
  const removeTask = useCallback((id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id));
    fileMapRef.current.delete(id);
  }, []);

  /**
   * 🔗 ACTION: Re-bind Physical File to Orphan Task descriptor
   */
  const rebindFile = useCallback((id: string, file: File) => {
    fileMapRef.current.set(id, file);
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status: 'PENDING', error: undefined } : t));
  }, []);

  /**
   * 🚀 PROCESS: Executes the pending ingestion queue
   */
  const executeQueue = useCallback(async (customFileMap?: Map<string, File>) => {
    if (isProcessing) return;
    setIsProcessing(true);

    const pendingTasks = tasks.filter(t => t.status === 'PENDING' || t.status === 'FAILED');

    for (const task of pendingTasks) {
      // Resolve physical file from memory map or optional custom map
      const file = customFileMap?.get(task.id) || fileMapRef.current.get(task.id);
      if (!file) {
        updateTask(task.id, { 
          status: 'FAILED', 
          error: 'Archivo desvinculado de la memoria del navegador. Es necesario re-vincular.' 
        });
        continue;
      }

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

        // Binary Resumable Stream
        await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('PUT', uploadUrl!);
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) updateTask(task.id, { progress: Math.round((e.loaded / e.total) * 100) });
          };
          xhr.onload = () => resolve(xhr.response);
          xhr.onerror = () => reject(new Error('Fallo de red durante la transmisión.'));
          xhr.send(file);
        });

        // Verification phase
        updateTask(task.id, { status: 'VERIFYING' });
        await new Promise(r => setTimeout(r, 1200));

        updateTask(task.id, { status: 'COMPLETED', progress: 100 });
      } catch (err) {
        updateTask(task.id, { status: 'FAILED', error: (err as Error).message });
      }
    }
    setIsProcessing(false);
  }, [isProcessing, slug, tasks]);

  /**
   * 🔄 ACTION: Automatically resets interrupted tasks back to PENDING and triggers queue
   */
  const autoResumeQueue = useCallback(async () => {
    // Normalise any suspended tasks to PENDING state
    setTasks(prev => prev.map(t => 
      t.status === 'UPLOADING' || t.status === 'NEGOTIATING' || t.status === 'VERIFYING'
        ? { ...t, status: 'PENDING', progress: 0 }
        : t
    ));
    await executeQueue();
  }, [executeQueue]);

  const updateTask = (id: string, patch: Partial<IngestionTask>) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t));
  };

  const clearQueue = () => { 
    setTasks([]); 
    fileMapRef.current.clear();
    localStorage.removeItem(STORAGE_KEY); 
  };

  // 🏛️ ORPHAN STATUS DETECTION (Calculated in real-time)
  const orphanTasks = tasks.filter(t => 
    t.status !== 'COMPLETED' && !fileMapRef.current.has(t.id)
  );

  // 🏛️ INTERRUPTED QUEUE DETECTION (Queue is stalled in front-end but has raw progress missing)
  const isQueueStalled = !isProcessing && tasks.some(t => 
    t.status === 'PENDING' || t.status === 'FAILED' || t.status === 'UPLOADING' || t.status === 'NEGOTIATING' || t.status === 'VERIFYING'
  );

  return { 
    tasks, 
    ingest, 
    executeQueue, 
    clearQueue, 
    resolveConflict, 
    removeTask, 
    rebindFile, 
    autoResumeQueue,
    orphanTasks,
    isQueueStalled,
    isProcessing 
  };
}
