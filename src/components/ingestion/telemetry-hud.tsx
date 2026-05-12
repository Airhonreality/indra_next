/**
 * 📊 ARTEFACTO: telemetry-hud.tsx
 * ────────────
 * CAPA: UI / Components (Presentational)
 * VERSIÓN: 1.0.0
 * 
 * 🎯 FUNCTIONAL_SCOPE:
 * - Proyección visual de métricas de rendimiento en tiempo real.
 * - Visualización de estados de progreso, velocidad y tiempo estimado (ETA).
 * 
 * 🛡️ AXIOMATIC_CONTRACT:
 * - MUST: Ser un componente funcional puro impulsado por props.
 * - NEVER: Contener lógica de red o efectos secundarios de sistema.
 * - ALWAYS: Usar tokens de diseño consistentes con el lenguaje visual de Indra.
 */

import React from 'react';
import { Zap, Timer, Cpu, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { IngestionTelemetry, IngestionStatus } from '@/hooks/use-ingestion-orchestrator';

interface TelemetryHUDProps {
  telemetry: IngestionTelemetry;
  status: IngestionStatus;
  fileName: string;
}

export function TelemetryHUD({ telemetry, status, fileName }: TelemetryHUDProps) {
  const isProcessing = status === 'processing';
  const isUploading = status === 'uploading';

  if (status === 'idle' || status === 'success' || status === 'error') return null;

  return (
    <div className="space-y-6 p-6 bg-muted/30 border border-border/50 rounded-3xl animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-end">
        <div className="space-y-1">
          <p className="text-[10px] font-black uppercase tracking-widest text-primary">
            {isProcessing ? 'Optimizando Activo' : 'Transfiriendo Datos'}
          </p>
          <p className="text-xs font-bold truncate max-w-[280px]">{fileName}</p>
        </div>
        <span className="text-2xl font-mono font-black tracking-tighter">{telemetry.progress}%</span>
      </div>

      {/* PROGRESS BAR */}
      <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
        <div 
          className={cn(
            "h-full transition-all duration-300 ease-out", 
            isProcessing ? "bg-emerald-500 animate-pulse" : "bg-primary shadow-[0_0_15px_rgba(var(--primary),0.3)]"
          )} 
          style={{ width: `${telemetry.progress}%` }} 
        />
      </div>

      {/* METRICS GRID */}
      <div className="grid grid-cols-3 gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5 opacity-40">
            <Zap className="size-3" />
            <span className="text-[8px] font-bold uppercase">Velocidad</span>
          </div>
          <span className="text-[10px] font-mono">
            {(telemetry.speed / 1024 / 1024).toFixed(2)} MB/s
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5 opacity-40">
            <Timer className="size-3" />
            <span className="text-[8px] font-bold uppercase">Restante</span>
          </div>
          <span className="text-[10px] font-mono">
            {telemetry.eta ? `${Math.floor(telemetry.eta / 60)}m ${telemetry.eta % 60}s` : '--'}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5 opacity-40">
            <Cpu className="size-3" />
            <span className="text-[8px] font-bold uppercase">Cola</span>
          </div>
          <span className="text-[10px] font-mono">
            {telemetry.currentFileIndex + 1} / {telemetry.totalFiles}
          </span>
        </div>
      </div>

      {/* SOVEREIGNTY ALERT */}
      {isUploading && (
        <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
          <AlertTriangle className="size-3 text-amber-500" />
          <p className="text-[8px] font-bold uppercase text-amber-500 tracking-tight">
            Mantén esta ventana activa para garantizar la integridad del túnel.
          </p>
        </div>
      )}
    </div>
  );
}
