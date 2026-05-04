'use client';

import { useState, useEffect } from 'react';
import { Zap, Shield, Link2, CheckCircle2, Circle, Loader2, Plus, Database } from 'lucide-react';
import Nango from '@nangohq/frontend';
import { cn } from '@/lib/utils';
import { SchemaManager } from './schema-manager';
import type { FieldSchema } from '@/core/types/integration';

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
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [available, setAvailable] = useState<NangoConfig[]>([]);
  const [connected, setConnected] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [showProvision, setShowProvision] = useState(false);
  const [managingSchema, setManagingSchema] = useState<string | null>(null);
  const [newConfig, setNewConfig] = useState({ provider: '', client_id: '', client_secret: '' });
  const [searchTerm, setSearchTerm] = useState('');

  const nango = new Nango({
    publicKey: process.env.NEXT_PUBLIC_NANGO_PUBLIC_KEY || ''
  });

  const fetchData = async () => {
    try {
      const [discoveryRes, connectedRes, catalogRes] = await Promise.all([
        fetch('/api/discovery/integrations'),
        fetch('/api/integrations'),
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
    fetchData();
  }, []);

  const handleProvision = async (provider: string) => {
    if (!newConfig.client_id || !newConfig.client_secret) {
      alert('Please fill in Client ID and Secret first');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/discovery/integrations', {
        method: 'POST',
        body: JSON.stringify({ ...newConfig, provider })
      });
      if (!res.ok) throw new Error('Provisioning failed');
      
      setNewConfig({ provider: '', client_id: '', client_secret: '' });
      setShowProvision(false);
      setSearchTerm('');
      await fetchData();
    } catch (err) {
      console.error(err);
      alert('Failed to provision: ' + (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async (provider: string) => {
    setConnecting(provider);
    try {
      const connectionId = `conn_${Math.random().toString(36).substring(7)}`;
      await nango.auth(provider, connectionId);

      await fetch('/api/integrations', {
        method: 'POST',
        body: JSON.stringify({
          type: provider,
          label: `${provider.charAt(0).toUpperCase() + provider.slice(1)} Connection`,
          connectionId: connectionId
        })
      });

      await fetchData();
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

  if (loading && available.length === 0) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground italic font-serif tracking-tight">Infrastructure Discovery</h3>
          <p className="text-xs text-muted-foreground font-mono uppercase tracking-widest opacity-60">autonomous resource awareness</p>
        </div>
        <button 
          onClick={() => setShowProvision(!showProvision)}
          className="flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-primary hover:bg-primary/20 transition-all border border-primary/20"
        >
          {showProvision ? 'Close Portal' : 'Inject Capacity'}
        </button>
      </div>

      {showProvision && (
        <div className="bg-card border border-primary/30 rounded-2xl p-8 space-y-6 animate-in fade-in zoom-in-95 duration-300 shadow-2xl shadow-primary/5">
          <div className="space-y-2">
            <h4 className="text-sm font-bold text-foreground flex items-center gap-2 uppercase tracking-tighter">
              <Zap className="size-4 text-amber-500 fill-amber-500/20" />
              Provisioning Layer
            </h4>
            <p className="text-xs text-muted-foreground">Select a provider from the catalog and inject its secrets into the infrastructure.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Client Credentials</label>
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
                <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Service Catalog</label>
                <input 
                  placeholder="Search providers..." 
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
                      <img src={item.icon} alt={item.name} className="size-6 rounded" />
                      <span className="text-xs font-semibold">{item.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {available.map((config) => {
          const isConnected = connected.some(c => c.type === config.provider);
          const catalogItem = catalog.find(c => c.id === config.provider);
          
          return (
            <div 
              key={config.unique_key}
              className={cn(
                "group relative overflow-hidden rounded-2xl border p-6 transition-all duration-500",
                isConnected 
                  ? "bg-emerald-500/[0.02] border-emerald-500/20 shadow-lg shadow-emerald-500/[0.02]" 
                  : "bg-card border-border hover:border-primary/30 hover:shadow-xl hover:shadow-primary/[0.02]"
              )}
            >
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="size-12 rounded-xl bg-muted/50 flex items-center justify-center border border-border group-hover:scale-110 transition-transform duration-500 overflow-hidden">
                      {catalogItem ? (
                        <img src={catalogItem.icon} alt={config.provider} className="size-8" />
                      ) : (
                        <Link2 className="size-6 text-muted-foreground" />
                      )}
                    </div>
                    <div>
                      <p className="font-bold text-lg tracking-tight capitalize text-foreground">
                        {catalogItem?.name || config.provider}
                      </p>
                      {isConnected ? (
                        <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-emerald-600 bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 px-2 py-0.5 rounded-full">
                          <Shield className="size-3" />
                          Protocol Active
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full">
                          <Circle className="size-3" />
                          Standby
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className={cn(
                  "size-8 rounded-full flex items-center justify-center transition-all duration-500",
                  isConnected ? "bg-emerald-500/10 text-emerald-600 rotate-12" : "bg-primary/10 text-primary -rotate-12"
                )}>
                  {isConnected ? <CheckCircle2 className="size-4" /> : <Plus className="size-4" />}
                </div>
              </div>

              <div className="mt-8 flex gap-2">
                <button
                  onClick={() => handleConnect(config.provider)}
                  disabled={!!connecting}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-3 rounded-xl py-3 text-xs font-black uppercase tracking-widest transition-all duration-300",
                    isConnected 
                      ? "bg-muted/50 text-muted-foreground hover:bg-muted/80 border border-border" 
                      : "bg-primary text-primary-foreground hover:shadow-lg hover:shadow-primary/20 hover:-translate-y-0.5"
                  )}
                >
                  {connecting === config.provider ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : isConnected ? (
                    'Reconfigure'
                  ) : (
                    'Authorize Access'
                  )}
                </button>
                
                {isConnected && (
                  <button
                    onClick={() => setManagingSchema(managingSchema === config.provider ? null : config.provider)}
                    className="p-3 rounded-xl bg-primary/5 text-primary border border-primary/20 hover:bg-primary/10 transition-all"
                  >
                    <Database className="size-4" />
                  </button>
                )}
              </div>

              {managingSchema === config.provider && (
                <div className="mt-4 pt-4 border-t border-border animate-in slide-in-from-bottom-2 duration-300">
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
          <div className="col-span-full rounded-xl border border-dashed border-border p-12 text-center">
            <p className="text-sm text-muted-foreground">No integrations discovered. Add one in your Nango dashboard to see it here.</p>
          </div>
        )}
      </div>
    </div>
  );
}
