'use client';

/**
 * 🔭 ARTEFACTO: ExplorerPanel.tsx
 * ────────────
 * CAPA: UI / Features (Explorer Tab)
 * VERSIÓN: 1.0.0 — Autonomous Cell
 *
 * 🎯 FUNCTIONAL_SCOPE:
 * - Tab del explorador de silos auto-hidratado vía useConnections().
 * - El Shell no necesita saber nada de conexiones para renderizar este panel.
 */

import { Loader2 } from 'lucide-react';
import { useConnections } from '@/hooks/use-connections';
import { ResourceExplorer } from '@/components/resource-explorer';

export function ExplorerPanel() {
  const { activeConnections, isLoading } = useConnections();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="size-6 animate-spin text-muted-foreground opacity-30" />
      </div>
    );
  }

  const connectionConfigs = activeConnections.map((c) => ({
    id: c.id,
    label: c.label,
    integration: c.type,
    type: c.type,
    connectionId: c.id,
  }));

  return (
    <div className="bg-card border border-border p-8 rounded-2xl shadow-sm">
      <ResourceExplorer connections={connectionConfigs} />
    </div>
  );
}
