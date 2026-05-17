/**
 * 🏛️ ARTEFACTO: agnostic-signal-effect.tsx
 * ────────────
 * CAPA: Components / UI (Agnostic Signal Service)
 * VERSIÓN: 1.0.0
 * COMMIT: P4-M12.2-CABLES-GL-KEEP-ALIVE
 * 
 * 🎯 FUNCTIONAL_SCOPE:
 * - Prevención física de la suspensión de pestañas (CPU Thread Suspense Mitigation).
 * - Renderizado continuo de señalética de túnel seguro mediante requestAnimationFrame (Cables GL style).
 * - Gestión resiliente del ciclo de vida del WakeLock con re-hidratación automática.
 * 
 * 🛡️ AXIOMATIC_CONTRACT:
 * - MUST: Liberar todos los recursos gráficos (cancelAnimationFrame) y WakeLock al desmontar.
 * - NEVER: Forzar esquemas de color hardcodeados; usar propiedades computadas y variables CSS.
 * - ALWAYS: Operar de forma transparente o integrada como elemento decorativo sutil.
 */

'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Shield, Sparkles, AlertTriangle } from 'lucide-react';

interface AgnosticSignalEffectProps {
  isActive: boolean;
  pulseSpeed?: number; // duration in ms
  label?: string;
  className?: string;
}

export const AgnosticSignalEffect: React.FC<AgnosticSignalEffectProps> = ({
  isActive,
  pulseSpeed = 2000,
  label = 'TÚNEL EN VIVO',
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wakeLockRef = useRef<any>(null);
  const animationFrameId = useRef<number | null>(null);
  
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 🏛️ WAKELOCK ACQUISITION & RE-HYDRATION LIFE-CYCLE
  const requestWakeLock = async () => {
    if (typeof window === 'undefined' || !('wakeLock' in navigator)) {
      setErrorMsg('API de WakeLock no soportada.');
      return;
    }
    
    try {
      if (wakeLockRef.current) return; // Already active
      const wakeLock = await (navigator as any).wakeLock.request('screen');
      wakeLockRef.current = wakeLock;
      setWakeLockActive(true);
      setErrorMsg(null);

      // Listen to release event (system can release it under low-battery or lock)
      wakeLock.addEventListener('release', () => {
        wakeLockRef.current = null;
        setWakeLockActive(false);
      });
    } catch (err: any) {
      setErrorMsg(`Fallo WakeLock: ${err.message || 'Bloqueado por el sistema'}`);
      setWakeLockActive(false);
    }
  };

  const releaseWakeLock = async () => {
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
      } catch (e) {}
      wakeLockRef.current = null;
      setWakeLockActive(false);
    }
  };

  useEffect(() => {
    if (isActive) {
      requestWakeLock();

      // 🏛️ RE-HYDRATION EVENTS: Auto-renew lock when tab gets re-awakened or refocused
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
          requestWakeLock();
        }
      };

      const handleFocus = () => {
        requestWakeLock();
      };

      window.addEventListener('visibilitychange', handleVisibilityChange);
      window.addEventListener('focus', handleFocus);

      return () => {
        window.removeEventListener('visibilitychange', handleVisibilityChange);
        window.removeEventListener('focus', handleFocus);
        releaseWakeLock();
      };
    } else {
      releaseWakeLock();
    }
  }, [isActive]);

  const [resolvedColor, setResolvedColor] = useState('120, 120, 120');

  // 🏛️ DYNAMIC THEME COLOR RESOLVER (Resolves HSL/HEX CSS variables safely once on mount)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const temp = document.createElement('div');
      temp.style.color = 'var(--primary)';
      document.body.appendChild(temp);
      const computed = getComputedStyle(temp).color;
      document.body.removeChild(temp);
      
      const match = computed.match(/\d+,\s*\d+,\s*\d+/);
      if (match) {
        setResolvedColor(match[0]);
      }
    } catch (e) {
      console.warn('[SME-V] Fallback to safe neutral color:', e);
    }
  }, []);

  // 🏛️ CABLES GL / KEEP-ALIVE CANVAS RENDERING LOOP
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = (canvas.width = 160);
    let height = (canvas.height = 40);
    let phase = 0;

    const render = () => {
      if (!ctx || !canvas) return;

      // Ensure dimensions match
      if (canvas.clientWidth !== width || canvas.clientHeight !== height) {
        width = canvas.width = canvas.clientWidth;
        height = canvas.height = canvas.clientHeight;
      }

      ctx.clearRect(0, 0, width, height);

      if (isActive) {
        // Draw an ultra-subtle, elegant pulsating wave (Cables GL simulation)
        phase += 0.05;
        
        ctx.beginPath();
        ctx.lineWidth = 1;
        
        // Dynamic primary color stroke (Safe native rgb parsing)
        const gradient = ctx.createLinearGradient(0, 0, width, 0);
        gradient.addColorStop(0, `rgba(${resolvedColor}, 0.02)`);
        gradient.addColorStop(0.5, `rgba(${resolvedColor}, 0.35)`);
        gradient.addColorStop(1, `rgba(${resolvedColor}, 0.02)`);
        ctx.strokeStyle = gradient;

        for (let x = 0; x < width; x++) {
          const y = height / 2 + Math.sin(x * 0.08 + phase) * 3 * Math.sin(phase * 0.5);
          if (x === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();

        // Pulsating particle dot
        const dotX = width / 2 + Math.sin(phase * 0.8) * (width * 0.35);
        const dotY = height / 2 + Math.sin(dotX * 0.08 + phase) * 3 * Math.sin(phase * 0.5);
        ctx.beginPath();
        ctx.arc(dotX, dotY, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${resolvedColor}, 0.8)`;
        ctx.fill();
      }

      // Loop request keeps browser worker active and awake
      animationFrameId.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [isActive, resolvedColor]);

  return (
    <div className={`agnostic-signal-wrapper flex items-center justify-between px-4 py-2.5 rounded-xl border bg-muted/20 border-border/80 ${className}`}>
      <div className="flex items-center gap-2">
        <div className="relative flex items-center justify-center size-5">
          {isActive ? (
            <>
              <span className="absolute inline-flex h-full w-full rounded-full bg-primary/20 animate-ping opacity-75" />
              <Shield className="relative size-3 text-primary animate-pulse" />
            </>
          ) : (
            <Shield className="size-3 text-muted-foreground/60" />
          )}
        </div>
        
        <div className="flex flex-col">
          <span className="text-[9px] font-black uppercase tracking-widest text-foreground flex items-center gap-1">
            {label}
            {isActive && <Sparkles className="size-2 text-primary animate-bounce" />}
          </span>
          <span className="text-[8px] font-mono text-muted-foreground uppercase tracking-wider">
            {wakeLockActive ? 'WAKELOCK ACTIVO' : errorMsg ? 'MODO PASIVO' : 'EN ESPERA'}
          </span>
        </div>
      </div>

      {/* CABLES GL VISUAL SIGNALLING CANVAS */}
      <div className="relative w-28 h-6 overflow-hidden opacity-85 select-none pointer-events-none">
        <canvas ref={canvasRef} className="w-full h-full" />
      </div>

      {/* SOVEREIGNTY STATUS INDICATOR */}
      <div className="flex items-center gap-1.5 pl-3 border-l border-border/40">
        <span className={`size-2 rounded-full transition-colors duration-500 ${
          isActive 
            ? 'bg-primary shadow-[0_0_8px_rgba(var(--primary-rgb),0.5)]' 
            : 'bg-muted-foreground/30'
        }`} />
        <span className="text-[8px] font-bold font-mono tracking-tighter text-muted-foreground uppercase">
          {isActive ? 'GPU_ON' : 'GPU_IDLE'}
        </span>
      </div>
    </div>
  );
};
