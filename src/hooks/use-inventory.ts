/**
 * 🎣 ARTEFACTO: use-inventory.ts
 * ────────────
 * CAPA: Hooks / Infrastructure (Data Hydrator)
 * VERSIÓN: 1.2.0
 * COMMIT: P3-M4.4-HOOK-AGNOSTIC-QUERY-INTEGRATION
 * 
 * 🎯 FUNCTIONAL_SCOPE:
 * - Centralizar la lógica de descubrimiento de átomos (Inventory Discovery) para silos y portales.
 * - Gestionar estados de hidratación, búsqueda reactiva y errores de forma agnóstica.
 * - Sincronizar el cliente con el esquema 'AgnosticQuery' del Kernel.
 * 
 * 🛡️ AXIOMATIC_CONTRACT:
 * - MUST: Devolver siempre arrays tipados de 'AgnosticInventoryItem' para garantizar la interoperabilidad.
 * - NEVER: Realizar mutaciones directas sobre los ítems; el hook es de solo lectura (discovery).
 * - ALWAYS: Normalizar los parámetros de búsqueda en la URL mediante el esquema canónico.
 * 
 * 📜 ARCH_DECISION: Se adopta el modelo de 'Structured Parameters' para evitar la entropía de URLs; todos los parámetros (limit, search, type) se inyectan dinámicamente en el QueryString.
 * 
 * 🔑 KEYWORDS: #InventoryHook #DataHydration #AgnosticQuery #DiscoveryEngine
 * 🔗 RELATIONSHIPS: [ProviderEntityRow, PortCreator, AgnosticTree, AgnosticQuerySchema]
 */

import { useState, useCallback, useEffect } from 'react';
import { AgnosticInventoryItem, AgnosticQuery } from '@/core/inventory/types';

export function useInventory(integrationId?: string, query: Partial<AgnosticQuery> = {}) {
  const [items, setItems] = useState<AgnosticInventoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Destructure query with defaults for stable deps
  const { 
    parentId = 'root', 
    search = '', 
    type = 'all', 
    limit = 50 
  } = query;

  const refresh = useCallback(async () => {
    if (!integrationId) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const params = new URLSearchParams({
        parentId,
        limit: limit.toString(),
        type,
        ...(search && { search })
      });

      const res = await fetch(`/api/integrations/${integrationId}/inventory?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to hydrate inventory');
      
      const data = await res.json();
      setItems(data.objects || []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown hydration error';
      setError(msg);
      console.error(`[useInventory] Hydration failed for ${integrationId}:`, msg);
    } finally {
      setIsLoading(false);
    }
  }, [integrationId, parentId, search, type, limit]);

  // Auto-hydrate when integration or critical query params change
  useEffect(() => {
    if (integrationId) {
      refresh();
    } else {
      setItems([]);
    }
  }, [integrationId, refresh]);

  const folders = items.filter(i => i.type === 'folder');
  const files = items.filter(i => i.type === 'file');

  return {
    items,
    folders,
    files,
    isLoading,
    error,
    refresh
  };
}
