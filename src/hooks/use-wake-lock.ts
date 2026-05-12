/**
 * ⚓ ARTEFACTO: use-wake-lock.ts
 * ────────────
 * CAPA: Hooks / System (Browser Hardware Bridge)
 * VERSIÓN: 1.0.0
 * 
 * 🎯 FUNCTIONAL_SCOPE:
 * - Abstracción para la API nativa 'Screen Wake Lock'.
 * - Evita que el dispositivo entre en modo de ahorro de energía durante procesos de ingesta pesados.
 * 
 * 🛡️ AXIOMATIC_CONTRACT:
 * - MUST: Validar la compatibilidad de la API en el agente de usuario (Navigator).
 * - ALWAYS: Gestionar la liberación del bloqueo en el ciclo de desmontaje (Cleanup).
 * - NEVER: Exponer la lógica compleja de promesas a la capa de UI.
 * 
 * 📜 ARCH_DECISION: Se separa el control de hardware de la lógica de red para cumplir 
 * con el Axioma de Independencia de Nam P Suh.
 */

import { useRef, useCallback, useEffect } from 'react';

export function useWakeLock() {
  const wakeLockRef = useRef<any>(null);

  const request = useCallback(async () => {
    if (typeof window !== 'undefined' && 'wakeLock' in navigator) {
      try {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
        console.debug('[System] Wake Lock: Active');
      } catch (err) {
        console.warn('[System] Wake Lock: Request Denied', err);
      }
    }
  }, []);

  const release = useCallback(() => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release();
      wakeLockRef.current = null;
      console.debug('[System] Wake Lock: Released');
    }
  }, []);

  useEffect(() => {
    return () => {
      if (wakeLockRef.current) release();
    };
  }, [release]);

  return { 
    request, 
    release, 
    isActive: !!wakeLockRef.current 
  };
}
