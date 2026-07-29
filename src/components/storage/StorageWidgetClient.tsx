'use client';

import React, { useEffect, useState } from 'react';
import { HardDrive, Loader2, CloudAlert, RefreshCw, Search, SlidersHorizontal, X } from 'lucide-react';
import { AgnosticTree, AgnosticAtom, AgnosticBreadcrumb } from '@/components/ui/agnostic-tree';
import { MediaPreview } from './MediaPreview';
import { ProviderBadge } from './ProviderBadge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { StorageConnectionDescriptor } from './storage-types';

interface StorageWidgetClientProps {
  userId: string;
  connections: StorageConnectionDescriptor[];
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

export function StorageWidgetClient({ userId: _userId, connections }: StorageWidgetClientProps) {
  const [selectedAtom, setSelectedAtom] = useState<AgnosticAtom | null>(null);
  const [spaceData, setSpaceData] = useState<SpaceData | null>(null);
  const [loadingSpace, setLoadingSpace] = useState(false);
  const [activeSilo, setActiveSilo] = useState<string>('storage-union');
  const [activeProviders, setActiveProviders] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'file' | 'folder'>('all');
  const [currentPath, setCurrentPath] = useState<AgnosticBreadcrumb[]>([
    { id: 'root', name: 'Raiz de infraestructura' }
  ]);

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
          errors: data.errors,
        });
      }
    } catch (err) {
      console.error('[StorageWidgetClient] Failed to load storage space quota:', err);
    } finally {
      setLoadingSpace(false);
    }
  };

  const fetchActiveProviders = async () => {
    try {
      const res = await fetch('/api/integrations');
      if (res.ok) {
        const data = await res.json();
        const active = ((data.integrations as IntegrationSummary[]) || [])
          .filter((integration) => integration.isActive && integration.type && integration.type !== 'notion' && integration.type !== 'google-sheets')
          .map((integration) => integration.type as string);
        setActiveProviders(active);
      }
    } catch (err) {
      console.error('[StorageWidgetClient] Failed to fetch active providers:', err);
    }
  };

  const handleRefreshAll = async () => {
    await Promise.all([fetchSpaceInfo(), fetchActiveProviders()]);
  };

  useEffect(() => {
    const refreshTimer = window.setTimeout(() => {
      void Promise.all([fetchSpaceInfo(), fetchActiveProviders()]);
    }, 0);
    return () => window.clearTimeout(refreshTimer);
  }, []);

  const allUpstreams = [...new Set(activeProviders)];
  const hasActiveUpstreams = allUpstreams.length > 0;
  const activeProvider = selectedAtom?.provider ?? (activeSilo !== 'storage-union' ? activeSilo : undefined);
  const activeConnections = activeProvider
    ? connections.filter((connection) => connection.type === activeProvider)
    : [];
  const selectedConnection = activeConnections[0] ?? connections[0] ?? null;
  const selectedConnectionId = selectedConnection?.connectionId ?? selectedConnection?.id;

  const handleSiloChange = (siloId: string) => {
    setActiveSilo(siloId);
    setSelectedAtom(null);
    setSearchQuery('');
    setTypeFilter('all');
    setCurrentPath([{ id: 'root', name: 'Raiz de infraestructura' }]);
  };

  return (
    <div className="relative flex h-full min-h-[620px] w-full overflow-hidden rounded-2xl border border-border/40 bg-background/30 shadow-2xl backdrop-blur-md animate-in fade-in duration-500" data-user-id={_userId}>
      <div className="pointer-events-none absolute -left-12 -top-12 h-64 w-64 rounded-full bg-indigo-500/5 blur-[120px]" />

      <div className="flex h-full min-w-0 flex-1 flex-col">
        <div className="z-10 flex flex-col gap-3 border-b border-border/30 bg-muted/15 p-4">
          <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
            <div className="flex items-center gap-2.5">
              <HardDrive className="size-4 text-indigo-500" />
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">Explorador de archivos</h2>
                <p className="text-[10px] text-muted-foreground">Navega por tus silos sin perder el origen de cada archivo.</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleSiloChange('storage-union')}
                className={cn(
                  'h-7 rounded-lg border-indigo-500/20 px-3 text-[9px] font-bold uppercase tracking-widest transition-all hover:bg-indigo-500/10',
                  activeSilo === 'storage-union'
                    ? 'border-indigo-500 bg-indigo-600/20 text-indigo-400'
                    : 'bg-muted/30 text-muted-foreground'
                )}
              >
                Union Unificada
              </Button>

              {allUpstreams.map((prov) => (
                <button
                  type="button"
                  key={prov}
                  onClick={() => handleSiloChange(prov)}
                  className={cn(
                    'rounded-lg transition-all duration-300 hover:scale-105',
                    activeSilo === prov ? 'ring-1 ring-primary ring-offset-2 ring-offset-background' : 'opacity-80 hover:opacity-100'
                  )}
                >
                  <ProviderBadge provider={prov} size="xs" showLabel />
                </button>
              ))}

              <div className="flex items-center gap-1 border-l border-border/30 pl-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={handleRefreshAll}
                  disabled={loadingSpace}
                  className="size-7 rounded-full text-muted-foreground hover:bg-muted/60"
                  title="Recargar explorador de silos"
                >
                  {loadingSpace ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                </Button>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[10px]">
            <span className="font-semibold uppercase tracking-wider text-muted-foreground">Conexion activa</span>
            {selectedConnection ? (
              <>
                <span
                  className="rounded-full border border-border/50 bg-background/70 px-2 py-1 font-mono text-[10px] text-foreground"
                  title={`${selectedConnection.label} | ${selectedConnection.type} | ${selectedConnection.connectionId ?? selectedConnection.id}`}
                >
                  {selectedConnection.label}
                </span>
                <span
                  className="rounded-full border border-border/30 bg-muted/40 px-2 py-1 font-mono text-[10px] text-muted-foreground"
                  title={selectedConnection.connectionId ?? selectedConnection.id}
                >
                  {selectedConnection.connectionId ?? selectedConnection.id}
                </span>
                {activeConnections.length > 1 && (
                  <span className="text-muted-foreground">
                    Seleccion determinista por etiqueta e ID para {activeConnections.length} conexiones de este proveedor.
                  </span>
                )}
              </>
            ) : (
              <span className="text-muted-foreground">No hay conexiones activas para este silo.</span>
            )}
          </div>

          <div className="flex flex-col gap-2 md:flex-row">
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
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                  aria-label="Limpiar busqueda"
                >
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

          {!hasActiveUpstreams && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-950/10 px-3 py-2 text-[10px] leading-relaxed text-amber-400">
              No hay silos activos todavia. Conecta una familia desde la pantalla de conexiones para poblar la union unificada y conservar la trazabilidad de origen.
            </div>
          )}
        </div>

        {spaceData && (
          <div className="flex items-center justify-between gap-4 border-b border-border/20 bg-muted/5 px-4 py-2 text-[10px] text-zinc-500">
            <div className="flex flex-1 items-center gap-3">
              <span className="shrink-0 text-[8px] font-semibold uppercase tracking-wider">Cuota Combinada</span>
              <div className="relative h-1.5 flex-1 overflow-hidden rounded-full border border-border/10 bg-border/40">
                <div
                  className="h-full rounded-full bg-indigo-500 transition-all duration-1000"
                  style={{ width: `${Math.min(100, (spaceData.used / spaceData.total) * 100)}%` }}
                />
              </div>
            </div>
            <span className="shrink-0 font-mono">
              {formatBytes(spaceData.used)} / {formatBytes(spaceData.total)} ({Math.round((spaceData.used / spaceData.total) * 100)}% usado)
            </span>
          </div>
        )}

        {spaceData?.errors && spaceData.errors.length > 0 && (
          <div className="flex items-center gap-2 border-b border-red-500/20 bg-red-950/20 px-4 py-2 text-[9px] font-bold tracking-wide text-red-400">
            <CloudAlert className="size-3 shrink-0" />
            <span>Alerta: Error parcial en infraestructura ({spaceData.errors.join(', ')})</span>
          </div>
        )}

        <div className="relative flex flex-1 min-h-0 flex-col p-4">
          <div className="mb-3 flex items-center gap-2 overflow-x-auto text-[10px] text-muted-foreground custom-scrollbar">
            <span className="shrink-0 font-semibold uppercase tracking-wider text-foreground/70">Ubicacion</span>
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
            className="min-h-0 flex-1 rounded-none border-0 bg-transparent"
          />
        </div>
      </div>

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
  if (bytes === Infinity) return 'infinite';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export default StorageWidgetClient;
