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
  const [managingSchemaId, setManagingSchemaId] = useState<string | null>(null);

  const nango = new Nango();

  // The adapters currently implemented in Indra's codebase
  const INDRA_ADAPTERS = ['google-drive', 'google-sheets', 'notion', 'storage', 'json-file'];

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
   * USER ACTION: Authorize access to personal cloud storage
   */
  const handleAuthorization = async (provider: string) => {
    if (!userId) return;
    setIsProcessing(provider);
    
    try {
      const sessionRes = await fetch('/api/nango/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ integrationId: provider }),
      });
      
      const { sessionToken, error } = await sessionRes.json();
      if (error) throw new Error(error);

      await new Promise<void>((resolve) => {
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

  if (status === 'loading' || loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 space-y-4">
        <Loader2 className="size-6 animate-spin text-primary" />
        <p className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">{t.common.loading}</p>
      </div>
    );
  }

  // Calculate KPIs
  const translatedNangoProviders = availableProviders.filter(p => INDRA_ADAPTERS.includes(p.provider));
  const missingIndraTranslations = availableProviders.filter(p => !INDRA_ADAPTERS.includes(p.provider));
  const translationKPI = availableProviders.length > 0 
    ? Math.round((translatedNangoProviders.length / availableProviders.length) * 100) 
    : 0;

  return (
    <div className="space-y-12">
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
      </div>

      {/* SECTION: System KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-card border border-border p-6 rounded-xl flex flex-col gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Indra Adapters</span>
          <span className="text-3xl font-black text-foreground">{INDRA_ADAPTERS.length}</span>
          <span className="text-xs text-muted-foreground">Sistemas traducidos nativamente</span>
        </div>
        <div className="bg-card border border-border p-6 rounded-xl flex flex-col gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Nango Configurados</span>
          <span className="text-3xl font-black text-primary">{availableProviders.length}</span>
          <span className="text-xs text-muted-foreground">Proveedores expuestos por Nango</span>
        </div>
        <div className="bg-card border border-border p-6 rounded-xl flex flex-col gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Cobertura (KPI)</span>
          <span className="text-3xl font-black text-emerald-600">{translationKPI}%</span>
          <span className="text-xs text-muted-foreground">Compatibilidad Nango-Indra</span>
        </div>
      </div>

      {/* SECTION: Mis Integraciones Activas */}
      <div className="space-y-4">
        <h4 className="text-[10px] font-bold uppercase tracking-[0.3em] text-muted-foreground opacity-50 ml-1">Tus Conexiones Soberanas</h4>
        
        {activeConnections.length === 0 ? (
           <div className="rounded-xl border border-dashed border-border p-8 text-center bg-muted/20">
             <AlertCircle className="size-6 text-muted-foreground mx-auto mb-2" />
             <p className="text-xs text-muted-foreground uppercase font-bold tracking-widest">Sin Conexiones Activas</p>
           </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {activeConnections.map(conn => (
               <div key={conn.id} className="bg-emerald-500/[0.03] border border-emerald-500/30 rounded-2xl p-6 shadow-sm">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="size-10 rounded-xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                      <Database className="size-5 text-emerald-600" />
                    </div>
                    <div>
                      <p className="font-bold text-sm tracking-tighter text-foreground">{conn.label}</p>
                      <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-600">Conexión Activa</span>
                    </div>
                  </div>
                  <button
                    onClick={() => setManagingSchemaId(managingSchemaId === conn.type ? null : conn.type)}
                    className="w-full py-2 flex items-center justify-center gap-2 rounded-xl bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 text-[9px] font-bold uppercase tracking-widest transition-all"
                  >
                    Editar Esquema
                  </button>
                  
                  {managingSchemaId === conn.type && (
                    <div className="mt-4 pt-4 border-t border-emerald-500/10">
                      <SchemaManager 
                        integrationId={conn.id}
                        currentSchema={conn.dynamicSchema || []}
                        onUpdate={refreshData}
                      />
                    </div>
                  )}
               </div>
            ))}
          </div>
        )}
      </div>

      {/* SECTION: Catálogo de Proveedores */}
      <div className="space-y-4 pt-8 border-t border-border">
        <h4 className="text-[10px] font-bold uppercase tracking-[0.3em] text-muted-foreground opacity-50 ml-1">Catálogo de Proveedores (Nango + Indra)</h4>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Mezclamos los de Indra con los de Nango para mostrar el catálogo completo */}
          {Array.from(new Set([...INDRA_ADAPTERS, ...availableProviders.map(p => p.provider)])).map((providerName) => {
            const isIndraNative = INDRA_ADAPTERS.includes(providerName);
            const isNangoConfigured = availableProviders.some(p => p.provider === providerName);
            const isActive = activeConnections.some(c => c.type === providerName);
            
            return (
              <div 
                key={providerName}
                className={cn(
                  "group relative overflow-hidden rounded-2xl border p-6 transition-all duration-300",
                  "bg-card border-border hover:border-primary/40"
                )}
              >
                <div className="relative flex items-center justify-between mb-8">
                  <div className="flex items-center gap-4">
                    <div className="size-12 rounded-xl bg-muted flex items-center justify-center border border-border">
                      <Link2 className="size-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-bold text-base tracking-tighter text-foreground uppercase">
                        {providerName}
                      </p>
                      <div className="flex flex-col gap-0.5 mt-1">
                        <span className={cn("text-[8px] font-bold uppercase tracking-widest", isIndraNative ? "text-primary" : "text-amber-500")}>
                          {isIndraNative ? '✓ Adapter Nativo' : '⚠ Sin Adapter'}
                        </span>
                        <span className={cn("text-[8px] font-bold uppercase tracking-widest", isNangoConfigured ? "text-blue-500" : "text-zinc-500")}>
                          {isNangoConfigured ? '✓ Configurado en Nango' : '✗ Requiere Nango'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  {isNangoConfigured && !isActive && (
                    <button
                      onClick={() => handleAuthorization(providerName)}
                      disabled={!!isProcessing}
                      className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-[9px] font-bold uppercase tracking-widest transition-all bg-primary text-primary-foreground hover:opacity-90"
                    >
                      {isProcessing === providerName ? <Loader2 className="size-4 animate-spin" /> : 'Autorizar Conexión (OAuth)'}
                    </button>
                  )}
                  
                  {!isNangoConfigured && (
                    <button
                      onClick={() => window.open('https://app.nango.dev', '_blank')}
                      className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-[9px] font-bold uppercase tracking-widest transition-all bg-muted text-muted-foreground hover:bg-muted/80"
                    >
                      Configurar en Nango
                    </button>
                  )}
                  
                  {isActive && (
                     <div className="w-full text-center py-3 text-[9px] font-bold uppercase tracking-widest text-emerald-600 bg-emerald-500/10 rounded-xl">
                       Ya Autorizado
                     </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}
