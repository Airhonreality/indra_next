'use client';

/**
 * 📊 ARTEFACTO: MetricsPanel.tsx
 * ────────────
 * CAPA: UI / Features (Settings Tab)
 * VERSIÓN: 1.2.0 — KPIs via Zustand selectMetrics + useShallow (zero stale recomputation)
 */

import { useShallow } from 'zustand/shallow';
import { useConnections } from '@/hooks/use-connections';
import { useIndraStore, selectMetrics } from '@/stores/indra-store';
import { IntegrationMetricsGrid } from './IntegrationMetricsGrid';
import { Loader2 } from 'lucide-react';

export function MetricsPanel() {
  // Triggers the fetch that writes cachedProviders to the store
  const { isLoading } = useConnections();
  // Reads memoized KPIs — only re-renders when provider counts actually change
  const metrics = useIndraStore(useShallow(selectMetrics));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="size-6 animate-spin text-muted-foreground opacity-30" />
      </div>
    );
  }

  return <IntegrationMetricsGrid {...metrics} />;
}
