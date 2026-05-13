import { useState, useEffect } from 'react';
import { useIndraStore } from '@/stores/indra-store';
import type { ProviderConfig, Connection } from '@/features/connections/integration_types';

export function useConnections() {
  const userId = useIndraStore((s) => s.userId);
  const sessionStatus = useIndraStore((s) => s.sessionStatus);
  const invalidationKey = useIndraStore((s) => s._invalidationCounter['connections'] ?? 0);
  const setCachedProviders = useIndraStore((s) => s.setCachedProviders);

  const [activeConnections, setActiveConnections] = useState<Connection[]>([]);
  const [availableProviders, setAvailableProviders] = useState<ProviderConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (sessionStatus === 'unauthenticated') {
      setIsLoading(false);
      return;
    }
    if (sessionStatus !== 'authenticated' || !userId) return;

    let cancelled = false;
    setIsLoading(true);

    Promise.all([
      fetch('/api/discovery/integrations'),
      fetch(`/api/integrations?userId=${userId}`),
    ])
      .then(([dr, cr]) => Promise.all([dr.json(), cr.json()]))
      .then(([discovery, connections]) => {
        if (cancelled) return;
        const providers: ProviderConfig[] = discovery.providers || [];
        setAvailableProviders(providers);
        setCachedProviders(providers); // write to store for selectMetrics
        setActiveConnections(connections.integrations || []);
      })
      .catch((err) => console.error('[useConnections]: fetch failed', err))
      .finally(() => { if (!cancelled) setIsLoading(false); });

    return () => { cancelled = true; };
  }, [sessionStatus, userId, invalidationKey, setCachedProviders]);

  return { availableProviders, activeConnections, isLoading };
}
