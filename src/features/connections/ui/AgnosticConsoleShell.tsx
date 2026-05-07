'use client';

import { useState } from 'react';
import { Shield, Loader2, Zap, LayoutPanelLeft, Layers, Terminal } from 'lucide-react';
import { i18n } from '@/lib/i18n';
import { useIntegrationState } from '../logic/useIntegrationState';
import { ProviderEntityRow } from './ProviderEntityRow';
import { IntegrationMetricsGrid } from './IntegrationMetricsGrid';
import { PortCreator } from '@/components/ports/port-creator';
import { cn } from '@/lib/utils';

const t = i18n.es;

type ConsoleTab = 'infrastructure' | 'ingestion' | 'workflows';

export function AgnosticConsoleShell() {
  const { 
    userId, 
    status, 
    loading, 
    isProcessing, 
    availableProviders, 
    activeConnections, 
    INDRA_ADAPTERS, 
    metrics, 
    actions,
    state 
  } = useIntegrationState();

  const [activeTab, setActiveTab] = useState<ConsoleTab>('infrastructure');

  if (status === 'loading' || loading) {
    return (
      <div className="flex flex-col items-center justify-center p-20 space-y-4">
        <Loader2 className="size-8 animate-spin text-primary opacity-20" />
        <p className="text-[10px] uppercase font-bold tracking-[0.4em] text-muted-foreground animate-pulse">Synchronizing Kernel...</p>
      </div>
    );
  }

  const sortedAdapters = [...INDRA_ADAPTERS].sort((a, b) => {
    const aActive = activeConnections.some(c => c.type === a.id);
    const bActive = activeConnections.some(c => c.type === b.id);
    return aActive === bActive ? 0 : aActive ? -1 : 1;
  });

  return (
    <div className="space-y-10 animate-in fade-in duration-700">
      
      {/* GLOBAL HEADER: IDENTITY & KPI SUMMARY */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-6 bg-muted/20 p-6 rounded-2xl border border-border/50">
        <div className="flex items-center gap-4">
          <div className="size-12 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
            <Shield className="size-6 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-bold tracking-tighter text-foreground uppercase">Sovereign Environment</h3>
            <p className="text-[10px] text-muted-foreground font-mono opacity-60">KERNEL_ID: {userId?.slice(0, 8)}...{userId?.slice(-4)}</p>
          </div>
        </div>
        <div className="flex gap-8">
          <div className="text-right">
            <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Coverage</p>
            <p className="text-xl font-black text-emerald-500">{metrics.coverage}%</p>
          </div>
          <div className="text-right">
            <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Nodes</p>
            <p className="text-xl font-black text-foreground">{metrics.configuredNango}/{metrics.totalAdapters}</p>
          </div>
        </div>
      </div>

      {/* TABS NAVIGATION */}
      <div className="flex gap-1 p-1 bg-muted/30 rounded-xl w-fit border border-border">
        <button 
          onClick={() => setActiveTab('infrastructure')}
          className={cn(
            "flex items-center gap-2 px-6 py-2.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all",
            activeTab === 'infrastructure' ? "bg-background text-primary shadow-sm border border-border" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Layers className="size-3" />
          1. Infrastructure
        </button>
        <button 
          onClick={() => setActiveTab('ingestion')}
          className={cn(
            "flex items-center gap-2 px-6 py-2.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all",
            activeTab === 'ingestion' ? "bg-background text-primary shadow-sm border border-border" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Zap className="size-3" />
          2. Ingestion
        </button>
        <button 
          onClick={() => setActiveTab('workflows')}
          className={cn(
            "flex items-center gap-2 px-6 py-2.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all",
            activeTab === 'workflows' ? "bg-background text-primary shadow-sm border border-border" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Terminal className="size-3" />
          3. Workflows
        </button>
      </div>

      {/* TAB CONTENT: INFRASTRUCTURE (WIDGET 1) */}
      {activeTab === 'infrastructure' && (
        <div className="space-y-6 animate-in slide-in-from-left-4 duration-500">
          <div className="flex flex-col gap-1 ml-1">
            <h4 className="text-[10px] font-bold uppercase tracking-[0.3em] text-primary">Structural Provider Catalog</h4>
            <p className="text-xs text-muted-foreground">Expose, configure, and operate your sovereign infrastructure nodes.</p>
          </div>
          
          <div className="flex flex-col gap-4">
            {sortedAdapters.map(manifest => {
              const isNangoConfigured = availableProviders.some(p => p.provider === manifest.id);
              const activeConnection = activeConnections.find(c => c.type === manifest.id);

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
                  refreshData={actions.refreshData}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* TAB CONTENT: INGESTION (WIDGET 2) */}
      {activeTab === 'ingestion' && (
        <div className="space-y-8 animate-in slide-in-from-right-4 duration-500">
          <div className="flex flex-col gap-1 ml-1">
            <h4 className="text-[10px] font-bold uppercase tracking-[0.3em] text-primary">Ingestion Funnel Designer</h4>
            <p className="text-xs text-muted-foreground">Map active infrastructure nodes to public data entry points.</p>
          </div>
          
          <div className="bg-card border border-border p-8 rounded-2xl">
            {/* Reuse PortCreator but we can wrap it or specialize it later */}
            <PortCreator 
              connections={activeConnections.map(c => ({
                id: c.id,
                label: c.label,
                integration: c.type,
                type: c.type,
                connectionId: c.id
              }))} 
            />
          </div>
        </div>
      )}

      {/* TAB CONTENT: WORKFLOWS (WIDGET 3) */}
      {activeTab === 'workflows' && (
        <div className="p-20 border border-dashed border-border rounded-2xl flex flex-col items-center justify-center opacity-40 grayscale animate-in zoom-in-95 duration-500">
          <LayoutPanelLeft className="size-12 text-muted-foreground mb-4" />
          <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-muted-foreground text-center">Workflow Engine Proxy</p>
          <p className="text-[9px] text-muted-foreground mt-2 italic">Awaiting node stabilization...</p>
        </div>
      )}

    </div>
  );
}
