/**
 * 🗝️ ARTEFACTO: sovereign-ingestor.tsx
 * ────────────
 * CAPA: Components / Features (Agnostic Blocks)
 * VERSIÓN: 2.2.0
 * COMMIT: P3-M9.3-TELEMETRY-CONFLICT-RESOLUTION
 * 
 * 🎯 FUNCTIONAL_SCOPE:
 * - Proyección visual del orquestador de ingesta persistente.
 * - Gestión de la entropía mediante visualización de colas y logs de error.
 * - Resolución de conflictos (duplicados) y telemetría de verificación.
 */

'use client';

import React, { useState, useRef } from 'react';
import { useIngestionOrchestrator, IngestionTask } from '@/hooks/use-ingestion-orchestrator';

interface SovereignIngestorProps {
  slug: string;
  view?: 'ACTIVE' | 'HISTORY'; // New: Agnostic view projection
  onComplete?: (tasks: IngestionTask[]) => void;
}

export const SovereignIngestor: React.FC<SovereignIngestorProps> = ({ slug, view = 'ACTIVE', onComplete }) => {
  const { tasks: allTasks, ingest, executeQueue, clearQueue, resolveConflict, isProcessing } = useIngestionOrchestrator(slug);
  
  // 🏛️ PROJECTION LOGIC: Filter tasks based on view
  const tasks = allTasks.filter(t => 
    view === 'ACTIVE' 
      ? (t.status !== 'COMPLETED') 
      : (t.status === 'COMPLETED' || t.status === 'FAILED')
  );

  const [fileMap] = useState<Map<string, File>>(new Map());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    files.forEach(file => {
      const id = `${file.name}-${file.size}-${file.lastModified}`;
      fileMap.set(id, file);
    });

    await ingest(files);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleStart = async () => {
    await executeQueue(fileMap);
    const completed = tasks.filter(t => t.status === 'COMPLETED');
    if (completed.length === tasks.length && onComplete) onComplete(completed);
  };

  return (
    <div className="sovereign-ingestor-block p-6 bg-slate-900/50 rounded-2xl border border-slate-800 backdrop-blur-xl">
      <div className="header flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">
            {view === 'ACTIVE' ? 'Ingesta Soberana' : 'Historial de Ingesta'}
          </h2>
          <p className="text-sm text-slate-400">
            {view === 'ACTIVE' ? `Cola persistente para ${slug}` : `Registro de subidas en ${slug}`}
          </p>
        </div>
        {view === 'ACTIVE' && (
          <div className="actions flex gap-2">
            <button onClick={clearQueue} className="px-3 py-1 text-xs font-medium text-slate-400 hover:text-white transition-colors">
              Limpiar Pasado
            </button>
            <button onClick={() => fileInputRef.current?.click()} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-all shadow-lg shadow-indigo-500/20">
              Añadir Materia
            </button>
          </div>
        )}
      </div>

      <input type="file" multiple ref={fileInputRef} onChange={handleFileChange} className="hidden" />

      <div className="queue-space space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
        {tasks.length === 0 && (
          <div className="empty-state py-12 text-center border-2 border-dashed border-slate-800 rounded-xl">
            <p className="text-slate-500 text-sm italic">
              {view === 'ACTIVE' ? 'Sin materia en la cola de proyección.' : 'El historial está limpio.'}
            </p>
          </div>
        )}

        {tasks.map((task) => (
          <div key={task.id} className={`task-card p-4 rounded-xl border transition-all ${
            task.status === 'CONFLICT' ? 'bg-amber-900/20 border-amber-800/50' : 
            task.status === 'COMPLETED' ? 'bg-emerald-900/10 border-emerald-800/30' :
            'bg-slate-800/40 border-slate-700/50'
          }`}>
            <div className="flex justify-between items-start">
              <div className="info">
                <p className="text-sm font-medium text-slate-200 truncate max-w-[200px]">{task.fileName}</p>
                <p className="text-[10px] text-slate-500 font-mono uppercase">
                  {(task.fileSize / 1024 / 1024).toFixed(2)} MB • {task.status}
                </p>
              </div>

              {task.status === 'CONFLICT' && (
                <div className="flex gap-2">
                  <button onClick={() => resolveConflict(task.id, 'IGNORE')} className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1 rounded">Ignorar</button>
                  <button onClick={() => resolveConflict(task.id, 'FORCE')} className="text-[10px] bg-amber-600 hover:bg-amber-500 text-white px-2 py-1 rounded font-bold">Subir Copia</button>
                </div>
              )}

              {task.status === 'VERIFYING' && <span className="text-indigo-400 text-[10px] font-bold animate-pulse">VERIFICANDO...</span>}
              {task.status === 'COMPLETED' && <span className="text-emerald-400 text-xs font-bold">✓ RECIBIDO</span>}
            </div>

            {task.status === 'FAILED' && <p className="text-rose-400 text-[10px] mt-1 font-mono">{task.error}</p>}

            {(task.status === 'UPLOADING' || task.status === 'COMPLETED' || task.status === 'VERIFYING') && (
              <div className="w-full h-1.5 bg-slate-700 rounded-full mt-3 overflow-hidden">
                <div className={`h-full transition-all duration-300 ${task.status === 'VERIFYING' ? 'bg-indigo-500 animate-pulse' : 'bg-indigo-500'}`} style={{ width: `${task.progress}%` }} />
              </div>
            )}
          </div>
        ))}
      </div>

      {tasks.length > 0 && !isProcessing && tasks.some(t => t.status === 'PENDING' || t.status === 'FAILED') && (
        <button onClick={handleStart} className="w-full mt-6 py-3 bg-white text-slate-900 rounded-xl font-bold hover:bg-slate-100 transition-all active:scale-95">
          Proyectar a la Nube
        </button>
      )}

      {isProcessing && (
        <div className="w-full mt-6 py-3 bg-slate-800 text-slate-400 rounded-xl text-center font-medium animate-pulse">
          Procesando Stream...
        </div>
      )}
    </div>
  );
};
