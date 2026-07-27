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
import { useIndraStore } from '@/stores/indra-store';
import { StorageWidgetClient } from '@/components/storage/StorageWidgetClient';

export function ExplorerPanel() {
  const { activeConnections, isLoading } = useConnections();
  const userId = useIndraStore((state) => state.userId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="size-6 animate-spin text-muted-foreground opacity-30" />
      </div>
    );
  }

  const connectionIds = Object.fromEntries(activeConnections.map((connection) => [connection.type, connection.id]));

  return (
    <div className="w-full">
      <StorageWidgetClient userId={userId ?? ''} connectionIds={connectionIds} />
    </div>
  );
}
