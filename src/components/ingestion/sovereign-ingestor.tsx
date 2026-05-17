/**
 * 🏛️ ARTEFACTO: sovereign-ingestor.tsx
 * ────────────
 * CAPA: Components / Features (Agnostic Blocks)
 * VERSIÓN: 3.1.0
 * COMMIT: P4-M12.4-CONSOLIDATED-INLINE-REBIND
 * 
 * 🎯 FUNCTIONAL_SCOPE:
 * - Proyección visual del orquestador de ingesta persistente.
 * - Integración del guardián WakeLock y visualización de señalética activa (AgnosticSignalEffect).
 * - Gestión consolidada de archivos huérfanos inline en la cola, remarcados en destructivo (rojo sutil).
 * - Centinela de recuperación de transmisiones interrumpidas (Auto-Resume Queue).
 * 
 * 🛡️ AXIOMATIC_CONTRACT:
 * - MUST: Consumir el estado del orquestador a través de interfaces declarativas.
 * - NEVER: Forzar estilos cromáticos ajenos a los tokens de diseño de la aplicación.
 * - ALWAYS: Evitar duplicidades de información en pantalla consolidando controles en la misma cola.
 */

'use client';

import React, { useState, useRef } from 'react';
import { useIngestionOrchestrator, IngestionTask } from '@/hooks/use-ingestion-orchestrator';
import { AgnosticSignalEffect } from '@/components/ui/agnostic-signal-effect';
import { Trash2, UploadCloud, Loader2, RefreshCw, Clipboard } from 'lucide-react';

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
    rebindFile,
    autoResumeQueue,
    orphanTasks,
    isQueueStalled,
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

      {/* AGNOSTIC KEEP-ALIVE SIGNAL EFFECT */}
      {view === 'ACTIVE' && (
        <AgnosticSignalEffect 
          isActive={isProcessing} 
          label="TÚNEL SOBERANO DE SEGURIDAD" 
        />
      )}

      {/* CENTINELA DE COLA ESTANCADA / SUSPENDIDA */}
      {view === 'ACTIVE' && isQueueStalled && tasks.some(t => t.status === 'PENDING' || t.status === 'FAILED') && (
        <div className="p-4 border border-primary/20 bg-primary/5 rounded-2xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 animate-in slide-in-from-top-2 duration-300">
          <div className="space-y-0.5">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-primary">Cola Suspendida Detectada</h4>
            <p className="text-[10px] text-muted-foreground italic">El proceso se encuentra en espera tras un periodo de inactividad física.</p>
          </div>
          <button 
            onClick={autoResumeQueue}
            className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-[9px] font-bold uppercase tracking-widest hover:opacity-90 transition-opacity flex items-center gap-1.5 self-start sm:self-auto"
          >
            <RefreshCw className="size-3 animate-pulse" />
            Reanudar Cola
          </button>
        </div>
      )}

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

        {tasks.map((task) => {
          const isTaskOrphan = orphanTasks.some(ot => ot.id === task.id);
          
          return (
            <SovereignTaskCard 
              key={task.id}
              task={task}
              isOrphan={isTaskOrphan}
              isProcessing={isProcessing}
              onResolveConflict={resolveConflict}
              onRemoveTask={removeTask}
              onRebindFile={rebindFile}
            />
          );
        })}
      </div>

      {/* START INGESTION ACTION */}
      {tasks.length > 0 && !isProcessing && tasks.some(t => t.status === 'PENDING' || t.status === 'FAILED') && orphanTasks.length === 0 && (
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

// 🏛️ SUB-COMPONENT: UNIFIED CONSOLIDATED TASK CARD
const SovereignTaskCard: React.FC<{
  task: IngestionTask;
  isOrphan: boolean;
  isProcessing: boolean;
  onResolveConflict: (id: string, action: 'IGNORE' | 'FORCE') => void;
  onRemoveTask: (id: string) => void;
  onRebindFile: (id: string, file: File) => { ok: boolean; error?: string };
}> = ({ task, isOrphan, isProcessing, onResolveConflict, onRemoveTask, onRebindFile }) => {
  const [copied, setCopied] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(task.fileName);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {}
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      const res = onRebindFile(task.id, files[0]);
      if (!res.ok) {
        setValidationError(res.error || 'El archivo no coincide.');
        setTimeout(() => setValidationError(null), 5000);
      } else {
        setValidationError(null);
      }
    }
  };

  return (
    <div 
      className={`p-4 rounded-xl border transition-all duration-300 bg-card/40 ${
        task.status === 'CONFLICT' ? 'border-amber-500/30 bg-amber-500/5' : 
        task.status === 'FAILED' && !isOrphan ? 'border-destructive/30 bg-destructive/5' :
        task.status === 'COMPLETED' ? 'border-emerald-500/20 bg-emerald-500/5' :
        isOrphan ? 'border-destructive/30 bg-destructive/5 animate-pulse' :
        'border-border/60 hover:border-border'
      }`}
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1 min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-foreground truncate block max-w-[280px]">
                {task.fileName}
              </span>
              <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded border ${
                task.status === 'CONFLICT' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' :
                task.status === 'FAILED' && !isOrphan ? 'bg-destructive/10 text-destructive border-destructive/20' :
                task.status === 'COMPLETED' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                isOrphan ? 'bg-destructive/10 text-destructive border-destructive/20 font-black' :
                'bg-muted text-muted-foreground border-border'
              }`}>
                {isOrphan ? 'DESVINCULADO' : task.status}
              </span>
            </div>
            
            <p className="text-[9px] text-muted-foreground font-mono uppercase tracking-wider">
              {(task.fileSize / 1024 / 1024).toFixed(2)} MB • {task.mimeType}
            </p>
          </div>

          {/* CONTROLES DE LA TAREA */}
          <div className="flex items-center gap-2">
            {/* CONTROLES DE RE-VINCULACIÓN INLINE */}
            {isOrphan && (
              <div className="flex items-center gap-1.5">
                <button 
                  onClick={handleCopy}
                  className="px-2 py-1 rounded border border-border text-[8px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors flex items-center gap-1.5"
                  title="Copiar nombre al portapapeles"
                >
                  <Clipboard className="size-2.5" />
                  <span>{copied ? 'Copiado' : 'Copiar'}</span>
                </button>
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="px-2.5 py-1 rounded bg-primary text-primary-foreground text-[8px] font-bold uppercase tracking-widest hover:opacity-90 transition-all"
                >
                  Re-vincular
                </button>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileChange} 
                  className="hidden" 
                />
              </div>
            )}

            {task.status === 'CONFLICT' && (
              <div className="flex items-center gap-1.5">
                <button 
                  onClick={() => onResolveConflict(task.id, 'IGNORE')} 
                  className="px-2.5 py-1 text-[8px] font-bold uppercase tracking-widest rounded bg-muted border border-border text-foreground hover:bg-muted/80 transition-colors"
                >
                  Omitir
                </button>
                <button 
                  onClick={() => onResolveConflict(task.id, 'FORCE')} 
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

            {/* BOTÓN ELIMINAR */}
            {task.status !== 'UPLOADING' && task.status !== 'VERIFYING' && (
              <button
                onClick={() => onRemoveTask(task.id)}
                disabled={isProcessing}
                className="p-1.5 rounded-lg border border-border/80 text-muted-foreground hover:text-destructive hover:bg-destructive/10 hover:border-destructive/20 transition-all disabled:opacity-30 disabled:hover:bg-transparent"
                title="Eliminar de la cola"
              >
                <Trash2 className="size-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* INLINE VALIDATION ERROR */}
        {validationError && (
          <div className="text-[8px] font-mono text-destructive uppercase tracking-wide border-t border-destructive/10 pt-2 animate-in slide-in-from-top-1 duration-200">
            ⚠️ {validationError}
          </div>
        )}

        {task.status === 'FAILED' && !isOrphan && (
          <p className="text-destructive text-[9px] font-mono mt-1 pt-1.5 border-t border-destructive/10">
            {task.error || 'Fallo indeterminado en el pipeline.'}
          </p>
        )}

        {/* PROGRESS VISUALIZATION */}
        {(task.status === 'UPLOADING' || task.status === 'COMPLETED' || task.status === 'VERIFYING') && (
          <div className="mt-2 space-y-1 animate-in fade-in duration-300">
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
    </div>
  );
};
