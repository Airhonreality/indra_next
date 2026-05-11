/**
 * 🧠 ARTEFACTO: useIntegrationState.ts
 * ────────────
 * CAPA: Features / Connections (State Logic)
 * VERSIÓN: 1.5.0
 * COMMIT: P3-M1.4-STATE-ORCHESTRATION-STABILITY
 * 
 * 🎯 FUNCTIONAL_SCOPE:
 * - Orquestador central del estado de la Shell de Infraestructura.
 * - Gestión del ciclo de vida de conexiones (Discovery -> Auth -> Hydration).
 * - Cálculo de KPIs de cobertura de adaptadores (Indra vs. Nango Catalog).
 * 
 * 🛡️ AXIOMATIC_CONTRACT:
 * - MUST: Garantizar la atomicidad en la actualización de 'activeConnections' tras cambios en el Backend.
 * - NEVER: Realizar lógica de negocio específica de un proveedor; delegar a los adaptadores del Kernel.
 * - NEVER: Silenciar errores de red; deben ser proyectados al estado para visibilidad del usuario.
 * - ALWAYS: Utilizar el 'connectionId' persistido para evitar la duplicidad de sesiones en Nango.
 * 
 * 📜 ARCH_DECISION: Se mantiene el estado de 'isProcessing' a nivel de ID de proveedor para evitar colisiones visuales durante operaciones asíncronas concurrentes.
 * 
 * 🔑 KEYWORDS: #StateOrchestrator #IntegrationLogic #OAuthFlow #CoverageMetrics
 * 🔗 RELATIONSHIPS: [AgnosticConsoleShell, ProviderEntityRow, AuthorizedClient]
 */

import { useState, useEffect } from 'react';
import Nango from '@nangohq/frontend';
import { ProviderConfig, Connection, INDRA_ADAPTERS } from '../integration_types';
import { useSession } from 'next-auth/react';

export function useIntegrationState() {
  const { data: session, status } = useSession();
  const userId = session?.user?.id;

  const [availableProviders, setAvailableProviders] = useState<ProviderConfig[]>([]);
  const [activeConnections, setActiveConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState<string | null>(null);
  const [localPaths, setLocalPaths] = useState<Record<string, string>>({});

  const nango = new Nango();

  const refreshData = async () => {
    if (!userId) return;
    try {
      const [discoveryRes, connectionsRes] = await Promise.all([
        fetch('/api/discovery/integrations'),
        fetch(`/api/integrations?userId=${userId}`)
      ]);

      const discoveryData = await discoveryRes.json();
      const connectionsData = await connectionsRes.json();

      setAvailableProviders(discoveryData.providers || []);
      setActiveConnections(connectionsData.integrations || []);
    } catch (err) {
      console.error('[useConnections]: Initialization failed', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (status === 'authenticated') refreshData();
  }, [status, userId]);

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
              fetch('/api/integrations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  type: provider,
                  label: `${provider.charAt(0).toUpperCase() + provider.slice(1)} Connection`,
                  connectionId: event.connectionId || userId
                })
              }).then(() => refreshData()).then(resolve);
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
          connectionId: 'local_volume'
        })
      });
      await refreshData();
    } finally {
      setIsProcessing(null);
    }
  };

  const disconnectIntegration = async (id: string) => {
    if (!userId) return;
    setIsProcessing(id);
    try {
      await fetch(`/api/integrations/${id}`, { method: 'DELETE' });
      await refreshData();
    } catch (err) {
      console.error('[Disconnect Error]:', err);
    } finally {
      setIsProcessing(null);
    }
  };

  // KPI Calculations
  const translatedNangoProviders = availableProviders.filter(p => INDRA_ADAPTERS.some(a => a.id === p.provider));
  const translationKPI = availableProviders.length > 0 
    ? Math.round((translatedNangoProviders.length / availableProviders.length) * 100) 
    : 0;

  return {
    userId,
    status,
    loading,
    isProcessing,
    availableProviders,
    activeConnections,
    INDRA_ADAPTERS,
    metrics: {
      totalAdapters: INDRA_ADAPTERS.length,
      configuredNango: availableProviders.length,
      coverage: translationKPI
    },
    actions: {
      refreshData,
      authorizeOAuth,
      mountLocalProvider,
      disconnectIntegration,
      setLocalPath: (id: string, path: string) => setLocalPaths(prev => ({ ...prev, [id]: path }))
    },
    state: {
      localPaths
    }
  };
}
