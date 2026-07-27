'use client';

import { useState, useEffect } from 'react';
import { Loader2, Trash2, Link2 } from 'lucide-react';
import { useIntegrationState } from '../logic/useIntegrationState';
import { CredentialVault } from '@/components/storage/CredentialVault';        
import { useIndraStore } from '@/stores/indra-store';
import { cn } from '@/lib/utils';

interface ProviderCardProps {
  title: string;
  description: string;
  tags?: string[];
  isConnected: boolean;
  isProcessing: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  accentColor: 'emerald' | 'blue' | 'zinc';
}

function ProviderCard({
  title,
  description,
  tags,
  isConnected,
  isProcessing,
  onConnect,
  onDisconnect,
  accentColor
}: ProviderCardProps) {
  const accentStyles = {
    emerald: {
      border: 'hover:border-emerald-500/30',
      glow: 'bg-emerald-500/5',
      badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      btnConnect: 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/20',
      btnActive: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
    },
    blue: {
      border: 'hover:border-blue-500/30',
      glow: 'bg-blue-500/5',
      badge: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
      btnConnect: 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-950/20',
      btnActive: 'bg-blue-500/10 text-blue-400 border-blue-500/20'
    },
    zinc: {
      border: 'hover:border-zinc-500/30',
      glow: 'bg-zinc-500/5',
      badge: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
      btnConnect: 'bg-zinc-700 hover:bg-zinc-600 text-white shadow-zinc-950/20',
      btnActive: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'
    }
  }[accentColor];

  return (
    <div className={cn(
      "group relative p-5 rounded-2xl border border-border/40 bg-muted/10 backdrop-blur-md transition-all duration-300 flex flex-col justify-between gap-4 overflow-hidden hover:scale-[1.01] hover:shadow-lg",
      accentStyles.border
    )}>
      {/* Decorative Glow */}
      <div className={cn("absolute -top-12 -right-12 w-32 h-32 rounded-full blur-[60px] pointer-events-none transition-all duration-500 group-hover:scale-125", accentStyles.glow)} />

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-foreground uppercase tracking-wider">{title}</span>
          {isConnected && (
            <span className={cn("text-[8px] font-bold uppercase px-2 py-0.5 rounded-lg border", accentStyles.btnActive)}>
              Conectado
            </span>
          )}
        </div>
        <p className="text-[10px] text-zinc-500 leading-relaxed max-w-[90%]">{description}</p>
        
        {tags && tags.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {tags.map(t => (
              <span key={t} className={cn("text-[8px] px-1.5 py-0.5 rounded font-bold uppercase border", accentStyles.badge)}>
                {t}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-end">
        {isConnected ? (
          <button
            type="button"
            disabled={isProcessing}
            onClick={onDisconnect}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-all"
          >
            {isProcessing ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <>
                <Trash2 className="size-3" />
                Desconectar
              </>
            )}
          </button>
        ) : (
          <button
            type="button"
            disabled={isProcessing}
            onClick={onConnect}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2 text-[9px] font-bold uppercase tracking-wider rounded-lg transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none",
              accentStyles.btnConnect
            )}
          >
            {isProcessing ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <>
                <Link2 className="size-3" />
                Conectar
              </>
            )}
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
  isProcessing
}: LocalVolumeInputProps) {
  return (
    <div className="space-y-1.5 bg-background/25 border border-border/20 p-4 rounded-xl">
      <label className="text-[9px] uppercase tracking-widest text-muted-foreground font-bold">
        {label}
      </label>
      <div className="flex gap-2">
        <input
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 bg-background/50 border border-border/40 rounded-lg px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 transition-all"
        />
        <button
          type="button"
          onClick={onMount}
          disabled={!value || isProcessing}
          className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-[9px] font-bold uppercase tracking-widest disabled:opacity-50 disabled:pointer-events-none transition-all active:scale-95 flex items-center justify-center min-w-[70px]"
        >
          {isProcessing ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            'Montar'
          )}
        </button>
      </div>
    </div>
  );
}

export function ConnectionsPanel() {
  const userId = useIndraStore((s) => s.userId);
  const [integrations, setIntegrations] = useState<any[]>([]);
  const [localStoragePath, setLocalStoragePath] = useState('');
  const [jsonVaultPath, setJsonVaultPath] = useState('');
  const { actions, isProcessing } = useIntegrationState();

  const fetchIntegrations = async () => {
    try {
      const res = await fetch('/api/integrations');
      if (res.ok) {
        const data = await res.json();
        const nextIntegrations = data.integrations || [];
        setIntegrations(nextIntegrations);
        const localStorage = nextIntegrations.find(
          (integration: any) => integration.type === 'storage' && integration.isActive
        );
        if (localStorage?.config?.basePath) {
          setLocalStoragePath(localStorage.config.basePath);
        }
      }
    } catch (err) {
      console.error('[ConnectionsPanel] Failed to fetch integrations:', err);
    }
  };

  const refresh = () => fetchIntegrations();       

  useEffect(() => { 
    refresh(); 
  }, []);

  const google = integrations.find(i => i.type === 'google-drive' && i.isActive);
  const onedrive = integrations.find(i => i.type === 'onedrive' && i.isActive);
  const notion = integrations.find(i => i.type === 'notion' && i.isActive);    
  const megaCount = integrations.filter(i => i.type === 'mega' && i.isActive).length;

  const connect = async (provider: string) => {
    try {
      await actions.authorizeOAuth(provider);
      await refresh();
    } catch (err) {
      console.error(`[ConnectionsPanel] Auth failed for ${provider}:`, err);
    }
  };

  const disconnect = async (provider: string) => {
    const integration = integrations.find(i => i.type === provider);
    if (integration) { 
      try {
        await actions.disconnectIntegration(integration.id);    
        await refresh(); 
      } catch (err) {
        console.error(`[ConnectionsPanel] Disconnect failed for ${provider}:`, err);
      }
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl w-full">

      {/* Google Family */}
      <ProviderCard
        title="Familia Google"
        description="Un inicio de sesión activa Drive, Sheets y YouTube."      
        tags={google ? ['Drive', 'Sheets', 'YouTube'] : undefined}
        isConnected={!!google}
        isProcessing={isProcessing === 'google-drive'}
        onConnect={() => connect('google-drive')}
        onDisconnect={() => disconnect('google-drive')}
        accentColor="emerald"
      />

      {/* Microsoft Family */}
      <ProviderCard
        title="Familia Microsoft"
        description="Activa el almacenamiento OneDrive con tu cuenta Microsoft."
        isConnected={!!onedrive}
        isProcessing={isProcessing === 'onedrive'}
        onConnect={() => connect('onedrive')}
        onDisconnect={() => disconnect('onedrive')}
        accentColor="blue"
      />

      {/* Notion */}
      <ProviderCard
        title="Notion"
        description="Sincronización de bases de datos y páginas de espacio de trabajo estructurado."
        isConnected={!!notion}
        isProcessing={isProcessing === 'notion'}
        onConnect={() => connect('notion')}
        onDisconnect={() => disconnect('notion')}
        accentColor="zinc"
      />

      {/* MEGA */}
      <div className="p-5 rounded-2xl border border-border/40 bg-muted/10 flex flex-col justify-between gap-4 overflow-hidden relative hover:scale-[1.01] hover:shadow-lg transition-all duration-300">
        <div className="absolute -top-12 -right-12 w-32 h-32 rounded-full blur-[60px] pointer-events-none bg-rose-500/5" />
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-foreground uppercase tracking-wider">MEGA</span>  
            {megaCount > 0 && (
              <span className="text-[8px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold uppercase">
                {megaCount} {megaCount === 1 ? 'Cuenta Activa' : 'Cuentas Activas'}
              </span>
            )}
          </div>
          <p className="text-[10px] text-zinc-500 leading-relaxed">
            Bóveda cifrada en el servidor (AES-256-GCM). Añade y unifica múltiples cuentas para crear un gran almacenamiento virtual.
          </p>
        </div>
        {userId && (
          <div className="pt-2 border-t border-border/20 text-left">
            <CredentialVault userId={userId} onSaved={refresh} />
          </div>
        )}
      </div>

      {/* Volúmenes Locales */}
      <div className="md:col-span-2 p-5 rounded-2xl border border-border/40 bg-muted/10 space-y-4 flex flex-col justify-between">
        <span className="text-xs font-bold text-foreground uppercase tracking-wider">Volúmenes Locales</span>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
