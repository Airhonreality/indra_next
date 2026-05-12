/**
 * 🧠 ARTEFACTO: use-ingestion-ports.ts
 * ────────────
 * CAPA: Hooks / Persistence (Discovery Layer)
 * VERSIÓN: 1.0.0
 * 
 * 🎯 FUNCTIONAL_SCOPE:
 * - Recuperación reactiva de los Puertos de Ingesta (Proyectos) asociados a una conexión.
 * - Sincronización entre la base de datos de 'ingestion_ports' y la UI de la Shell.
 */

import { useState, useEffect, useCallback } from 'react';

export function useIngestionPorts(connectionId?: string) {
  const [ports, setPorts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const url = connectionId ? `/api/p?connectionId=${connectionId}` : '/api/p';
      const res = await fetch(url);
      const data = await res.json();
      if (data.ports) setPorts(data.ports);
    } catch (err) {
      console.error('[Indra Memory Error] Failed to fetch ports:', err);
    } finally {
      setIsLoading(false);
    }
  }, [connectionId]);

  useEffect(() => {
    // We always refresh if it's global or if we have a connectionId
    refresh();
  }, [refresh]);

  return { ports, isLoading, refresh };
}
