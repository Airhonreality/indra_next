'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import { Loader2, Trash2, Link2, Shield, Database, FolderCog, Users, Cloud, HardDrive } from 'lucide-react';
import { useIntegrationState } from '../logic/useIntegrationState';
import { CredentialVault, type StorageTab } from '@/components/storage/CredentialVault';
import { useIndraStore } from '@/stores/indra-store';
import { cn } from '@/lib/utils';

type IntegrationRow = {
  id: string;
  type: string;
  label?: string;
  connectionId?: string;
  isActive?: boolean | null;
  config?: {
    basePath?: string;
    email?: string;
    bucket?: string;
    baseUrl?: string;
    username?: string;
  };
};

type FamilyKey = 'google-drive' | 'onedrive' | 'notion' | 's3' | 'claro' | 'mega';

type FamilyDescriptor = {
  key: FamilyKey;
  title: string;
  subtitle: string;
  description: string;
  tone: 'emerald' | 'blue' | 'zinc';
  kind: 'oauth' | 'vault';
  providers: string[];
  actionLabel: (count: number) => string;
  vaultTab?: StorageTab;
  icon: ReactNode;
};

const ACTIVE_LABELS: Record<string, string> = {
  'google-drive': 'Google Drive',
  onedrive: 'OneDrive',
  notion: 'Notion',
  mega: 'MEGA',
  s3: 'Cloudflare R2',
  claro: 'Claro Drive',
  storage: 'Local Storage',
};

const FAMILY_CATALOG: FamilyDescriptor[] = [
  {
    key: 'google-drive',
    title: 'Familia Google',
    subtitle: 'OAuth multicuenta',
    description: 'Cada cuenta entra por su propio inicio de sesión y queda listada como una fila independiente.',
    tone: 'emerald',
    kind: 'oauth',
    providers: ['google-drive', 'google-sheets', 'youtube'],
    actionLabel: (count) => (count > 0 ? 'Añadir otra cuenta' : 'Conectar cuenta'),
    icon: <Users className="size-3.5" />,
  },
  {
    key: 'onedrive',
    title: 'Familia Microsoft',
    subtitle: 'OAuth multicuenta',
    description: 'OneDrive se conecta con cuentas separadas y se administra una por una.',
    tone: 'blue',
    kind: 'oauth',
    providers: ['onedrive'],
    actionLabel: (count) => (count > 0 ? 'Añadir otra cuenta' : 'Conectar cuenta'),
    icon: <Cloud className="size-3.5" />,
  },
  {
    key: 'notion',
    title: 'Notion',
    subtitle: 'OAuth multicuenta',
    description: 'Bases y páginas se conectan por sesión; el panel muestra cada conexión activa de forma explícita.',
    tone: 'zinc',
    kind: 'oauth',
    providers: ['notion'],
    actionLabel: (count) => (count > 0 ? 'Añadir otra cuenta' : 'Conectar cuenta'),
    icon: <FolderCog className="size-3.5" />,
  },
  {
    key: 's3',
    title: 'Cloudflare R2',
    subtitle: 'Vault de credenciales',
    description: 'Buckets S3/R2 se guardan en el vault unificado con credenciales directas y cuentas múltiples.',
    tone: 'blue',
    kind: 'vault',
    providers: ['s3'],
    actionLabel: (count) => (count > 0 ? 'Abrir vault' : 'Abrir vault'),
    vaultTab: 's3',
    icon: <Database className="size-3.5" />,
  },
  {
    key: 'claro',
    title: 'Claro Drive',
    subtitle: 'Vault de credenciales',
    description: 'WebDAV con URL, usuario y app password validados antes de guardarse.',
    tone: 'zinc',
    kind: 'vault',
    providers: ['claro'],
    actionLabel: (count) => (count > 0 ? 'Abrir vault' : 'Abrir vault'),
    vaultTab: 'claro',
    icon: <Shield className="size-3.5" />,
  },
  {
    key: 'mega',
    title: 'MEGA',
    subtitle: 'Vault de credenciales',
    description: 'Bóveda cifrada con límite respetuoso para cuentas gratuitas y varias cuentas en paralelo.',
    tone: 'emerald',
    kind: 'vault',
    providers: ['mega'],
    actionLabel: (count) => (count > 0 ? 'Abrir vault' : 'Abrir vault'),
    vaultTab: 'mega',
    icon: <HardDrive className="size-3.5" />,
  },
];

interface FamilyCardProps {
  family: FamilyDescriptor;
  accounts: IntegrationRow[];
  isProcessing: boolean;
  onConnect: () => void;
  onOpenVault: (tab: StorageTab) => void;
  onDisconnect: (id: string) => void;
}

function FamilyCard({
  family,
  accounts,
  isProcessing,
  onConnect,
  onOpenVault,
  onDisconnect,
}: FamilyCardProps) {
  const activeAccounts = accounts.filter((integration) => integration.isActive);
  const count = activeAccounts.length;

  const accentStyles = {
    emerald: {
      border: 'hover:border-emerald-500/30',
      glow: 'bg-emerald-500/5',
      badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      btnConnect: 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/20',
      btnActive: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      rowBorder: 'border-emerald-500/20 bg-emerald-950/10',
      rowText: 'text-emerald-400',
    },
    blue: {
      border: 'hover:border-blue-500/30',
      glow: 'bg-blue-500/5',
      badge: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
      btnConnect: 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-950/20',
      btnActive: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
      rowBorder: 'border-blue-500/20 bg-blue-950/10',
      rowText: 'text-blue-400',
    },
    zinc: {
      border: 'hover:border-zinc-500/30',
      glow: 'bg-zinc-500/5',
      badge: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
      btnConnect: 'bg-zinc-700 hover:bg-zinc-600 text-white shadow-zinc-950/20',
      btnActive: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
      rowBorder: 'border-zinc-500/20 bg-zinc-950/10',
      rowText: 'text-zinc-400',
    },
  }[family.tone];

  return (
    <div className={cn(
      'group relative flex min-h-[320px] flex-col justify-between gap-4 overflow-hidden rounded-2xl border border-border/40 bg-muted/10 p-5 backdrop-blur-md transition-all duration-300 hover:scale-[1.01] hover:shadow-lg',
      accentStyles.border
    )}>
      <div className={cn('pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full blur-[60px] transition-all duration-500 group-hover:scale-125', accentStyles.glow)} />

      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex size-7 items-center justify-center rounded-lg border border-border/40 bg-background/70 text-foreground">
                {family.icon}
              </span>
              <div>
                <span className="block text-sm font-bold uppercase tracking-wider text-foreground">{family.title}</span>
                <span className="block text-[9px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">{family.subtitle}</span>
              </div>
            </div>
            <p className="max-w-[92%] text-[10px] leading-relaxed text-zinc-500">{family.description}</p>
          </div>

          <span className={cn('text-[8px] font-bold uppercase px-2 py-0.5 rounded-lg border shrink-0', count > 0 ? accentStyles.btnActive : 'bg-muted/30 text-muted-foreground border-border/20')}>
            {count > 0 ? `${count} cuenta${count === 1 ? '' : 's'} activa${count === 1 ? '' : 's'}` : 'Sin cuentas'}
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {family.kind === 'oauth' ? (
            <>
              {family.providers.map((provider) => (
                <span key={provider} className={cn('rounded-md border px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider', accentStyles.badge)}>
                  {ACTIVE_LABELS[provider] ?? provider}
                </span>
              ))}
            </>
          ) : (
            <span className={cn('rounded-md border px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider', accentStyles.badge)}>
              Vault unificado
            </span>
          )}
        </div>

        {activeAccounts.length > 0 ? (
          <div className="space-y-2 pt-1">
            <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Cuentas activas</p>
            <div className="max-h-36 space-y-2 overflow-y-auto pr-1">
              {activeAccounts.map((account) => (
                <div
                  key={account.id}
                  className={cn('flex items-center justify-between gap-3 rounded-xl border p-3', accentStyles.rowBorder)}
                >
                  <div className="min-w-0 overflow-hidden">
                    <span className={cn('block text-[8px] font-bold uppercase tracking-wider', accentStyles.rowText)}>
                      {account.label || ACTIVE_LABELS[account.type] || account.type}
                    </span>
                    <span className="block truncate font-mono text-[11px] text-zinc-300" title={connectionDetail(account)}>
                      {connectionDetail(account)}
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={() => onDisconnect(account.id)}
                    className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-red-400 transition-all hover:bg-red-500/10 hover:text-red-300 disabled:pointer-events-none disabled:opacity-50"
                  >
                    <Trash2 className="size-3" />
                    Quitar
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="pt-1 text-[10px] italic text-zinc-500">
            {family.kind === 'oauth'
              ? 'Todavía no hay cuentas conectadas. Cada inicio de sesión añade una nueva fila.'
              : 'Todavía no hay credenciales guardadas en el vault unificado.'}
          </p>
        )}
      </div>

      <div className="flex items-center justify-end">
        {family.kind === 'oauth' ? (
          <button
            type="button"
            disabled={isProcessing}
            onClick={onConnect}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-4 py-2 text-[9px] font-bold uppercase tracking-wider transition-all active:scale-95 disabled:pointer-events-none disabled:opacity-50',
              accentStyles.btnConnect
            )}
          >
            {isProcessing ? <Loader2 className="size-3 animate-spin" /> : <Link2 className="size-3" />}
            {family.actionLabel(count)}
          </button>
        ) : (
          <button
            type="button"
            disabled={isProcessing}
            onClick={() => onOpenVault(family.vaultTab ?? 'mega')}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-4 py-2 text-[9px] font-bold uppercase tracking-wider transition-all active:scale-95 disabled:pointer-events-none disabled:opacity-50',
              accentStyles.btnConnect
            )}
          >
            {isProcessing ? <Loader2 className="size-3 animate-spin" /> : <Link2 className="size-3" />}
            {family.actionLabel(count)}
          </button>
        )}
      </div>
    </div>
  );
}

interface LocalVolumeInputProps {
  label: string;
  placeholder: string;
  value: string;
  onChange: (val: string) => void;
  onMount: () => void;
  isProcessing: boolean;
}

function LocalVolumeInput({
  label,
  placeholder,
  value,
  onChange,
  onMount,
  isProcessing,
}: LocalVolumeInputProps) {
  return (
    <div className="space-y-1.5 rounded-xl border border-border/20 bg-background/25 p-4">
      <label className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </label>
      <div className="flex gap-2">
        <input
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 rounded-lg border border-border/40 bg-background/50 px-3 py-2 font-mono text-xs text-foreground transition-all focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/20"
        />
        <button
          type="button"
          onClick={onMount}
          disabled={!value || isProcessing}
          className="flex min-w-[70px] items-center justify-center rounded-lg bg-primary px-4 py-2 text-[9px] font-bold uppercase tracking-widest text-primary-foreground transition-all active:scale-95 disabled:pointer-events-none disabled:opacity-50"
        >
          {isProcessing ? <Loader2 className="size-3 animate-spin" /> : 'Montar'}
        </button>
      </div>
    </div>
  );
}

function connectionDetail(integration: IntegrationRow) {
  if (integration.type === 'mega') {
    return integration.config?.email || integration.label || 'Cuenta MEGA';
  }
  if (integration.type === 'claro') {
    const username = integration.config?.username || 'usuario';
    const baseUrl = integration.config?.baseUrl || 'https://www.clarodrive.com';
    return `${username} @ ${baseUrl}`;
  }
  if (integration.type === 's3') {
    const bucket = integration.config?.bucket || 'sin bucket';
    const email = integration.config?.email || 'sin email';
    return `bucket: ${bucket} - ${email}`;
  }
  if (integration.type === 'storage') {
    return integration.config?.basePath || 'volumen local';
  }
  return integration.connectionId || integration.label || integration.type;
}

export function ConnectionsPanel() {
  const userId = useIndraStore((s) => s.userId);
  const [integrations, setIntegrations] = useState<IntegrationRow[]>([]);
  const [localStoragePath, setLocalStoragePath] = useState('');
  const [jsonVaultPath, setJsonVaultPath] = useState('');
  const [vaultTab, setVaultTab] = useState<StorageTab>('mega');
  const [vaultOpen, setVaultOpen] = useState(false);
  const vaultSectionRef = useRef<HTMLDivElement | null>(null);
  const { actions, isProcessing } = useIntegrationState();

  const fetchIntegrations = useCallback(async () => {
    try {
      const res = await fetch('/api/integrations');
      if (res.ok) {
        const data = await res.json();
        const nextIntegrations = (data.integrations || []) as IntegrationRow[];
        setIntegrations(nextIntegrations);
        const localStorage = nextIntegrations.find(
          (integration) => integration.type === 'storage' && integration.isActive
        );
        if (localStorage?.config?.basePath) {
          setLocalStoragePath(localStorage.config.basePath);
        }
      }
    } catch (err) {
      console.error('[ConnectionsPanel] Failed to fetch integrations:', err);
    }
  }, []);

  const refresh = useCallback(() => fetchIntegrations(), [fetchIntegrations]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchIntegrations();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchIntegrations]);

  useEffect(() => {
    if (vaultOpen) {
      vaultSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [vaultOpen]);

  const families = useMemo(() => {
    return FAMILY_CATALOG.map((family) => ({
      ...family,
      accounts: integrations.filter(
        (integration) => integration.isActive && family.providers.includes(integration.type)
      ),
    }));
  }, [integrations]);

  const activeSummary = useMemo(() => {
    return integrations
      .filter((integration) => integration.isActive)
      .reduce<Array<{ type: string; count: number }>>((acc, integration) => {
        const current = acc.find((item) => item.type === integration.type);
        if (current) {
          current.count += 1;
        } else {
          acc.push({ type: integration.type, count: 1 });
        }
        return acc;
      }, []);
  }, [integrations]);

  const openVault = (tab: StorageTab) => {
    setVaultTab(tab);
    setVaultOpen(true);
  };

  const connect = async (provider: string) => {
    try {
      await actions.authorizeOAuth(provider);
      await refresh();
    } catch (err) {
      console.error(`[ConnectionsPanel] Auth failed for ${provider}:`, err);
    }
  };

  const disconnect = async (id: string) => {
    try {
      await actions.disconnectIntegration(id);
      await refresh();
    } catch (err) {
      console.error(`[ConnectionsPanel] Disconnect failed for ${id}:`, err);
    }
  };

  return (
    <div className="w-full max-w-6xl space-y-6">
      <div className="rounded-2xl border border-border/40 bg-background/60 p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="space-y-1">
            <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-muted-foreground">Mapa de conexiones</p>
            <p className="text-sm text-muted-foreground">
              Las cuentas OAuth se agregan desde su familia. MEGA, Cloudflare R2 y Claro Drive se gestionan en el vault unificado de credenciales.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {activeSummary.length > 0 ? (
              activeSummary.map((item) => (
                <span
                  key={item.type}
                  className="inline-flex items-center gap-2 rounded-full border border-border/40 bg-muted/40 px-3 py-1 text-[9px] font-bold uppercase tracking-wider text-foreground"
                >
                  <span className="size-2 rounded-full bg-primary/70" />
                  {ACTIVE_LABELS[item.type] ?? item.type}
                  {item.count > 1 ? ` x${item.count}` : ''}
                </span>
              ))
            ) : (
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground">Sin conexiones activas</span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {families.map((family) => (
          <FamilyCard
            key={family.key}
            family={family}
            accounts={family.accounts}
            isProcessing={isProcessing === family.key || isProcessing === family.providers[0]}
            onConnect={() => {
              if (family.kind === 'oauth') {
                void connect(family.providers[0]);
                return;
              }
              if (family.vaultTab) {
                openVault(family.vaultTab);
              }
            }}
            onOpenVault={openVault}
            onDisconnect={disconnect}
          />
        ))}
      </div>

      <div
        ref={vaultSectionRef}
        className="rounded-2xl border border-border/40 bg-muted/10 p-4 shadow-sm"
      >
        {userId ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-1">
                <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-muted-foreground">Vault unificado</p>
                <p className="text-xs text-muted-foreground">
                  Este panel sólo guarda credenciales directas. Google, Microsoft y Notion se conectan desde sus tarjetas OAuth.
                </p>
              </div>
              <button
                type="button"
                className="rounded-lg border border-border/40 bg-background/70 px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-foreground transition-all hover:bg-background"
                onClick={() => setVaultOpen((current) => !current)}
              >
                {vaultOpen ? 'Cerrar vault' : 'Abrir vault'}
              </button>
            </div>

            <CredentialVault
              userId={userId}
              onSaved={refresh}
              defaultTab={vaultTab}
              open={vaultOpen}
            />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Inicia sesión para administrar el vault unificado.</p>
        )}
      </div>

      <div className="rounded-2xl border border-border/40 bg-muted/10 p-5 space-y-4">
        <span className="text-xs font-bold uppercase tracking-wider text-foreground">Volúmenes locales</span>
        <p className="text-[10px] text-muted-foreground">
          Monta carpetas de la máquina local como silos internos. Cada ruta se valida antes de registrarse.
        </p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <LocalVolumeInput
            label="Local Storage"
            placeholder="/mnt/indra/media"
            value={localStoragePath}
            onChange={setLocalStoragePath}
            onMount={async () => {
              await actions.mountLocalProvider('storage', localStoragePath);
              await refresh();
            }}
            isProcessing={isProcessing === 'storage'}
          />
          <LocalVolumeInput
            label="JSON Data Vault"
            placeholder="/var/lib/indra/vault"
            value={jsonVaultPath}
            onChange={setJsonVaultPath}
            onMount={async () => {
              await actions.mountLocalProvider('json-file', jsonVaultPath);
              await refresh();
            }}
            isProcessing={isProcessing === 'json-file'}
          />
        </div>
      </div>
    </div>
  );
}

export default ConnectionsPanel;
