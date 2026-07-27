'use client';

import React, { useState, useEffect } from 'react';
import { HardDrive, Loader2, CloudAlert, RefreshCw, Search, SlidersHorizontal, X } from 'lucide-react';
import { AgnosticTree, AgnosticAtom, AgnosticBreadcrumb } from '@/components/ui/agnostic-tree';
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

interface IntegrationSummary {
  isActive?: boolean;
  type?: string;
}

export function StorageWidgetClient({ userId, connectionIds }: StorageWidgetClientProps) {
  const [selectedAtom, setSelectedAtom] = useState<AgnosticAtom | null>(null);
  const [spaceData, setSpaceData] = useState<SpaceData | null>(null);
  const [loadingSpace, setLoadingSpace] = useState(false);
  const [activeSilo, setActiveSilo] = useState<string>('storage-union'); // 'storage-union', 'google-drive', 'mega', etc.
  const [activeProviders, setActiveProviders] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'file' | 'folder'>('all');
  const [currentPath, setCurrentPath] = useState<AgnosticBreadcrumb[]>([
    { id: 'root', name: 'Raíz de infraestructura' }
  ]);

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
        const active = (data.integrations as IntegrationSummary[] || [])
          .filter((integration) => integration.isActive && integration.type && integration.type !== 'notion' && integration.type !== 'google-sheets')
          .map((integration) => integration.type as string);
        setActiveProviders(active);
      }
    } catch (err) {
      console.error('[StorageWidgetClient] Failed to fetch active providers:', err);
    }
  };

  const handleRefreshAll = async () => {
    await Promise.all([
      fetchSpaceInfo(),
      fetchActiveProviders()
    ]);
  };

  useEffect(() => {
    const refreshTimer = window.setTimeout(() => {
      void Promise.all([fetchSpaceInfo(), fetchActiveProviders()]);
    }, 0);
    return () => window.clearTimeout(refreshTimer);
  }, []);

  // Compute final aggregated list of upstreams
  const allUpstreams = [...new Set(activeProviders)];

  const handleSiloChange = (siloId: string) => {
    setActiveSilo(siloId);
    setSelectedAtom(null);
    setSearchQuery('');
    setTypeFilter('all');
    setCurrentPath([{ id: 'root', name: 'Raíz de infraestructura' }]);
  };

  const selectedConnectionId = selectedAtom?.provider
    ? connectionIds[selectedAtom.provider]
    : connectionIds[activeSilo];

  return (
    <div className="w-full flex h-full min-h-[620px] border border-border/40 rounded-2xl overflow-hidden bg-background/30 backdrop-blur-md shadow-2xl relative animate-in fade-in duration-500">
      {/* Glow highlight */}
      <div className="absolute -top-12 -left-12 w-64 h-64 bg-indigo-500/5 rounded-full blur-[120px] pointer-events-none" />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full min-w-0">
        {/* Header Dashboard */}
        <div className="p-4 border-b border-border/30 bg-muted/15 flex flex-col gap-3 z-10">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <HardDrive className="size-4 text-indigo-500" />
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">Explorador de archivos</h2>
              <p className="text-[10px] text-muted-foreground">Navega por tus silos sin perder el origen de cada archivo.</p>
            </div>
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

          <div className="flex flex-col md:flex-row gap-2">
            <label className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Buscar en la carpeta actual..."
                className="h-9 w-full rounded-lg border border-border/50 bg-background/70 pl-9 pr-9 text-xs outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/10"
                aria-label="Buscar archivos"
              />
              {searchQuery && (
                <button type="button" onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground" aria-label="Limpiar búsqueda">
                  <X className="size-3.5" />
                </button>
              )}
            </label>
            <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-background/50 px-2">
              <SlidersHorizontal className="size-3.5 text-muted-foreground" />
              <select
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value as 'all' | 'file' | 'folder')}
                className="h-8 bg-transparent text-[10px] font-semibold uppercase tracking-wide outline-none"
                aria-label="Filtrar por tipo"
              >
                <option value="all">Todos</option>
                <option value="folder">Carpetas</option>
                <option value="file">Archivos</option>
              </select>
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
        <div className="flex-1 min-h-0 relative p-4 flex flex-col">
          <div className="mb-3 flex items-center gap-2 overflow-x-auto text-[10px] text-muted-foreground custom-scrollbar">
            <span className="shrink-0 font-semibold uppercase tracking-wider text-foreground/70">Ubicación</span>
            {currentPath.map((crumb, index) => (
              <span key={`${crumb.id}-${index}`} className="flex shrink-0 items-center gap-2">
                <span className="text-border">/</span>
                <span className={cn(index === currentPath.length - 1 ? 'font-semibold text-foreground' : '')}>{crumb.name}</span>
              </span>
            ))}
          </div>
          <AgnosticTree
            integrationId={activeSilo}
            onSelect={(atom) => setSelectedAtom(atom)}
            onPathChange={setCurrentPath}
            searchQuery={searchQuery}
            typeFilter={typeFilter}
            initialSelectedId="root"
            className="flex-1 min-h-0 border-0 bg-transparent rounded-none"
          />
        </div>
      </div>

      {/* Slide-out Media Preview Panel */}
      <MediaPreview
        atom={selectedAtom}
        connectionId={selectedConnectionId}
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
