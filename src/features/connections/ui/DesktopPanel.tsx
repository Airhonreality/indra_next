'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowRight, ExternalLink, FolderOpen, Link2, RefreshCw, Server, ShieldCheck, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useIndraStore } from '@/stores/indra-store';
import { cn } from '@/lib/utils';
import type { NativeBridgeStatus } from '@/lib/native-bridge-contract';

type IntegrationSummary = {
  id: string;
  type: string;
  label?: string | null;
  isActive?: boolean | null;
  config?: {
    basePath?: string;
    bucket?: string;
    baseUrl?: string;
    username?: string;
    email?: string;
  } | null;
};

type DesktopRootSubdirectory = {
  name: string;
  path: string;
  exists: boolean;
};

type DesktopRootSummary = {
  path: string;
  exists: boolean;
  ready: boolean;
  metadata?: {
    userId?: string;
    createdAt?: string;
    updatedAt?: string;
  } | null;
  subdirectories?: DesktopRootSubdirectory[];
};

type DesktopState = {
  loading: boolean;
  refreshing: boolean;
  lastChecked: string | null;
  bridgeReachable: boolean;
  bridgeMessage: string;
  managedRootPath: string | null;
  managedRootLabel: string | null;
  rootCreatedAt: string | null;
  rootUpdatedAt: string | null;
  rootSubdirectories: DesktopRootSubdirectory[];
  rootConnectionLabel: string | null;
  activeStorageCount: number;
  activeCount: number;
  providers: string[];
  nativeBridgeStatus: NativeBridgeStatus | null;
};

const EMPTY_STATE: DesktopState = {
  loading: true,
  refreshing: false,
  lastChecked: null,
  bridgeReachable: false,
  bridgeMessage: 'Sin verificar',
  managedRootPath: null,
  managedRootLabel: null,
  rootCreatedAt: null,
  rootUpdatedAt: null,
  rootSubdirectories: [],
  rootConnectionLabel: null,
  activeStorageCount: 0,
  activeCount: 0,
  providers: [],
  nativeBridgeStatus: null,
};

const ROOT_PLACEHOLDERS = ['incoming', 'cache', 'thumbnails'] as const;

export function DesktopPanel() {
  const setActiveTab = useIndraStore((s) => s.setActiveTab);
  const [state, setState] = useState<DesktopState>(EMPTY_STATE);

  useEffect(() => {
    let cancelled = false;

    const loadState = async () => {
      setState((prev) => ({ ...prev, loading: true, refreshing: true }));

      try {
        const snapshot = await fetchDesktopState();
        if (!cancelled) {
          setState(snapshot);
        }
      } catch (error) {
        console.error('[DesktopPanel] Failed to load desktop state:', error);
        if (!cancelled) {
          setState({
            ...EMPTY_STATE,
            loading: false,
            refreshing: false,
            lastChecked: new Date().toISOString(),
            bridgeReachable: false,
            bridgeMessage: 'No se pudo leer el estado de storage',
          });
        }
      }
    };

    void loadState();

    return () => {
      cancelled = true;
    };
  }, []);

  const tone = useMemo(() => {
    if (state.bridgeReachable && state.managedRootPath) return 'text-emerald-500';
    if (state.bridgeReachable) return 'text-sky-500';
    return 'text-amber-500';
  }, [state.bridgeReachable, state.managedRootPath]);

  const rootReadyCount = state.rootSubdirectories.filter((subdirectory) => subdirectory.exists).length;
  const rootMissing = state.rootSubdirectories.filter((subdirectory) => !subdirectory.exists);

  const refreshState = async () => {
    setState((prev) => ({ ...prev, refreshing: true }));

    try {
      const snapshot = await fetchDesktopState();
      setState(snapshot);
    } catch (error) {
      console.error('[DesktopPanel] Refresh failed:', error);
      setState((prev) => ({
        ...prev,
        refreshing: false,
        lastChecked: new Date().toISOString(),
        bridgeReachable: false,
        bridgeMessage: 'No se pudo verificar la raiz',
      }));
    }
  };

  const configureRoot = async () => {
    setState((prev) => ({ ...prev, refreshing: true }));

    try {
      const response = await fetch('/api/desktop/root', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ensure' }),
      });

      if (!response.ok) {
        throw new Error('No se pudo crear la raiz local gestionada');
      }

      await refreshState();
    } catch (error) {
      console.error('[DesktopPanel] Failed to configure desktop root:', error);
      setState((prev) => ({
        ...prev,
        refreshing: false,
        lastChecked: new Date().toISOString(),
        bridgeReachable: false,
        bridgeMessage: 'No se pudo crear la raiz local',
      }));
    }
  };

  const rootActionLabel = state.bridgeReachable ? 'Validar raiz' : 'Configurar raiz';

  return (
    <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
      <section className="relative overflow-hidden rounded-3xl border border-border/40 bg-card p-6 shadow-xl">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.16),transparent_35%),radial-gradient(circle_at_bottom_left,rgba(16,185,129,0.12),transparent_30%)]" />
        <div className="relative space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.32em] text-primary">
                <Sparkles className="size-3" />
                Estado desktop
              </div>
              <div className="space-y-1">
                <h3 className="text-2xl font-bold tracking-tight">Raiz local y storage bridge</h3>
                <p className="max-w-2xl text-sm text-muted-foreground">
                  Esta superficie administra una raiz de trabajo real. Ya no vende instalacion PWA: muestra la ruta,
                  el estado de preparacion, la integracion storage y lo que falta para estar lista.
                </p>
              </div>
            </div>
            <div className={cn('rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.3em] border-current/20 bg-background/80', tone)}>
              {state.bridgeReachable ? (state.managedRootPath ? 'Operativo' : 'Bridge listo') : 'Pendiente'}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <StatusTile
              icon={<FolderOpen className="size-4" />}
              title="Raiz local"
              body={
                state.loading
                  ? 'Verificando ruta local...'
                  : state.managedRootPath
                    ? state.managedRootPath
                    : 'No hay una raiz local configurada todavia.'
              }
            />
            <StatusTile
              icon={<Server className="size-4" />}
              title="Estado"
              body={state.loading ? 'Comprobando estado...' : state.bridgeMessage}
            />
            <StatusTile
              icon={<ShieldCheck className="size-4" />}
              title="Storage activo"
              body={
                state.loading
                  ? 'Cargando integraciones...'
                  : `${state.activeStorageCount} conexiones de storage activas en ${state.activeCount} integraciones`
              }
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <ActionCard
              title={rootActionLabel}
              description={
                state.bridgeReachable
                  ? 'Revisa la carpeta base configurada y vuelve a validar su estado desde el backend.'
                  : 'Crear la raiz local gestionada para empezar a usarla como base de trabajo.'
              }
              onClick={state.bridgeReachable ? refreshState : configureRoot}
              icon={<ArrowRight className="size-4" />}
            />
            <ActionCard
              title="Administrar conexiones"
              description="Revisar cuentas, mounts locales y credenciales que alimentan la raiz gestionada."
              onClick={() => setActiveTab('nodes')}
              icon={<Link2 className="size-4" />}
            />
          </div>

          <div className="space-y-3 rounded-2xl border border-border/40 bg-muted/20 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <h4 className="text-xs font-bold uppercase tracking-[0.24em] text-foreground">Native Bridge Status</h4>
                <p className="text-sm text-muted-foreground">
                  {state.nativeBridgeStatus?.capability === 'none'
                    ? 'Native bridge not yet implemented. See architecture documentation.'
                    : state.nativeBridgeStatus?.capability === 'cfapi-windows'
                      ? 'Windows CFAPI integration available'
                      : 'Linux FUSE integration available'}
                </p>
              </div>
              <a
                href="/docs/architecture/native-bridge-architecture.md"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border border-border/40 bg-background/70 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.2em] text-foreground transition-colors hover:border-primary/50 hover:bg-background"
              >
                Docs <ExternalLink className="size-3" />
              </a>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-lg border border-border/40 bg-background/50 px-3 py-2">
                <p className="text-[9px] font-bold uppercase tracking-[0.24em] text-muted-foreground">Capability</p>
                <p className="mt-1 text-sm text-foreground">{state.nativeBridgeStatus?.capability || 'none'}</p>
              </div>
              <div className="rounded-lg border border-border/40 bg-background/50 px-3 py-2">
                <p className="text-[9px] font-bold uppercase tracking-[0.24em] text-muted-foreground">Running</p>
                <p className="mt-1 text-sm text-foreground">
                  {state.nativeBridgeStatus?.isRunning ? 'Yes' : 'No'}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              onClick={refreshState}
              disabled={state.refreshing}
              className="h-11 rounded-xl bg-primary px-4 text-xs font-bold uppercase tracking-[0.28em]"
            >
              <RefreshCw className={cn('mr-2 size-4', state.refreshing ? 'animate-spin' : '')} />
              {state.refreshing ? 'Validando...' : 'Validar estado'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={configureRoot}
              className="h-11 rounded-xl px-4 text-xs font-bold uppercase tracking-[0.28em]"
            >
              Configurar raiz
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setActiveTab('explorer')}
              className="h-11 rounded-xl px-4 text-xs font-bold uppercase tracking-[0.28em]"
            >
              Abrir storage
            </Button>
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-3xl border border-border/40 bg-muted/20 p-6">
        <div className="space-y-1">
          <h4 className="text-lg font-semibold">Resumen operativo</h4>
          <p className="text-sm text-muted-foreground">
            El escritorio actua como panel de administracion del estado local, no como una capa de instalacion falsa.
          </p>
        </div>

        <div className="grid gap-3">
          <InfoRow label="Ultima verificacion" value={formatDesktopDate(state.lastChecked)} />
          <InfoRow label="Estado de la raiz" value={state.bridgeReachable ? 'Lista para sincronizacion' : 'Sin raiz lista'} />
          <InfoRow label="Raiz local" value={state.managedRootPath || 'Sin carpeta gestionada'} />
          <InfoRow label="Etiqueta de raiz" value={state.managedRootLabel || 'Sin etiqueta'} />
          <InfoRow label="Creada" value={formatDesktopDate(state.rootCreatedAt)} />
          <InfoRow label="Actualizada" value={formatDesktopDate(state.rootUpdatedAt)} />
          <InfoRow label="Enlace storage" value={state.rootConnectionLabel || 'Indra Desktop Root'} />
          <InfoRow label="Proveedores activos" value={state.providers.length > 0 ? state.providers.join(', ') : 'Sin providers de storage activos'} />
        </div>

        <div className="rounded-2xl border border-border/40 bg-background/70 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-muted-foreground">Ruta de trabajo</p>
              <p className="mt-1 text-sm text-foreground">
                {state.managedRootPath
                  ? 'La carpeta ya esta registrada como raiz gestionada en el backend.'
                  : 'Todavia no existe una carpeta de trabajo configurada en el repo actual.'}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={state.bridgeReachable ? refreshState : configureRoot}
              className="shrink-0 rounded-xl"
            >
              {state.managedRootPath ? 'Revalidar' : 'Preparar'}
            </Button>
          </div>

          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-muted-foreground">Preparacion</p>
                <p className="mt-1 text-sm text-foreground">
                  {state.bridgeReachable
                    ? 'La raiz esta lista para sincronizacion.'
                    : rootReadyCount > 0
                      ? 'La raiz existe, pero todavia faltan componentes internos.'
                      : 'La raiz todavia no esta creada en este entorno.'}
                </p>
              </div>
              <span className="rounded-full border border-border/40 bg-muted/40 px-3 py-1 text-[9px] font-bold uppercase tracking-[0.24em] text-foreground">
                {rootReadyCount}/{state.rootSubdirectories.length || ROOT_PLACEHOLDERS.length} componentes
              </span>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              {state.rootSubdirectories.length > 0 ? (
                state.rootSubdirectories.map((subdirectory) => (
                  <div
                    key={subdirectory.name}
                    className={cn(
                      'rounded-xl border p-3 text-left',
                      subdirectory.exists
                        ? 'border-emerald-500/20 bg-emerald-950/10'
                        : 'border-amber-500/20 bg-amber-950/10'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'size-2 rounded-full',
                          subdirectory.exists ? 'bg-emerald-500' : 'bg-amber-500'
                        )}
                      />
                      <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-foreground">
                        {subdirectory.name}
                      </span>
                    </div>
                    <p className="mt-2 break-all font-mono text-[10px] text-muted-foreground">{subdirectory.path}</p>
                    <p
                      className={cn(
                        'mt-2 text-[9px] font-bold uppercase tracking-[0.24em]',
                        subdirectory.exists ? 'text-emerald-400' : 'text-amber-400'
                      )}
                    >
                      {subdirectory.exists ? 'Listo' : 'Falta'}
                    </p>
                  </div>
                ))
              ) : (
                ROOT_PLACEHOLDERS.map((name) => (
                  <div key={name} className="rounded-xl border border-border/20 bg-muted/20 p-3">
                    <div className="flex items-center gap-2">
                      <span className="size-2 rounded-full bg-amber-500" />
                      <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-foreground">{name}</span>
                    </div>
                    <p className="mt-2 text-[10px] text-muted-foreground">Sin estado de carpeta disponible.</p>
                  </div>
                ))
              )}
            </div>

            {rootMissing.length > 0 && (
              <p className="text-[10px] text-amber-400">
                Faltan componentes: {rootMissing.map((item) => item.name).join(', ')}.
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <RefreshCw className="size-3.5" />
          <span>Los estados se leen desde las integraciones activas y el endpoint de la raiz desktop.</span>
        </div>
      </section>
    </div>
  );
}

function StatusTile({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-border/40 bg-background/70 p-4 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.24em] text-foreground">
        <span className="inline-flex size-7 items-center justify-center rounded-full bg-primary/10 text-primary">
          {icon}
        </span>
        {title}
      </div>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}

function ActionCard({
  title,
  description,
  onClick,
  icon,
}: {
  title: string;
  description: string;
  onClick: () => void;
  icon: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-start justify-between gap-3 rounded-2xl border border-border/40 bg-background/70 p-4 text-left shadow-sm transition-colors hover:border-primary/30 hover:bg-background"
    >
      <div className="space-y-1">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-border/40 bg-muted/40 text-foreground transition-transform group-hover:translate-x-0.5">
        {icon}
      </span>
    </button>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-2xl border border-border/40 bg-background/70 px-4 py-3">
      <div className="min-w-0">
        <p className="text-[9px] font-bold uppercase tracking-[0.24em] text-muted-foreground">{label}</p>
        <p className="mt-1 break-words text-sm text-foreground">{value}</p>
      </div>
    </div>
  );
}

function formatDesktopDate(value: string | null): string {
  if (!value) return 'Sin registro';

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
}

async function fetchDesktopState(): Promise<DesktopState> {
  const [integrationsResponse, bridgeResponse, nativeBridgeResponse] = await Promise.all([
    fetch('/api/integrations'),
    fetch('/api/desktop/root'),
    fetch('/api/desktop/bridge'),
  ]);

  const integrationsPayload = integrationsResponse.ok ? await integrationsResponse.json() : { integrations: [] };
  const bridgePayload = bridgeResponse.ok ? (await bridgeResponse.json()) as {
    root?: DesktopRootSummary;
    integration?: { label?: string | null } | null;
  } : {};
  const nativeBridgePayload = nativeBridgeResponse.ok ? (await nativeBridgeResponse.json()) as NativeBridgeStatus | null : null;
  const integrations = Array.isArray(integrationsPayload.integrations)
    ? (integrationsPayload.integrations as IntegrationSummary[])
    : [];

  return buildDesktopState({
    integrations,
    root: bridgePayload.root ?? null,
    rootIntegrationLabel: bridgePayload.integration?.label ?? null,
    nativeBridgeStatus: nativeBridgePayload,
  });
}

function buildDesktopState({
  integrations,
  root,
  rootIntegrationLabel,
  nativeBridgeStatus,
}: {
  integrations: IntegrationSummary[];
  root: DesktopRootSummary | null;
  rootIntegrationLabel: string | null;
  nativeBridgeStatus: NativeBridgeStatus | null;
}): DesktopState {
  const activeIntegrations = integrations.filter((integration) => integration.isActive);
  const storageIntegrations = activeIntegrations.filter((integration) =>
    ['storage', 's3', 'claro', 'mega'].includes(integration.type)
  );
  const providers = Array.from(new Set(storageIntegrations.map((integration) => integration.type))).sort();

  return {
    loading: false,
    refreshing: false,
    lastChecked: new Date().toISOString(),
    bridgeReachable: Boolean(root?.ready),
    bridgeMessage: root?.ready
      ? 'Raiz local lista para sincronizacion'
      : root?.exists
        ? 'Raiz local creada, pendiente de validacion'
        : 'Sin raiz local configurada',
    managedRootPath: root?.exists ? root.path : null,
    managedRootLabel: root?.ready
      ? 'Raiz local gestionada'
      : root?.exists
        ? 'Raiz local creada'
        : null,
    rootCreatedAt: root?.metadata?.createdAt ?? null,
    rootUpdatedAt: root?.metadata?.updatedAt ?? null,
    rootSubdirectories: root?.subdirectories ?? [],
    rootConnectionLabel: rootIntegrationLabel,
    activeStorageCount: storageIntegrations.length,
    activeCount: activeIntegrations.length,
    providers,
    nativeBridgeStatus,
  } as DesktopState;
}

export default DesktopPanel;
