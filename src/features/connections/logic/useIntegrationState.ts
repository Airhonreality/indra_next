/**
 * 🧠 ARTEFACTO: useIntegrationState.ts
 * ────────────
 * CAPA: Features / Connections (Action Layer)
 * VERSIÓN: 2.1.0 — Session identity from store, no direct useSession() call
 *
 * 🎯 FUNCTIONAL_SCOPE:
 * - Gestión del ciclo de vida de conexiones: OAuth, local mount, disconnect.
 * - Emite invalidate('connections') al completar cada acción.
 * - Obtiene userId del store (provisto por useSessionSync en el Shell).
 */

import { useState } from 'react';
import Nango from '@nangohq/frontend';
import { useIndraStore } from '@/stores/indra-store';

export function useIntegrationState() {
  const userId = useIndraStore((s) => s.userId);
  const invalidate = useIndraStore((s) => s.invalidate);

  const [isProcessing, setIsProcessing] = useState<string | null>(null);
  const [localPaths, setLocalPaths] = useState<Record<string, string>>({});

  const nango = new Nango();

  const authorizeOAuth = async (provider: string) => {
    if (!userId) return;
    setIsProcessing(provider);

    try {
      const sessionRes = await fetch('/api/nango/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ integrationId: provider }),
      });

      const { sessionToken, error } = await sessionRes.json();
      if (error) throw new Error(error);

      await new Promise<void>((resolve) => {
        const connect = nango.openConnectUI({
          onEvent: (event: any) => {
            if (event.type === 'connect') {
              const cId = event.connectionId || event.payload?.connectionId;
              fetch('/api/integrations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  type: provider,
                  label: `${provider.charAt(0).toUpperCase() + provider.slice(1)} Connection`,
                  connectionId: cId,
                }),
              })
                .then(() => invalidate('connections'))
                .then(resolve);
            } else if (event.type === 'close') {
              resolve();
            }
          },
        });
        connect.setSessionToken(sessionToken);
      });
    } catch (err) {
      console.error('[Authorization Error]:', err);
    } finally {
      setIsProcessing(null);
    }
  };

  const mountLocalProvider = async (providerId: string, path: string) => {
    if (!userId || !path) return;
    setIsProcessing(providerId);

    try {
      await fetch('/api/integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: providerId,
          label: `${providerId.toUpperCase()} [${path}]`,
          connectionId: `local-${providerId}-${userId}`,
        }),
      });
      invalidate('connections');
    } finally {
      setIsProcessing(null);
    }
  };

  const disconnectIntegration = async (id: string) => {
    if (!userId) return;
    setIsProcessing(id);
    try {
      await fetch(`/api/integrations/${id}`, { method: 'DELETE' });
      invalidate('connections');
    } catch (err) {
      console.error('[Disconnect Error]:', err);
    } finally {
      setIsProcessing(null);
    }
  };

  return {
    isProcessing,
    actions: {
      authorizeOAuth,
      mountLocalProvider,
      disconnectIntegration,
      setLocalPath: (id: string, path: string) =>
        setLocalPaths((prev) => ({ ...prev, [id]: path })),
    },
    state: { localPaths },
  };
}
