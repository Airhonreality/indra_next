/**
 * 🏛️ ARTEFACTO: AgnosticConsoleShell.tsx
 * ────────────
 * CAPA: UI / Shell (Functional Projector)
 * VERSIÓN: 1.2.0
 * COMMIT: P2-M4.1-UI-WIDGET-SHELL
 * 
 * 🎯 FUNCTIONAL_SCOPE:
 * - Contenedor principal para la proyección de micro-apps (widgets funcionales) de Indra.
 * - Gestión de navegación entre contextos: [Infraestructura, Ingestión, Workflows].
 * - Orquestación de estados globales de sincronización del Kernel.
 * 
 * 🛡️ AXIOMATIC_CONTRACT:
 * - MUST: Ser un contenedor puro; la lógica de negocio debe vivir en los widgets proyectados o hooks.
 * - NEVER: Acoplarse a un proveedor específico. Su función es proyectar lo que el Kernel expone.
 * - ALWAYS: Mantener la estética "esquemática/diario" (colores crema, tipografía técnica).
 * 
 * 🔑 KEYWORDS: #WidgetProjector #MicroApps #DashboardShell #AgnosticUI
 * 🔗 RELATIONSHIPS: [ProviderEntityRow, PortCreator, useIntegrationState]
 */

'use client';

import { useState } from 'react';
import { signOut } from 'next-auth/react';
import { 
  Shield, 
  Loader2, 
  Zap, 
  LayoutPanelLeft, 
  Layers, 
  Terminal, 
  Settings, 
  Database,
  Activity,
  User,
  ExternalLink,
  ChevronRight,
  LogOut
} from 'lucide-react';
import { i18n } from '@/lib/i18n';
import { useIntegrationState } from '../logic/useIntegrationState';
import { ProviderEntityRow } from './ProviderEntityRow';
import { IntegrationMetricsGrid } from './IntegrationMetricsGrid';
import { PortCreator } from '@/components/ports/port-creator';
import { IngestionPortList } from './IngestionPortList';
import { ResourceExplorer } from '@/components/resource-explorer';
import { cn } from '@/lib/utils';

const t = i18n.es;

type ConsoleTab = 'nodes' | 'ingestion' | 'workflows' | 'settings' | 'explorer';

export function AgnosticConsoleShell() {
  const { 
    userId, 
    session,
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

  const [activeTab, setActiveTab] = useState<ConsoleTab>('ingestion');

  if (status === 'loading' || loading) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center space-y-4 bg-background z-50">
        <Loader2 className="size-8 animate-spin text-primary opacity-20" />
        <p className="text-[10px] uppercase font-bold tracking-[0.4em] text-muted-foreground animate-pulse">Sincronizando Kernel...</p>
      </div>
    );
  }

  const sortedAdapters = [...INDRA_ADAPTERS].sort((a, b) => {
    const aActive = activeConnections.some(c => c.type === a.id);
    const bActive = activeConnections.some(c => c.type === b.id);
    return aActive === bActive ? 0 : aActive ? -1 : 1;
  });

  const connectionConfigs = activeConnections.map(c => ({
    id: c.id,
    label: c.label,
    integration: c.type,
    type: c.type,
    connectionId: c.id
  }));

  return (
    <div className="fixed inset-0 flex bg-background overflow-hidden animate-in fade-in duration-700">
      
      {/* ── SIDEBAR (Control Soberano) ── */}
      <aside className="w-64 border-r border-border bg-card/50 flex flex-col">
        {/* Branding */}
        <div className="p-6 border-b border-border flex items-center gap-3">
          <div className="size-8 rounded-lg bg-primary flex items-center justify-center">
            <Shield className="size-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-sm font-black tracking-tighter uppercase leading-none">Indra <span className="text-primary">Next</span></h1>
            <p className="text-[8px] font-mono text-muted-foreground opacity-50 mt-1">AXIOMATIC_OS v1.6.1</p>
          </div>
        </div>

        {/* Grupos de Navegación */}
        <nav className="flex-1 p-4 space-y-8 overflow-y-auto">
          <div className="space-y-1">
            <p className="px-2 mb-2 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50">Plano de Control</p>
            <SidebarItem 
              active={activeTab === 'nodes'} 
              onClick={() => setActiveTab('nodes')}
              icon={<Database className="size-4" />}
              label={t.connections.title}
              badge={activeConnections.length.toString()}
            />
          </div>

          <div className="space-y-1">
            <p className="px-2 mb-2 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50">Operaciones</p>
            <SidebarItem 
              active={activeTab === 'ingestion'} 
              onClick={() => setActiveTab('ingestion')}
              icon={<Zap className="size-4" />}
              label={t.portals.title}
            />
            <SidebarItem 
              active={activeTab === 'explorer'} 
              onClick={() => setActiveTab('explorer')}
              icon={<Layers className="size-4" />}
              label={t.connections.explore}
            />
            <SidebarItem 
              active={activeTab === 'workflows'} 
              onClick={() => setActiveTab('workflows')}
              icon={<Terminal className="size-4" />}
              label={t.workflow.title}
              disabled
            />
          </div>

          <div className="space-y-1">
            <p className="px-2 mb-2 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50">Sistema</p>
            <SidebarItem 
              active={activeTab === 'settings'} 
              onClick={() => setActiveTab('settings')}
              icon={<Settings className="size-4" />}
              label={t.common.settings}
            />
          </div>
        </nav>

        {/* Perfil de Usuario (Identidad Soberana) */}
        <div className="p-4 border-t border-border bg-muted/20">
          <div className="group relative flex items-center justify-between p-3 rounded-xl bg-card border border-border shadow-sm hover:border-primary/50 transition-all">
            <div className="flex items-center gap-3">
              <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
                <User className="size-4 text-primary" />
              </div>
              <div className="overflow-hidden">
                <p className="text-[10px] font-bold truncate leading-none">
                  {status === 'authenticated' ? session?.user?.name || 'Usuario Indra' : 'Invitado'}
                </p>
                <p className="text-[8px] text-muted-foreground truncate mt-1">
                  {status === 'authenticated' ? session?.user?.email || 'authenticated' : 'Sovereign Node'}
                </p>
              </div>
            </div>
            
            <button 
              onClick={() => signOut({ callbackUrl: '/' })}
              className="p-2 hover:bg-destructive/10 text-destructive rounded-lg transition-all bg-destructive/5 border border-destructive/10"
              title={t.auth.logout}
            >
              <LogOut className="size-3" />
            </button>
          </div>
        </div>
      </aside>

      {/* ── VIEWPORT PRINCIPAL ── */}
      <main className="flex-1 flex flex-col overflow-hidden bg-background">
        {/* Header de Contexto */}
        <header className="h-16 border-b border-border flex items-center justify-between px-8 bg-card/20 backdrop-blur-sm">
          <div className="flex items-center gap-4">
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              {activeTab === 'nodes' && `Infraestructura / ${t.connections.title}`}
              {activeTab === 'ingestion' && `Operaciones / ${t.portals.title}`}
              {activeTab === 'explorer' && `Operaciones / ${t.connections.explore}`}
              {activeTab === 'workflows' && `Operaciones / ${t.workflow.title}`}
              {activeTab === 'settings' && `Sistema / ${t.common.settings}`}
            </h2>
          </div>
          
          <div className="flex items-center gap-6">
            <button className="text-[9px] font-bold uppercase tracking-widest flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors">
              Documentación <ExternalLink className="size-3" />
            </button>
          </div>
        </header>

        {/* Content Area (Scrollable) */}
        <div className="flex-1 overflow-y-auto p-12 custom-scrollbar">
          <div className="max-w-6xl mx-auto space-y-12 pb-20">
            
            {/* TAB: NODES & ADAPTERS */}
            {activeTab === 'nodes' && (
              <div className="space-y-10 animate-in slide-in-from-bottom-4 duration-500">
                <div className="space-y-1">
                  <h3 className="text-2xl font-bold tracking-tighter">Infrastructure Catalog</h3>
                  <p className="text-sm text-muted-foreground max-w-xl">Configure and authorize connection adapters to expose your sovereign infrastructure silos.</p>
                </div>
                <div className="grid grid-cols-1 gap-4">
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
                        onDisconnect={actions.disconnectIntegration}
                        refreshData={actions.refreshData}
                      />
                    );
                  })}
                </div>
              </div>
            )}

            {/* TAB: SILO EXPLORER */}
            {activeTab === 'explorer' && (
              <div className="space-y-10 animate-in slide-in-from-bottom-4 duration-500">
                <div className="space-y-1">
                  <h3 className="text-2xl font-bold tracking-tighter">Silo Explorer</h3>
                  <p className="text-sm text-muted-foreground">Direct resource discovery across authorized infrastructure nodes.</p>
                </div>
                <div className="bg-card border border-border p-8 rounded-2xl shadow-sm">
                  <ResourceExplorer connections={connectionConfigs} />
                </div>
              </div>
            )}

            {/* TAB: INGESTION HUB */}
            {activeTab === 'ingestion' && (
              <div className="space-y-10 animate-in slide-in-from-bottom-4 duration-500">
                 <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
                   <div className="lg:col-span-1 space-y-8">
                      <div className="space-y-1">
                        <h3 className="text-2xl font-bold tracking-tighter">Active Projects</h3>
                        <p className="text-xs text-muted-foreground">Sovereign tunnels mapped to active infrastructure nodes.</p>
                      </div>
                      <IngestionPortList className="p-6 bg-card border border-border rounded-2xl shadow-sm" />
                      
                      <div className="p-6 bg-primary/5 border border-primary/10 rounded-2xl border-dashed">
                        <h6 className="text-[9px] font-bold uppercase tracking-widest text-primary mb-2 flex items-center gap-2">
                          <Shield className="size-3" />
                          Security Axiom
                        </h6>
                        <p className="text-[10px] text-muted-foreground leading-relaxed italic">
                          Indra Next utilizes double-blind authorization. Access slugs are detached from infrastructure IDs to prevent resource harvesting.
                        </p>
                      </div>
                   </div>

                   <div className="lg:col-span-2 space-y-6">
                      <div className="bg-card border border-border p-10 rounded-2xl shadow-xl relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                          <Zap className="size-32" />
                        </div>
                        <h5 className="text-[10px] font-bold uppercase tracking-[0.3em] text-primary mb-8">Funnel Architect</h5>
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
                 </div>
              </div>
            )}

            {/* TAB: SETTINGS & METRICS */}
            {activeTab === 'settings' && (
              <div className="space-y-10 animate-in slide-in-from-bottom-4 duration-500">
                <div className="space-y-1">
                  <h3 className="text-2xl font-bold tracking-tighter">Environment Settings</h3>
                  <p className="text-sm text-muted-foreground">System metrics, webhooks, and core axiomatic configuration.</p>
                </div>
                <IntegrationMetricsGrid {...metrics} />
              </div>
            )}

          </div>
        </div>
      </main>
    </div>
  );
}

// ── SIDEBAR SUB-COMPONENTS ───────────────────────────────────────────────────

function SidebarItem({ 
  active, 
  onClick, 
  icon, 
  label, 
  badge, 
  disabled 
}: { 
  active: boolean; 
  onClick: () => void; 
  icon: React.ReactNode; 
  label: string; 
  badge?: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "w-full flex items-center justify-between px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all group",
        disabled ? "opacity-30 cursor-not-allowed" : "hover:bg-primary/5 hover:text-primary",
        active ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" : "text-muted-foreground"
      )}
    >
      <div className="flex items-center gap-3">
        {icon}
        <span>{label}</span>
      </div>
      {badge && (
        <span className={cn(
          "px-1.5 py-0.5 rounded text-[8px] font-black",
          active ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"
        )}>
          {badge}
        </span>
      )}
    </button>
  );
}
