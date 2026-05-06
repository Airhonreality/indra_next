'use client';

import { useState, useEffect } from 'react';
import { Shield, Link2, Loader2, Database, Key, Plus, AlertCircle } from 'lucide-react';
import Nango from '@nangohq/frontend';
import { cn } from '@/lib/utils';
import { SchemaManager } from './schema-manager';
import type { FieldSchema } from '@/core/types/integration';
import { useSession } from 'next-auth/react';
import { i18n } from '@/lib/i18n';

/**
 * CONNECTION MANAGER COMPONENT
 * Standard interface for managing external cloud storage connections.
 * Implements agnostic discovery: UI is driven by active provider configurations.
 */

const t = i18n.es;

interface ProviderConfig {
  unique_key: string;
  provider: string;
}

interface Connection {
  id: string;
  type: string;
  label: string;
  isConnected: boolean;
  dynamicSchema?: FieldSchema[];
}

export function ConnectionManager() {
  const { data: session, status } = useSession();
  const userId = session?.user?.id;
  const userEmail = session?.user?.email;
  
  // State management
  const [availableProviders, setAvailableProviders] = useState<ProviderConfig[]>([]);
  const [activeConnections, setActiveConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState<string | null>(null);
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false);
  const [managingSchemaId, setManagingSchemaId] = useState<string | null>(null);
  
  // Admin form state
  const [adminConfig, setAdminConfig] = useState({ provider: '', clientId: '', clientSecret: '' });

  const nango = new Nango();

  /**
   * REFRESH SYSTEM DATA
   * Syncs available providers from Nango and user-specific active connections.
   */
  const refreshData = async () => {
    if (!userId) return;
    try {
      const [discoveryRes, connectionsRes] = await Promise.all([
        fetch('/api/discovery/integrations'),
        fetch(`/api/integrations?userId=${userId}`)
      ]);

      const discoveryData = await discoveryRes.json();
      const connectionsData = await connectionsRes.json();

      setAvailableProviders(discoveryData.providers || []);
      setActiveConnections(connectionsData.integrations || []);
    } catch (err) {
      console.error('[ConnectionManager]: Initialization failed', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (status === 'authenticated') refreshData();
  }, [status, userId]);

  /**
   * ADMIN ACTION: Provision new credentials in the core infrastructure
   */
  const handleProvisioning = async () => {
    if (!adminConfig.provider || !adminConfig.clientId || !adminConfig.clientSecret) {
      alert('Missing credentials parameters');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/discovery/integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: adminConfig.provider,
          client_id: adminConfig.clientId,
          client_secret: adminConfig.clientSecret
        })
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Provisioning failed');
      }
      
      setAdminConfig({ provider: '', clientId: '', clientSecret: '' });
      setIsAdminPanelOpen(false);
      await refreshData();
    } catch (err) {
      alert(`[Admin Error]: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  /**
   * USER ACTION: Authorize access to personal cloud storage
   */
  const handleAuthorization = async (provider: string) => {
    if (!userId) return;
    setIsProcessing(provider);
    
    try {
      // 1. Generate secure session token via backend mediator
      const sessionRes = await fetch('/api/nango/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ integrationId: provider }),
      });
      
      const { sessionToken, error } = await sessionRes.json();
      if (error) throw new Error(error);

      // 2. Open Nango Connect UI (Browser side)
      await new Promise<void>((resolve) => {
        const connect = nango.openConnectUI({
          onEvent: (event) => {
            if (event.type === 'connect') {
              // 3. Persist successful connection in the sovereign database
              fetch('/api/integrations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  type: provider,
                  label: `${provider.charAt(0).toUpperCase() + provider.slice(1)} Connection`,
                  connectionId: userId // Sovereignty Rule: connectionId matches userId
                })
              }).then(() => refreshData()).then(resolve);
            } else if (event.type === 'close') {
              resolve();
            }
          },
        });
        connect.setSessionToken(sessionToken);
      });
    } catch (err) {
      console.error('[Authorization Error]:', err);
    } finally {
      setIsProcessing(null);
    }
  };

  if (status === 'loading' || (loading && availableProviders.length === 0)) {
    return (
      <div className="flex flex-col items-center justify-center p-12 space-y-4">
        <Loader2 className="size-6 animate-spin text-primary" />
        <p className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">{t.common.loading}</p>
      </div>
    );
  }

  // Basic admin check for the UI (Matches the backend check)
  // Temporarily allowing all authenticated users to see the panel for MVP
  const isSystemAdmin = !!userId;

  return (
    <div className="space-y-8">
      {/* SECTION: User Account Info */}
      <div className="flex flex-col md:flex-row items-start md:items-end justify-between gap-4 border-b border-border pb-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-primary font-bold text-[10px] uppercase tracking-[0.2em]">
            <Shield className="size-4" />
            {t.auth.identity}
          </div>
          <h3 className="text-2xl font-bold text-foreground tracking-tighter">{t.auth.account}</h3>
          <p className="text-xs text-muted-foreground font-mono bg-muted px-2 py-1 rounded inline-block">UID: {userId}</p>
        </div>
        
        {isSystemAdmin && (
          <button 
            onClick={() => setIsAdminPanelOpen(!isAdminPanelOpen)}
            className="flex items-center gap-2 rounded-xl bg-muted px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:bg-muted/80 transition-all border border-border"
          >
            {isAdminPanelOpen ? t.common.cancel : t.connections.provision}
          </button>
        )}
      </div>

      {/* SECTION: Admin Provisioning Panel (Restricted) */}
      {isAdminPanelOpen && (
        <div className="bg-card border border-primary/30 rounded-2xl p-8 space-y-6 animate-in fade-in slide-in-from-top-4 duration-500 shadow-xl">
          <div className="space-y-2">
            <h4 className="text-sm font-bold text-foreground flex items-center gap-2 uppercase tracking-tighter text-primary">
              <Key className="size-4" />
              {t.connections.credentials}
            </h4>
            <p className="text-xs text-muted-foreground">Administración: Registro de secretos de aplicación para habilitar nuevos proveedores.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <input 
              placeholder="Provider Key (eg. google-drive)" 
              className="bg-muted border border-border rounded-xl px-4 py-3 text-sm"
              value={adminConfig.provider}
              onChange={e => setAdminConfig({ ...adminConfig, provider: e.target.value })}
            />
            <input 
              placeholder="Client ID" 
              className="bg-muted border border-border rounded-xl px-4 py-3 text-sm"
              value={adminConfig.clientId}
              onChange={e => setAdminConfig({ ...adminConfig, clientId: e.target.value })}
            />
            <input 
              placeholder="Client Secret" 
              type="password"
              className="bg-muted border border-border rounded-xl px-4 py-3 text-sm"
              value={adminConfig.clientSecret}
              onChange={e => setAdminConfig({ ...adminConfig, clientSecret: e.target.value })}
            />
          </div>
          
          <button 
            onClick={handleProvisioning}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-xl text-xs font-bold uppercase tracking-widest hover:opacity-90"
          >
            <Plus className="size-4" />
            {t.connections.provision}
          </button>
        </div>
      )}

      {/* SECTION: Available Providers and Active Connections */}
      <div className="space-y-4">
        <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground opacity-50 ml-1">{t.connections.discovered}</h4>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {availableProviders.map((provider) => {
            const activeConn = activeConnections.find(c => c.type === provider.provider);
            const isConnected = !!activeConn;
            
            return (
              <div 
                key={provider.unique_key}
                className={cn(
                  "group relative overflow-hidden rounded-3xl border p-6 transition-all duration-500",
                  isConnected 
                    ? "bg-emerald-500/[0.03] border-emerald-500/30 shadow-lg shadow-emerald-500/[0.05]" 
                    : "bg-card border-border hover:border-primary/40"
                )}
              >
                <div className="relative flex items-center justify-between mb-8">
                  <div className="flex items-center gap-4">
                    <div className="size-14 rounded-2xl bg-muted/80 flex items-center justify-center border border-border overflow-hidden shadow-inner">
                      <Link2 className={cn("size-6", isConnected ? "text-emerald-500" : "text-muted-foreground")} />
                    </div>
                    <div>
                      <p className="font-bold text-lg tracking-tighter text-foreground">
                        {provider.provider.toUpperCase()}
                      </p>
                      <div className="flex items-center gap-2">
                        <div className={cn("size-1.5 rounded-full", isConnected ? "bg-emerald-500 animate-pulse" : "bg-zinc-600")} />
                        <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                          {isConnected ? t.common.active : 'Disponible'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <button
                    onClick={() => handleAuthorization(provider.provider)}
                    disabled={!!isProcessing}
                    className={cn(
                      "w-full flex items-center justify-center gap-3 rounded-2xl py-4 text-[10px] font-black uppercase tracking-widest transition-all",
                      isConnected 
                        ? "bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 border border-emerald-500/20" 
                        : "bg-primary text-primary-foreground hover:shadow-lg"
                    )}
                  >
                    {isProcessing === provider.provider ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : isConnected ? (
                      'Actualizar Conexión'
                    ) : (
                      t.connections.authorize
                    )}
                  </button>
                  
                  {isConnected && (
                    <button
                      onClick={() => setManagingSchemaId(managingSchemaId === provider.provider ? null : provider.provider)}
                      className="w-full py-3 flex items-center justify-center gap-2 rounded-2xl bg-primary/5 text-primary border border-primary/20 hover:bg-primary/10 text-[9px] font-bold uppercase tracking-widest transition-all"
                    >
                      <Database className="size-3" />
                      Editar Esquema de Datos
                    </button>
                  )}
                </div>

                {managingSchemaId === provider.provider && activeConn && (
                  <div className="mt-6 pt-6 border-t border-border animate-in slide-in-from-bottom-2 duration-500">
                    <SchemaManager 
                      integrationId={activeConn.id}
                      currentSchema={activeConn.dynamicSchema || []}
                      onUpdate={refreshData}
                    />
                  </div>
                )}
              </div>
            );
          })}

          {availableProviders.length === 0 && (
            <div className="col-span-full rounded-3xl border border-dashed border-border p-16 text-center bg-muted/20">
              <AlertCircle className="size-8 text-muted-foreground mx-auto mb-4" />
              <p className="text-xs text-muted-foreground uppercase font-bold tracking-widest mb-4">{t.connections.no_infra}</p>
              {isSystemAdmin && (
                <button 
                  onClick={() => setIsAdminPanelOpen(true)}
                  className="text-primary text-[10px] font-black uppercase tracking-[0.2em] hover:underline"
                >
                  Configurar primer proveedor →
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
