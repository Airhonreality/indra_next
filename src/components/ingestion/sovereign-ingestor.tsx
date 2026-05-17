/**
 * 🏛️ ARTEFACTO: sovereign-ingestor.tsx
 * ────────────
 * CAPA: Components / Features (Agnostic Blocks)
 * VERSIÓN: 2.3.0
 * COMMIT: P3-M11.6-QUEUE-MANAGEMENT-MINIMAL-UI
 * 
 * 🎯 FUNCTIONAL_SCOPE:
 * - Proyección visual del orquestador de ingesta persistente.
 * - Soporte para control manual de la cola (remoción de tareas individuales).
 * - Diseño puramente esquemático y minimalista sin colores ni estilos forzados.
 * 
 * 🛡️ AXIOMATIC_CONTRACT:
 * - MUST: Consumir el estado del orquestador a través de interfaces declarativas.
 * - NEVER: Forzar estilos cromáticos ajenos a los tokens de diseño de la aplicación.
 * - ALWAYS: Proveer controles intuitivos de mitigación de errores (eliminar de la cola).
 */

'use client';

import React, { useState, useRef } from 'react';
import { useIngestionOrchestrator, IngestionTask } from '@/hooks/use-ingestion-orchestrator';
import { Trash2, X, UploadCloud, Loader2, RefreshCw } from 'lucide-react';

interface SovereignIngestorProps {
  slug: string;
  view?: 'ACTIVE' | 'HISTORY';
  onComplete?: (tasks: IngestionTask[]) => void;
}

export const SovereignIngestor: React.FC<SovereignIngestorProps> = ({ slug, view = 'ACTIVE', onComplete }) => {
  const { 
    tasks: allTasks, 
    ingest, 
    executeQueue, 
    clearQueue, 
    resolveConflict, 
    removeTask, 
    isProcessing 
  } = useIngestionOrchestrator(slug);
  
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
    <div className="sovereign-ingestor-block space-y-6">
      {/* HEADER SECTION */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 pb-6 border-b border-border/60">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">
            {view === 'ACTIVE' ? 'Cola de Ingesta Activa' : 'Historial de Transmisión'}
          </h3>
          <p className="text-[11px] text-muted-foreground italic mt-1">
            {view === 'ACTIVE' ? `Bandeja de preparación y staging para: ${slug}` : `Registro histórico de operaciones en: ${slug}`}
          </p>
        </div>
        
        {view === 'ACTIVE' && (
          <div className="flex items-center gap-3">
            {tasks.length > 0 && (
              <button 
                onClick={clearQueue} 
                className="px-3 py-1.5 rounded-lg border border-border text-[9px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                title="Limpiar cola actual"
              >
                Limpiar Todo
              </button>
            )}
            <button 
              onClick={() => fileInputRef.current?.click()} 
              className="px-4 py-2 rounded-xl bg-muted border border-border text-[10px] font-bold uppercase tracking-widest text-foreground hover:bg-muted/80 transition-colors"
            >
              Añadir Materia
            </button>
          </div>
        )}
      </div>

      <input type="file" multiple ref={fileInputRef} onChange={handleFileChange} className="hidden" />

      {/* QUEUE SPACE */}
      <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
        {tasks.length === 0 && (
          <div className="py-16 text-center border border-dashed border-border/80 rounded-2xl bg-muted/10">
            <UploadCloud className="size-8 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground text-xs italic">
              {view === 'ACTIVE' ? 'No hay materias seleccionadas para la cola.' : 'El historial se encuentra vacío.'}
            </p>
          </div>
        )}

        {tasks.map((task) => (
          <div 
            key={task.id} 
            className={`p-4 rounded-xl border transition-all duration-300 bg-card/40 ${
              task.status === 'CONFLICT' ? 'border-amber-500/30 bg-amber-500/5' : 
              task.status === 'FAILED' ? 'border-destructive/30 bg-destructive/5' :
              task.status === 'COMPLETED' ? 'border-emerald-500/20 bg-emerald-500/5' :
              'border-border/60 hover:border-border'
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1 min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-foreground truncate block max-w-[280px]">
                    {task.fileName}
                  </span>
                  <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded border ${
                    task.status === 'CONFLICT' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' :
                    task.status === 'FAILED' ? 'bg-destructive/10 text-destructive border-destructive/20' :
                    task.status === 'COMPLETED' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                    'bg-muted text-muted-foreground border-border'
                  }`}>
                    {task.status}
                  </span>
                </div>
                
                <p className="text-[9px] text-muted-foreground font-mono uppercase tracking-wider">
                  {(task.fileSize / 1024 / 1024).toFixed(2)} MB • {task.mimeType}
                </p>
              </div>

              {/* CONTROLES DE LA TAREA */}
              <div className="flex items-center gap-2">
                {task.status === 'CONFLICT' && (
                  <div className="flex items-center gap-1.5">
                    <button 
                      onClick={() => resolveConflict(task.id, 'IGNORE')} 
                      className="px-2.5 py-1 text-[8px] font-bold uppercase tracking-widest rounded bg-muted border border-border text-foreground hover:bg-muted/80 transition-colors"
                    >
                      Omitir
                    </button>
                    <button 
                      onClick={() => resolveConflict(task.id, 'FORCE')} 
                      className="px-2.5 py-1 text-[8px] font-bold uppercase tracking-widest rounded bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
                    >
                      Forzar
                    </button>
                  </div>
                )}

                {task.status === 'VERIFYING' && (
                  <div className="flex items-center gap-1 text-[9px] font-mono font-bold text-primary tracking-widest uppercase">
                    <Loader2 className="size-3 animate-spin" />
                    <span>Verificando</span>
                  </div>
                )}

                {task.status === 'COMPLETED' && (
                  <span className="text-emerald-500 text-[9px] font-bold uppercase tracking-widest">
                    ✓ Transmitido
                  </span>
                )}

                {/* BOTÓN ELIMINAR (Para evitar archivos incorrectos en la cola) */}
                {task.status !== 'UPLOADING' && task.status !== 'VERIFYING' && (
                  <button
                    onClick={() => removeTask(task.id)}
                    disabled={isProcessing}
                    className="p-1.5 rounded-lg border border-border/80 text-muted-foreground hover:text-destructive hover:bg-destructive/10 hover:border-destructive/20 transition-all disabled:opacity-30 disabled:hover:bg-transparent"
                    title="Eliminar de la cola"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>
            </div>

            {task.status === 'FAILED' && (
              <p className="text-destructive text-[9px] font-mono mt-2 pt-2 border-t border-destructive/10">
                {task.error || 'Fallo indeterminado en el pipeline.'}
              </p>
            )}

            {/* PROGRESS VISUALIZATION */}
            {(task.status === 'UPLOADING' || task.status === 'COMPLETED' || task.status === 'VERIFYING') && (
              <div className="mt-3 space-y-1 animate-in fade-in duration-300">
                <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                  <div 
                    className={`h-full bg-foreground transition-all duration-300 ${
                      task.status === 'VERIFYING' ? 'animate-pulse' : ''
                    }`} 
                    style={{ width: `${task.progress}%` }} 
                  />
                </div>
                <div className="flex justify-between text-[8px] font-mono text-muted-foreground">
                  <span>PROGRESO</span>
                  <span>{task.progress}%</span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* START INGESTION ACTION */}
      {tasks.length > 0 && !isProcessing && tasks.some(t => t.status === 'PENDING' || t.status === 'FAILED') && (
        <button 
          onClick={handleStart} 
          className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-widest hover:opacity-90 transition-opacity active:scale-[0.99] shadow-sm flex items-center justify-center gap-2"
        >
          <span>Transmitir Cola Soberana</span>
        </button>
      )}

      {isProcessing && (
        <div className="w-full py-3 rounded-xl border border-border bg-muted/40 text-muted-foreground text-[9px] font-bold uppercase tracking-widest text-center flex items-center justify-center gap-2">
          <Loader2 className="size-3.5 animate-spin" />
          <span>Procesando Flujo de Datos...</span>
        </div>
      )}
    </div>
  );
};
