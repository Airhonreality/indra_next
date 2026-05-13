/**
 * 🏛️ ARTEFACTO: AgnosticConsoleShell.tsx
 * ────────────
 * CAPA: UI / Shell (Inert Skeleton)
 * VERSIÓN: 2.0.0 — Axiomatic Skeleton (Nam P. Suh DP1)
 *
 * 🎯 FUNCTIONAL_SCOPE:
 * - Carcasa inerte: gestiona layout y tab activo únicamente.
 * - CERO hooks de datos — toda hidratación ocurre dentro de los paneles hijos.
 *
 * 🛡️ AXIOMATIC_CONTRACT:
 * - NEVER: Consumir hooks de datos (conexiones, ports, métricas).
 * - ALWAYS: Derivar estado de UI exclusivamente de useIndraStore().
 */

'use client';

import { signOut } from 'next-auth/react';
import {
  Shield, Loader2, Zap, Layers, Terminal,
  Settings, Database, User, ExternalLink,
  ChevronRight, ChevronLeft, LogOut,
} from 'lucide-react';
import { i18n } from '@/lib/i18n';
import { useIndraStore } from '@/stores/indra-store';
import { useSessionSync } from '@/hooks/use-session-sync';
import { NodesPanel } from './NodesPanel';
import { ExplorerPanel } from './ExplorerPanel';
import { MetricsPanel } from './MetricsPanel';
import { IngestionPortList } from './IngestionPortList';
import { PortCreator } from '@/components/ports/port-creator';
import { cn } from '@/lib/utils';

const t = i18n.es;

export function AgnosticConsoleShell() {
  const { session, status } = useSessionSync();

  const activeTab = useIndraStore((s) => s.activeTab);
  const setActiveTab = useIndraStore((s) => s.setActiveTab);
  const isSidebarCollapsed = useIndraStore((s) => s.isSidebarCollapsed);
  const toggleSidebar = useIndraStore((s) => s.toggleSidebar);
  const isInventoryCollapsed = useIndraStore((s) => s.isInventoryCollapsed);
  const toggleInventory = useIndraStore((s) => s.toggleInventory);

  if (status === 'loading') {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center space-y-4 bg-background z-50">
        <Loader2 className="size-8 animate-spin text-primary opacity-20" />
        <p className="text-[10px] uppercase font-bold tracking-[0.4em] text-muted-foreground animate-pulse">Sincronizando Kernel...</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex bg-background overflow-hidden animate-in fade-in duration-700">

      {/* ── SIDEBAR (Control Soberano) ── */}
      <aside className={cn(
        "border-r border-border bg-card/50 flex flex-col transition-all duration-300 ease-in-out relative",
        isSidebarCollapsed ? "w-20" : "w-64"
      )}>
        {/* Toggle Button */}
        <button
          onClick={toggleSidebar}
          className="absolute -right-3 top-10 size-6 rounded-full bg-background border border-border flex items-center justify-center hover:bg-muted transition-colors z-10"
        >
          {isSidebarCollapsed ? <ChevronRight className="size-3" /> : <ChevronLeft className="size-3" />}
        </button>

        {/* Branding */}
        <div className={cn(
          "p-6 border-b border-border flex items-center gap-3 transition-all",
          isSidebarCollapsed ? "justify-center px-4" : "px-6"
        )}>
          <div className="size-8 shrink-0 rounded-lg bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
            <Shield className="size-5 text-primary-foreground" />
          </div>
          {!isSidebarCollapsed && (
            <div className="animate-in fade-in slide-in-from-left-2 duration-300">
              <h1 className="text-sm font-black tracking-tighter uppercase leading-none">Indra <span className="text-primary">Next</span></h1>
              <p className="text-[8px] font-mono text-muted-foreground opacity-50 mt-1">AXIOMATIC_OS v2.0.0</p>
            </div>
          )}
        </div>

        {/* Grupos de Navegación */}
        <nav className="flex-1 p-4 space-y-8 overflow-y-auto overflow-x-hidden">
          <div className="space-y-1">
            {!isSidebarCollapsed && <p className="px-2 mb-2 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50 animate-in fade-in duration-500">Plano de Control</p>}
            <SidebarItem
              active={activeTab === 'nodes'}
              onClick={() => setActiveTab('nodes')}
              icon={<Database className="size-4" />}
              label={t.connections.title}
              isCollapsed={isSidebarCollapsed}
            />
          </div>

          <div className="space-y-1">
            {!isSidebarCollapsed && <p className="px-2 mb-2 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50 animate-in fade-in duration-500">Operaciones</p>}
            <SidebarItem
              active={activeTab === 'ingestion'}
              onClick={() => setActiveTab('ingestion')}
              icon={<Zap className="size-4" />}
              label={t.portals.title}
              isCollapsed={isSidebarCollapsed}
            />
            <SidebarItem
              active={activeTab === 'explorer'}
              onClick={() => setActiveTab('explorer')}
              icon={<Layers className="size-4" />}
              label={t.connections.explore}
              isCollapsed={isSidebarCollapsed}
            />
            <SidebarItem
              active={activeTab === 'workflows'}
              onClick={() => setActiveTab('workflows')}
              icon={<Terminal className="size-4" />}
              label={t.workflow.title}
              disabled
              isCollapsed={isSidebarCollapsed}
            />
          </div>

          <div className="space-y-1">
            {!isSidebarCollapsed && <p className="px-2 mb-2 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50">Sistema</p>}
            <SidebarItem
              active={activeTab === 'settings'}
              onClick={() => setActiveTab('settings')}
              icon={<Settings className="size-4" />}
              label={t.common.settings}
              isCollapsed={isSidebarCollapsed}
            />
          </div>
        </nav>

        {/* Perfil de Usuario */}
        <div className="p-4 border-t border-border bg-muted/20">
          <div className="group relative flex items-center justify-between p-3 rounded-xl bg-card border border-border shadow-sm hover:border-primary/50 transition-all">
            <div className="flex items-center gap-3">
              <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
                <User className="size-4 text-primary" />
              </div>
              {!isSidebarCollapsed && (
                <div className="overflow-hidden">
                  <p className="text-[10px] font-bold truncate leading-none">
                    {status === 'authenticated' ? session?.user?.name || 'Usuario Indra' : 'Invitado'}
                  </p>
                  <p className="text-[8px] text-muted-foreground truncate mt-1">
                    {status === 'authenticated' ? session?.user?.email || 'authenticated' : 'Sovereign Node'}
                  </p>
                </div>
              )}
            </div>

            {!isSidebarCollapsed && (
              <button
                onClick={() => signOut({ callbackUrl: '/' })}
                className="p-2 hover:bg-destructive/10 text-destructive rounded-lg transition-all bg-destructive/5 border border-destructive/10"
                title={t.auth.logout}
              >
                <LogOut className="size-3" />
              </button>
            )}
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
        <div className="flex-1 overflow-y-auto p-4 lg:p-6 custom-scrollbar">
          <div className="max-w-[98%] mx-auto space-y-12 pb-20">

            {/* TAB: NODES & ADAPTERS */}
            {activeTab === 'nodes' && (
              <div className="space-y-10 animate-in slide-in-from-bottom-4 duration-500">
                <div className="space-y-1">
                  <h3 className="text-2xl font-bold tracking-tighter">Infrastructure Catalog</h3>
                  <p className="text-sm text-muted-foreground max-w-xl">Configure and authorize connection adapters to expose your sovereign infrastructure silos.</p>
                </div>
                <NodesPanel />
              </div>
            )}

            {/* TAB: SILO EXPLORER */}
            {activeTab === 'explorer' && (
              <div className="space-y-10 animate-in slide-in-from-bottom-4 duration-500">
                <div className="space-y-1">
                  <h3 className="text-2xl font-bold tracking-tighter">Silo Explorer</h3>
                  <p className="text-sm text-muted-foreground">Direct resource discovery across authorized infrastructure nodes.</p>
                </div>
                <ExplorerPanel />
              </div>
            )}

            {/* TAB: INGESTION HUB */}
            {activeTab === 'ingestion' && (
              <div className="space-y-10 animate-in slide-in-from-bottom-4 duration-500">
                <div className="flex flex-col lg:flex-row gap-8 relative">

                  {/* Project Inventory Column */}
                  <div className={cn(
                    "transition-all duration-500 ease-in-out overflow-hidden flex flex-col",
                    isInventoryCollapsed ? "w-0 opacity-0 pointer-events-none" : "w-full lg:w-[25%] opacity-100"
                  )}>
                    <div className="space-y-8 min-w-[280px]">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-primary/60 mb-1">
                          <Terminal className="size-3" />
                          <span className="text-[8px] font-bold uppercase tracking-[0.3em]">Project Memory</span>
                        </div>
                        <h3 className="text-xl font-black tracking-tighter uppercase leading-none">Túneles de Ingesta</h3>
                      </div>
                      <IngestionPortList className="p-4 bg-card border border-border rounded-xl shadow-sm" />

                      <div className="p-4 bg-primary/5 border border-primary/10 rounded-xl border-dashed">
                        <h6 className="text-[8px] font-bold uppercase tracking-widest text-primary mb-1 flex items-center gap-2">
                          <Shield className="size-3" />
                          Seguridad
                        </h6>
                        <p className="text-[9px] text-muted-foreground leading-tight italic">
                          Acceso por slugs aislados.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Toggle Button for Project Panel */}
                  <button
                    onClick={toggleInventory}
                    className={cn(
                      "absolute top-0 z-20 size-8 rounded-full bg-card border border-border shadow-md flex items-center justify-center hover:bg-muted transition-all",
                      isInventoryCollapsed ? "left-0 -ml-4" : "left-[25%] -ml-12"
                    )}
                    title={isInventoryCollapsed ? "Expandir Proyectos" : "Colapsar Proyectos"}
                  >
                    {isInventoryCollapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
                  </button>

                  {/* Main Builder Column */}
                  <div className={cn(
                    "transition-all duration-500 flex-1",
                    isInventoryCollapsed ? "w-full" : "w-full lg:w-[75%]"
                  )}>
                    <div className="bg-card border border-border p-8 rounded-2xl shadow-xl relative overflow-hidden group">
                      <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                        <Zap className="size-32" />
                      </div>
                      <h5 className="text-[10px] font-bold uppercase tracking-[0.3em] text-primary mb-6">Funnel Architect</h5>
                      <PortCreator />
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
                <MetricsPanel />
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
  disabled,
  isCollapsed,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  disabled?: boolean;
  isCollapsed?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 group",
        isCollapsed ? "justify-center" : "justify-start",
        active
          ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
        disabled && "opacity-30 cursor-not-allowed grayscale"
      )}
    >
      <div className={cn(
        "shrink-0 transition-transform duration-200",
        active ? "scale-110" : "group-hover:scale-110"
      )}>
        {icon}
      </div>
      {!isCollapsed && (
        <span className="flex-1 text-left truncate animate-in fade-in slide-in-from-left-1 duration-300">
          {label}
        </span>
      )}
    </button>
  );
}
