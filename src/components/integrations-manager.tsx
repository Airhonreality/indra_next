'use client';

import { useState, useEffect } from 'react';
import { Zap, Shield, Link2, CheckCircle2, Circle, Loader2, Plus } from 'lucide-react';
import Nango from '@nangohq/frontend';
import { cn } from '@/lib/utils';

interface NangoConfig {
  unique_key: string;
  provider: string;
}

interface Integration {
  id: string;
  type: string;
  label: string;
  isConnected: boolean;
}

export function IntegrationsManager() {
  const [available, setAvailable] = useState<NangoConfig[]>([]);
  const [connected, setConnected] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);

  const nango = new Nango({
    publicKey: process.env.NEXT_PUBLIC_NANGO_PUBLIC_KEY || ''
  });

  const fetchData = async () => {
    try {
      const [discoveryRes, connectedRes] = await Promise.all([
        fetch('/api/discovery/integrations'),
        fetch('/api/integrations') // Necesitaremos crear este endpoint
      ]);

      const discoveryData = await discoveryRes.json();
      const connectedData = await connectedRes.json();

      setAvailable(discoveryData.integrations || []);
      setConnected(connectedData.integrations || []);
    } catch (err) {
      console.error('Failed to fetch integrations:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleConnect = async (provider: string) => {
    setConnecting(provider);
    try {
      // 1. Abrir el flujo de Nango
      // Usamos un ID de conexión aleatorio o basado en el usuario para esta demo
      const connectionId = `conn_${Math.random().toString(36).substring(7)}`;
      
      await nango.auth(provider, connectionId);

      // 2. Registrar la conexión en nuestra DB (Neon)
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

  if (loading) {
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
          <h3 className="text-lg font-semibold text-foreground">Infrastructure Discovery</h3>
          <p className="text-sm text-muted-foreground">Active integrations detected in your Nango project.</p>
        </div>
        <Zap className="size-5 text-amber-500 fill-amber-500/20" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {available.map((config) => {
          const isConnected = connected.some(c => c.type === config.provider);
          
          return (
            <div 
              key={config.unique_key}
              className={cn(
                "group relative overflow-hidden rounded-xl border p-5 transition-all hover:shadow-md",
                isConnected ? "bg-emerald-500/5 border-emerald-500/20" : "bg-card border-border hover:border-primary/30"
              )}
            >
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold capitalize text-foreground">{config.provider}</p>
                    {isConnected ? (
                      <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-emerald-600 bg-emerald-100 dark:bg-emerald-500/20 dark:text-emerald-400 px-1.5 py-0.5 rounded">
                        <CheckCircle2 className="size-3" />
                        Connected
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        <Circle className="size-3" />
                        Available
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">Agnostic data silo provider via Nango</p>
                </div>
                
                <div className={cn(
                  "size-10 rounded-lg flex items-center justify-center transition-colors",
                  isConnected ? "bg-emerald-500/10 text-emerald-600" : "bg-primary/10 text-primary"
                )}>
                  {isConnected ? <Shield className="size-5" /> : <Link2 className="size-5" />}
                </div>
              </div>

              <div className="mt-6">
                <button
                  onClick={() => handleConnect(config.provider)}
                  disabled={!!connecting}
                  className={cn(
                    "w-full flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-all",
                    isConnected 
                      ? "bg-muted text-muted-foreground hover:bg-muted/80" 
                      : "bg-primary text-primary-foreground hover:opacity-90 shadow-sm"
                  )}
                >
                  {connecting === config.provider ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : isConnected ? (
                    'Configure Settings'
                  ) : (
                    <>
                      <Plus className="size-4" />
                      Connect {config.provider}
                    </>
                  )}
                </button>
              </div>
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
