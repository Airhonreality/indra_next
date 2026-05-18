'use client';

import React, { useState, useEffect } from 'react';
import { HardDrive, Loader2, CloudAlert, RefreshCw } from 'lucide-react';
import { AgnosticTree, AgnosticAtom } from '@/components/ui/agnostic-tree';
import { MediaPreview } from './MediaPreview';
import { ProviderBadge } from './ProviderBadge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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

export function StorageWidgetClient({ userId, connectionIds }: StorageWidgetClientProps) {
  const [selectedAtom, setSelectedAtom] = useState<AgnosticAtom | null>(null);
  const [spaceData, setSpaceData] = useState<SpaceData | null>(null);
  const [loadingSpace, setLoadingSpace] = useState(false);
  const [activeSilo, setActiveSilo] = useState<string>('storage-union'); // 'storage-union', 'google-drive', 'mega', etc.
  const [isMegaConnected, setIsMegaConnected] = useState(false);
  const [activeProviders, setActiveProviders] = useState<string[]>([]);

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

  // 2. Fetch active storage integrations to construct the upstreams list dynamically
  const fetchActiveProviders = async () => {
    try {
      const res = await fetch('/api/integrations');
      if (res.ok) {
        const data = await res.json();
        const active = (data.integrations || [])
          .filter((i: any) => i.isActive && i.type !== 'notion' && i.type !== 'google-sheets')
          .map((i: any) => i.type);
        setActiveProviders(active);
      }
    } catch (err) {
      console.error('[StorageWidgetClient] Failed to fetch active providers:', err);
    }
  };

  // 3. Verify if MEGA is active in client IndexedDB
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
        setIsMegaConnected(!!(req.result && req.result.encryptedPayload));
      };
    } catch {
      setIsMegaConnected(false);
    }
  };

  const handleRefreshAll = async () => {
    await Promise.all([
      fetchSpaceInfo(),
      fetchActiveProviders(),
      checkMegaStatus()
    ]);
  };

  useEffect(() => {
    handleRefreshAll();
  }, []);

  // Compute final aggregated list of upstreams
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

  return (
    <div className="w-full flex h-full border border-border/40 rounded-2xl overflow-hidden bg-background/30 backdrop-blur-md shadow-2xl relative animate-in fade-in duration-500 min-h-[500px]">
      {/* Glow highlight */}
      <div className="absolute -top-12 -left-12 w-64 h-64 bg-indigo-500/5 rounded-full blur-[120px] pointer-events-none" />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full min-w-0">
        {/* Header Dashboard */}
        <div className="p-4 border-b border-border/30 bg-muted/15 flex flex-col md:flex-row md:items-center justify-between gap-4 z-10">
          <div className="flex items-center gap-2.5">
            <HardDrive className="size-4 text-indigo-500" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">
              Explorador Virtual de Archivos
            </h2>
          </div>

          {/* Quick Filters / Active upstreams */}
          <div className="flex flex-wrap items-center gap-2">
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

            {/* Recargar */}
            <div className="flex items-center gap-1 border-l border-border/30 pl-2">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={handleRefreshAll}
                disabled={loadingSpace}
                className="size-7 rounded-full hover:bg-muted/60 text-muted-foreground"
                title="Recargar explorador de silos"
              >
                {loadingSpace ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="size-3.5" />
                )}
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
          <AgnosticTree
            integrationId={activeSilo}
            onSelect={(atom) => setSelectedAtom(atom)}
            initialSelectedId="root"
            className="flex-1 min-h-0 border-0 bg-transparent rounded-none"
          />
        </div>
      </div>

      {/* Slide-out Media Preview Panel */}
      <MediaPreview
        atom={selectedAtom}
        connectionId={connectionIds['google-drive'] || connectionIds['onedrive']}
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
