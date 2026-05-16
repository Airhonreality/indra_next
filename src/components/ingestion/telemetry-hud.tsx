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
import type { IngestionTask, IngestionStatus } from '@/hooks/use-ingestion-orchestrator';

interface TelemetryHUDProps {
  task: IngestionTask;
  status: IngestionStatus;
}

export function TelemetryHUD({ task, status }: TelemetryHUDProps) {
  if (status === 'PENDING' || status === 'COMPLETED' || status === 'FAILED') return null;

  return (
    <div className="space-y-6 p-6 bg-muted/30 border border-border/50 rounded-3xl">
      <div className="flex justify-between items-end">
        <div className="space-y-1">
          <p className="text-[10px] font-black uppercase tracking-widest text-primary">Procesando</p>
          <p className="text-xs font-bold truncate max-w-[280px]">{task.fileName}</p>
        </div>
        <span className="text-2xl font-mono font-black tracking-tighter">{task.progress}%</span>
      </div>

      <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
        <div 
          className="h-full bg-primary transition-all duration-300" 
          style={{ width: `${task.progress}%` }} 
        />
      </div>
    </div>
  );
}
