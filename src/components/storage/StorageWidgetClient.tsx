'use client';

import React, { useState, useEffect } from 'react';
import { Database, HardDrive, Loader2, CloudAlert, RefreshCw, Settings, Shield } from 'lucide-react';
import { AgnosticTree, AgnosticAtom } from '@/components/ui/agnostic-tree';
import { MediaPreview } from './MediaPreview';
import { ProviderBadge } from './ProviderBadge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { CredentialVault } from './CredentialVault';
import { useIntegrationState } from '@/features/connections/logic/useIntegrationState';

interface StorageWidgetClientProps {
  userId: string;
  connectionIds: Record<string, string>;
}

interface SpaceData {
  used: number;
  total: number;
  free: number;
  errors?: string[];
}

export function StorageWidgetClient({ userId, connectionIds: initialConnectionIds }: StorageWidgetClientProps) {
  const [selectedAtom, setSelectedAtom] = useState<AgnosticAtom | null>(null);
  const [spaceData, setSpaceData] = useState<SpaceData | null>(null);
  const [loadingSpace, setLoadingSpace] = useState(false);
  const [activeSilo, setActiveSilo] = useState<string>('storage-union'); // 'storage-union', 'google-drive', 'mega', etc.
  const [showSettings, setShowSettings] = useState(false);
  const [isMegaConnected, setIsMegaConnected] = useState(false);
  const [integrationsList, setIntegrationsList] = useState<any[]>([]);

  const { actions, isProcessing } = useIntegrationState();

  // 1. Fetch unified storage space quota
  const fetchSpaceInfo = async () => {
    setLoadingSpace(true);
    try {
      const res = await fetch('/api/storage/union/space');
      if (res.ok) {
        const data = await res.json();
        setSpaceData({
          used: data.used,
          total: data.total,
          free: data.free,
          errors: data.errors
        });
      }
    } catch (err) {
      console.error('[StorageWidgetClient] Failed to load storage space quota:', err);
    } finally {
      setLoadingSpace(false);
    }
  };

  // 2. Fetch connection lists from database
  const fetchIntegrations = async () => {
    try {
      const res = await fetch('/api/integrations');
      if (res.ok) {
        const data = await res.json();
        setIntegrationsList(data.integrations || []);
      }
    } catch (err) {
      console.error('[StorageWidgetClient] Failed to fetch integrations:', err);
    }
  };

  // 3. Verify if MEGA is connected in client's IndexedDB
  const checkMegaStatus = async () => {
    try {
      const openDb = (): Promise<IDBDatabase> => {
        return new Promise((resolve, reject) => {
          const req = indexedDB.open('indra-ipw-v1', 1);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
      };
      const db = await openDb();
      const tx = db.transaction('sessions', 'readonly');
      const req = tx.objectStore('sessions').get('mega-vault');
      req.onsuccess = () => {
        if (req.result && req.result.encryptedPayload) {
          setIsMegaConnected(true);
        } else {
          setIsMegaConnected(false);
        }
      };
    } catch {
      setIsMegaConnected(false);
    }
  };

  const handleRefreshAll = async () => {
    await Promise.all([
      fetchSpaceInfo(),
      fetchIntegrations(),
      checkMegaStatus()
    ]);
  };

  useEffect(() => {
    handleRefreshAll();
  }, []);

  // Compute active connection providers (excluding Notion/Sheets layout adapters for storage-only context)
  const activeProviders = integrationsList
    .filter(i => i.isActive && i.type !== 'notion' && i.type !== 'google-sheets')
    .map(i => i.type);

  // Unified upstreams filter including MEGA if actually connected in local IndexedDB
  const allUpstreams = [
    ...new Set([
      ...activeProviders,
      ...(isMegaConnected ? ['mega'] : [])
    ])
  ];

  const handleSiloChange = (siloId: string) => {
    setActiveSilo(siloId);
    setSelectedAtom(null);
  };

  // Connect provider using secure popups
  const handleConnectProvider = async (provider: string) => {
    try {
      await actions.authorizeOAuth(provider);
      await handleRefreshAll();
    } catch (err) {
      console.error('[StorageWidgetClient] Connection failed:', err);
    }
  };

  // Disconnect provider from database
  const handleDisconnectProvider = async (provider: string) => {
    const integration = integrationsList.find(i => i.type === provider);
    if (integration) {
      try {
        await actions.disconnectIntegration(integration.id);
        await handleRefreshAll();
        if (activeSilo === provider) {
          setActiveSilo('storage-union');
        }
      } catch (err) {
        console.error('[StorageWidgetClient] Disconnection failed:', err);
      }
    }
  };

  const googleIntegration = integrationsList.find(i => i.type === 'google-drive');
  const onedriveIntegration = integrationsList.find(i => i.type === 'onedrive');

  return (
    <div className="w-full flex h-[500px] border border-border/40 rounded-2xl overflow-hidden bg-background/30 backdrop-blur-md shadow-2xl relative animate-in fade-in duration-500">
      {/* Glow highlight */}
      <div className="absolute -top-12 -left-12 w-64 h-64 bg-indigo-500/5 rounded-full blur-[120px] pointer-events-none" />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full min-w-0">
        {/* Header Dashboard */}
        <div className="p-4 border-b border-border/30 bg-muted/15 flex flex-col md:flex-row md:items-center justify-between gap-4 z-10">
          <div className="flex items-center gap-2.5">
            <HardDrive className="size-4 text-indigo-500" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">
              Almacenamiento Virtual Soberano
            </h2>
          </div>

          {/* Quick Filters / Active upstreams */}
          <div className="flex flex-wrap items-center gap-2">
            {!showSettings && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleSiloChange('storage-union')}
                  className={cn(
                    "h-7 text-[9px] font-bold uppercase tracking-widest px-3 border-indigo-500/20 hover:bg-indigo-500/10 rounded-lg transition-all",
                    activeSilo === 'storage-union'
                      ? "bg-indigo-600/20 text-indigo-400 border-indigo-500"
                      : "bg-muted/30 text-muted-foreground"
                  )}
                >
                  Unión Unificada
                </Button>

                {allUpstreams.map((prov) => (
                  <button
                    type="button"
                    key={prov}
                    onClick={() => handleSiloChange(prov)}
                    className={cn(
                      "transition-all duration-300 rounded-lg hover:scale-105",
                      activeSilo === prov ? "ring-1 ring-primary ring-offset-2 ring-offset-background" : "opacity-80 hover:opacity-100"
                    )}
                  >
                    <ProviderBadge provider={prov} size="xs" showLabel />
                  </button>
                ))}
              </>
            )}

            {/* Recargar / Settings toggle */}
            <div className="flex items-center gap-1 border-l border-border/30 pl-2">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={handleRefreshAll}
                disabled={loadingSpace}
                className="size-7 rounded-full hover:bg-muted/60 text-muted-foreground"
                title="Recargar cuotas de espacio"
              >
                {loadingSpace ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="size-3.5" />
                )}
              </Button>

              <Button
                type="button"
                variant={showSettings ? 'secondary' : 'ghost'}
                size="icon"
                onClick={() => setShowSettings(!showSettings)}
                className="size-7 rounded-full text-muted-foreground hover:text-indigo-400"
                title="Configurar silos"
              >
                <Settings className={cn("size-3.5", showSettings && "animate-spin-once")} />
              </Button>
            </div>
          </div>
        </div>

        {/* Space Usage Quota Gauge */}
        {spaceData && (
          <div className="px-4 py-2 border-b border-border/20 bg-muted/5 flex items-center justify-between text-[10px] text-zinc-500 gap-4">
            <div className="flex-1 flex items-center gap-3">
              <span className="font-semibold uppercase text-[8px] tracking-wider shrink-0">Cuota Combinada</span>
              <div className="flex-1 h-1.5 bg-border/40 rounded-full overflow-hidden relative border border-border/10">
                <div
                  className="h-full bg-indigo-500 rounded-full transition-all duration-1000"
                  style={{ width: `${Math.min(100, (spaceData.used / spaceData.total) * 100)}%` }}
                />
              </div>
            </div>
            <span className="font-mono shrink-0">
              {formatBytes(spaceData.used)} / {formatBytes(spaceData.total)} ({Math.round((spaceData.used / spaceData.total) * 100)}% usado)
            </span>
          </div>
        )}

        {/* Warnings from partial outages */}
        {spaceData?.errors && spaceData.errors.length > 0 && (
          <div className="px-4 py-2 border-b border-red-500/20 bg-red-950/20 flex items-center gap-2 text-[9px] text-red-400 font-bold tracking-wide">
            <CloudAlert className="size-3 shrink-0" />
            <span>Alerta: Error parcial en infraestructura ({spaceData.errors.join(', ')})</span>
          </div>
        )}

        {/* Main Content Workspace Panel */}
        <div className="flex-1 min-h-0 relative p-4 flex flex-col justify-center">
          {showSettings ? (
            <div className="flex-1 overflow-y-auto space-y-6 max-w-xl mx-auto w-full p-2 custom-scrollbar animate-in zoom-in-95 duration-200">
              <div className="flex items-center justify-between border-b border-border/30 pb-3 mb-2">
                <div>
                  <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">Gestión de Integraciones</h3>
                  <p className="text-[9px] text-zinc-500">Conecta y autoriza tus silos de almacenamiento virtual.</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowSettings(false)}
                  className="h-7 text-[8px] font-bold uppercase tracking-widest px-3 border-indigo-500/20 text-indigo-400"
                >
                  Volver al Explorador
                </Button>
              </div>

              <div className="space-y-4">
                {/* Google Family */}
                <div className="p-4 rounded-2xl border border-border/40 bg-muted/10 backdrop-blur-md flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-foreground">Familia Google</span>
                    <p className="text-[9px] text-zinc-500 leading-normal">Un solo inicio de sesión activa Google Drive, Sheets y YouTube.</p>
                    {googleIntegration && (
                      <div className="flex gap-1 mt-1.5">
                        <span className="text-[8px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold uppercase">Drive</span>
                        <span className="text-[8px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold uppercase">Sheets</span>
                        <span className="text-[8px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold uppercase">YouTube</span>
                      </div>
                    )}
                  </div>
                  {googleIntegration ? (
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[8px] bg-emerald-950/20 border border-emerald-500/30 text-emerald-400 font-bold uppercase px-2 py-0.5 rounded-lg">Conectado</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={isProcessing === 'google-drive'}
                        onClick={() => handleDisconnectProvider('google-drive')}
                        className="h-7 text-[9px] font-bold uppercase tracking-wider text-red-400 hover:text-red-300 hover:bg-red-500/10"
                      >
                        {isProcessing === 'google-drive' ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          'Desconectar'
                        )}
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      disabled={isProcessing === 'google-drive'}
                      onClick={() => handleConnectProvider('google-drive')}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white text-[9px] uppercase tracking-wider font-bold h-8 rounded-lg px-3 shrink-0"
                    >
                      {isProcessing === 'google-drive' ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        'Conectar Google'
                      )}
                    </Button>
                  )}
                </div>

                {/* Microsoft Family */}
                <div className="p-4 rounded-2xl border border-border/40 bg-muted/10 backdrop-blur-md flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-foreground">Familia Microsoft</span>
                    <p className="text-[9px] text-zinc-500 leading-normal">Activa el almacenamiento OneDrive con tu cuenta Microsoft.</p>
                  </div>
                  {onedriveIntegration ? (
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[8px] bg-blue-950/20 border border-blue-500/30 text-blue-400 font-bold uppercase px-2 py-0.5 rounded-lg">Conectado</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={isProcessing === 'onedrive'}
                        onClick={() => handleDisconnectProvider('onedrive')}
                        className="h-7 text-[9px] font-bold uppercase tracking-wider text-red-400 hover:text-red-300 hover:bg-red-500/10"
                      >
                        {isProcessing === 'onedrive' ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          'Desconectar'
                        )}
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      disabled={isProcessing === 'onedrive'}
                      onClick={() => handleConnectProvider('onedrive')}
                      className="bg-blue-600 hover:bg-blue-500 text-white text-[9px] uppercase tracking-wider font-bold h-8 rounded-lg px-3 shrink-0"
                    >
                      {isProcessing === 'onedrive' ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        'Conectar Microsoft'
                      )}
                    </Button>
                  )}
                </div>

                {/* MEGA Cryptographic Vault */}
                <CredentialVault
                  userId={userId}
                  onSaved={async () => {
                    await checkMegaStatus();
                    await fetchSpaceInfo();
                  }}
                />
              </div>
            </div>
          ) : (
            <AgnosticTree
              integrationId={activeSilo}
              onSelect={(atom) => setSelectedAtom(atom)}
              initialSelectedId="root"
              className="flex-1 min-h-0 border-0 bg-transparent rounded-none"
            />
          )}
        </div>
      </div>

      {/* Slide-out Media Preview Panel */}
      <MediaPreview
        atom={selectedAtom}
        connectionId={googleIntegration?.connectionId || onedriveIntegration?.connectionId}
        onClose={() => setSelectedAtom(null)}
      />
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes === Infinity) return '∞';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
