'use client';

/**
 * 🖥️ ARTEFACTO: NodesPanel.tsx
 * ────────────
 * CAPA: UI / Features (Infrastructure Tab)
 * VERSIÓN: 1.0.0 — Autonomous Cell
 *
 * 🎯 FUNCTIONAL_SCOPE:
 * - Tab de infraestructura auto-hidratado: useConnections() + useIntegrationState().
 * - El Shell no necesita saber nada sobre conexiones para renderizar este panel.
 */

import { Loader2 } from 'lucide-react';
import { INDRA_ADAPTERS } from '../integration_types';
import { useConnections } from '@/hooks/use-connections';
import { useIntegrationState } from '../logic/useIntegrationState';
import { ProviderEntityRow } from './ProviderEntityRow';

export function NodesPanel() {
  const { availableProviders, activeConnections, isLoading } = useConnections();
  const { isProcessing, actions, state } = useIntegrationState();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="size-6 animate-spin text-muted-foreground opacity-30" />
      </div>
    );
  }

  const sortedAdapters = [...INDRA_ADAPTERS].sort((a, b) => {
    const aActive = activeConnections.some((c) => c.type === a.id);
    const bActive = activeConnections.some((c) => c.type === b.id);
    return aActive === bActive ? 0 : aActive ? -1 : 1;
  });

  return (
    <div className="grid grid-cols-1 gap-4">
      {sortedAdapters.map((manifest) => {
        const isNangoConfigured = availableProviders.some((p) => p.provider === manifest.id);
        const activeConnection = activeConnections.find((c) => c.type === manifest.id);
        return (
          <ProviderEntityRow
            key={manifest.id}
            manifest={manifest}
            isNangoConfigured={isNangoConfigured}
            activeConnection={activeConnection}
            isProcessing={isProcessing === manifest.id}
            localPathValue={state.localPaths[manifest.id] || ''}
            onSetLocalPath={(path) => actions.setLocalPath(manifest.id, path)}
            onAuthorize={actions.authorizeOAuth}
            onMountLocal={actions.mountLocalProvider}
            onDisconnect={actions.disconnectIntegration}
          />
        );
      })}
    </div>
  );
}
