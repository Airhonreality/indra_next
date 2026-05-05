'use client';

import { useState, useEffect } from 'react';
import { Zap, Shield, Link2, Loader2, Database, Key } from 'lucide-react';
import Nango from '@nangohq/frontend';
import { cn } from '@/lib/utils';
import { SchemaManager } from './schema-manager';
import type { FieldSchema } from '@/core/types/integration';
import { useSession } from 'next-auth/react';
import { i18n } from '@/lib/i18n';

const t = i18n.es; // Default language: Spanish Standard

interface NangoConfig {
  unique_key: string;
  provider: string;
}

interface Integration {
  id: string;
  type: string;
  label: string;
  isConnected: boolean;
  dynamicSchema?: FieldSchema[];
}

interface CatalogItem {
  id: string;
  name: string;
  icon: string;
}

export function IntegrationsManager() {
  const { data: session, status } = useSession();
  const userId = session?.user?.id;
  const isLoaded = status !== 'loading';
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [available, setAvailable] = useState<NangoConfig[]>([]);
  const [connected, setConnected] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [showProvision, setShowProvision] = useState(false);
  const [managingSchema, setManagingSchema] = useState<string | null>(null);
  const [newConfig, setNewConfig] = useState({ provider: '', client_id: '', client_secret: '' });
  const [searchTerm, setSearchTerm] = useState('');

  const nango = new Nango();

  const fetchData = async () => {
    if (!userId) return;
    try {
      const [discoveryRes, connectedRes, catalogRes] = await Promise.all([
        fetch('/api/discovery/integrations'),
        fetch(`/api/integrations?userId=${userId}`),
        fetch('/api/discovery/catalog')
      ]);

      const discoveryData = await discoveryRes.json();
      const connectedData = await connectedRes.json();
      const catalogData = await catalogRes.json();

      setAvailable(discoveryData.integrations || []);
      setConnected(connectedData.integrations || []);
      setCatalog(catalogData.catalog || []);
    } catch (err) {
      console.error('Failed to fetch integrations:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isLoaded) fetchData();
  }, [isLoaded, userId]);

  const handleProvision = async (provider: string) => {
    if (!newConfig.client_id || !newConfig.client_secret) {
      alert('Por favor, completa el Client ID y el Secret');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/discovery/integrations', {
        method: 'POST',
        body: JSON.stringify({ ...newConfig, provider })
      });
      if (!res.ok) throw new Error('Falló el aprovisionamiento');
      
      setNewConfig({ provider: '', client_id: '', client_secret: '' });
      setShowProvision(false);
      setSearchTerm('');
      await fetchData();
    } catch (err) {
      console.error(err);
      alert('Error: ' + (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async (provider: string) => {
    if (!userId) return;
    setConnecting(provider);
    try {
      const sessionRes = await fetch('/api/nango/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, integrationId: provider }),
      });
      const { sessionToken, error } = await sessionRes.json();
      if (error) throw new Error(error);

      await new Promise<void>((resolve, reject) => {
        const connect = nango.openConnectUI({
          onEvent: (event) => {
            if (event.type === 'connect') {
              fetch('/api/integrations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  type: provider,
                  label: `${provider.charAt(0).toUpperCase() + provider.slice(1)} Connection`,
                  connectionId: userId
                })
              }).then(() => fetchData()).then(resolve);
            } else if (event.type === 'close') {
              resolve();
            }
          },
        });
        connect.setSessionToken(sessionToken);
      });
    } catch (err) {
      console.error('Connection failed:', err);
    } finally {
      setConnecting(null);
    }
  };

  const filteredCatalog = catalog.filter(item => 
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
    !available.some(a => a.provider === item.id)
  );

  if (!isLoaded || (loading && available.length === 0)) {
    return (
      <div className="flex flex-col items-center justify-center p-12 space-y-4 text-center">
        <Loader2 className="size-6 animate-spin text-primary" />
        <p className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">{t.common.loading}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* ── Standard Header ── */}
      <div className="flex flex-col md:flex-row items-start md:items-end justify-between gap-4 border-b border-primary/10 pb-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-primary font-bold text-[10px] uppercase tracking-[0.2em]">
            <Shield className="size-4" />
            {t.auth.identity}
          </div>
          <h3 className="text-2xl font-bold text-foreground tracking-tighter">{t.auth.account}</h3>
          <p className="text-xs text-muted-foreground font-mono bg-muted px-2 py-1 rounded inline-block">ID: {userId}</p>
        </div>
        
        <div className="flex gap-2">
          <button 
            onClick={() => setShowProvision(!showProvision)}
            className="flex items-center gap-2 rounded-xl bg-muted px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:bg-muted/80 transition-all border border-border"
          >
            {showProvision ? 'Cerrar Panel' : t.connections.provision}
          </button>
        </div>
      </div>

      {showProvision && (
        <div className="bg-card border border-primary/30 rounded-2xl p-8 space-y-6 animate-in fade-in slide-in-from-top-4 duration-500 shadow-2xl">
          <div className="space-y-2">
            <h4 className="text-sm font-bold text-foreground flex items-center gap-2 uppercase tracking-tighter text-primary">
              <Key className="size-4" />
              {t.connections.credentials}
            </h4>
            <p className="text-xs text-muted-foreground">Configura las credenciales de tus proveedores para habilitar nuevas conexiones.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Client Secrets</label>
                <input 
                  placeholder="Client ID" 
                  className="bg-muted/50 border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                  value={newConfig.client_id}
                  onChange={e => setNewConfig({ ...newConfig, client_id: e.target.value })}
                />
                <input 
                  placeholder="Client Secret" 
                  type="password"
                  className="bg-muted/50 border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                  value={newConfig.client_secret}
                  onChange={e => setNewConfig({ ...newConfig, client_secret: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Catálogo de Proveedores</label>
                <input 
                  placeholder="Buscar proveedor..." 
                  className="bg-muted/50 border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
                <div className="grid grid-cols-2 gap-2 max-h-[120px] overflow-y-auto p-1 custom-scrollbar">
                  {filteredCatalog.map(item => (
                    <button
                      key={item.id}
                      onClick={() => handleProvision(item.id)}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-primary/5 border border-transparent hover:border-primary/20 transition-all text-left"
                    >
                      <img src={item.icon} alt={item.name} className="size-5 rounded" />
                      <span className="text-[10px] font-bold uppercase tracking-tight">{item.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

        {/* ── Connections List ── */}
      <div className="space-y-4">
        <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground opacity-50 ml-1">{t.connections.title}</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {available.map((config) => {
            const isConnected = connected.some(c => c.type === config.provider);
            const catalogItem = catalog.find(c => c.id === config.provider);
            
            return (
              <div 
                key={config.unique_key}
                className={cn(
                  "group relative overflow-hidden rounded-3xl border p-6 transition-all duration-700",
                  isConnected 
                    ? "bg-emerald-500/[0.03] border-emerald-500/30 shadow-xl shadow-emerald-500/[0.05]" 
                    : "bg-card border-border hover:border-primary/40 hover:shadow-2xl hover:shadow-primary/[0.03]"
                )}
              >
                {/* Background Ornament */}
                <div className={cn(
                  "absolute -right-4 -top-4 size-24 blur-3xl opacity-20 transition-all duration-700 group-hover:scale-150",
                  isConnected ? "bg-emerald-500" : "bg-primary"
                )} />

                <div className="relative flex items-center justify-between mb-8">
                  <div className="flex items-center gap-4">
                    <div className="size-14 rounded-2xl bg-muted/80 flex items-center justify-center border border-border group-hover:rotate-6 transition-transform duration-500 overflow-hidden shadow-inner">
                      {catalogItem ? (
                        <img src={catalogItem.icon} alt={config.provider} className="size-8" />
                      ) : (
                        <Link2 className="size-6 text-muted-foreground" />
                      )}
                    </div>
                    <div>
                      <p className="font-black text-lg tracking-tighter text-foreground group-hover:translate-x-1 transition-transform">
                        {catalogItem?.name || config.provider}
                      </p>
                      <div className="flex items-center gap-2">
                        <div className={cn("size-1.5 rounded-full", isConnected ? "bg-emerald-500 animate-pulse" : "bg-zinc-600")} />
                        <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                          {isConnected ? t.common.active : 'Desconectado'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-auto space-y-3">
                  <button
                    onClick={() => handleConnect(config.provider)}
                    disabled={!!connecting}
                    className={cn(
                      "w-full flex items-center justify-center gap-3 rounded-2xl py-4 text-[10px] font-black uppercase tracking-widest transition-all duration-500",
                      isConnected 
                        ? "bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 border border-emerald-500/20" 
                        : "bg-primary text-primary-foreground hover:shadow-[0_8px_20px_rgba(var(--primary-rgb),0.3)] hover:-translate-y-1"
                    )}
                  >
                    {connecting === config.provider ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : isConnected ? (
                      'Actualizar Conexión'
                    ) : (
                      t.connections.authorize
                    )}
                  </button>
                  
                  {isConnected && (
                    <button
                      onClick={() => setManagingSchema(managingSchema === config.provider ? null : config.provider)}
                      className="w-full py-3 flex items-center justify-center gap-2 rounded-2xl bg-primary/5 text-primary border border-primary/20 hover:bg-primary/10 text-[9px] font-bold uppercase tracking-widest transition-all"
                    >
                      <Database className="size-3" />
                      Editar Esquema
                    </button>
                  )}
                </div>

                {managingSchema === config.provider && (
                  <div className="mt-6 pt-6 border-t border-emerald-500/10 animate-in slide-in-from-bottom-2 duration-500">
                    <SchemaManager 
                      integrationId={connected.find(c => c.type === config.provider)?.id || ''}
                      currentSchema={connected.find(c => c.type === config.provider)?.dynamicSchema || []}
                      onUpdate={fetchData}
                    />
                  </div>
                )}
              </div>
            );
          })}

          {available.length === 0 && (
            <div className="col-span-full rounded-3xl border border-dashed border-border p-16 text-center bg-muted/20">
              <p className="text-xs text-muted-foreground uppercase font-bold tracking-widest mb-4">{t.connections.no_infra}</p>
              <button 
                onClick={() => setShowProvision(true)}
                className="text-primary text-[10px] font-black uppercase tracking-[0.2em] hover:underline"
              >
                {t.connections.provision} →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
