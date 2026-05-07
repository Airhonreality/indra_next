'use client';

import { useState } from 'react';
import { Shield, Loader2 } from 'lucide-react';
import { i18n } from '@/lib/i18n';
import { SchemaManager } from '@/components/schema-manager';
import { useIntegrationState } from '../logic/useIntegrationState';
import { ProviderEntityCard } from './ProviderEntityCard';
import { IntegrationMetricsGrid } from './IntegrationMetricsGrid';

const t = i18n.es;

export function IntegrationOrchestrator() {
  const { 
    userId, 
    status, 
    loading, 
    isProcessing, 
    availableProviders, 
    activeConnections, 
    INDRA_ADAPTERS, 
    metrics, 
    actions 
  } = useIntegrationState();

  const [managingSchemaId, setManagingSchemaId] = useState<string | null>(null);

  if (status === 'loading' || loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 space-y-4">
        <Loader2 className="size-6 animate-spin text-primary" />
        <p className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">{t.common.loading}</p>
      </div>
    );
  }

  return (
    <div className="space-y-12 animate-in fade-in duration-500">
      {/* SECTION: User Account Info (Context) */}
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

      {/* SECTION: Metrics Grid (Schema 1 Header) */}
      <IntegrationMetricsGrid {...metrics} />

      {/* SECTION: The Unified Catalog (Schema 1 & 2) */}
      <div className="space-y-6 pt-8 border-t border-border">
        <div className="flex flex-col gap-1">
          <h4 className="text-[10px] font-bold uppercase tracking-[0.3em] text-muted-foreground opacity-50 ml-1">Catálogo Estructural de Proveedores</h4>
          <p className="text-xs text-muted-foreground ml-1">Expande cada entidad para revelar sus capacidades y afinar su configuración.</p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {INDRA_ADAPTERS.map(manifest => {
            const isNangoConfigured = availableProviders.some(p => p.provider === manifest.id);
            const activeConnection = activeConnections.find(c => c.type === manifest.id);

            return (
              <div key={manifest.id} className="flex flex-col">
                <ProviderEntityCard 
                  manifest={manifest}
                  isNangoConfigured={isNangoConfigured}
                  activeConnection={activeConnection}
                  isProcessing={isProcessing === manifest.id}
                  onAuthorize={actions.authorizeOAuth}
                  onOpenSchemaManager={(id) => setManagingSchemaId(managingSchemaId === id ? null : id)}
                  isSchemaManagerOpen={managingSchemaId === activeConnection?.id}
                />
                
                {/* Schema Manager Dropdown Area */}
                {managingSchemaId === activeConnection?.id && activeConnection && (
                  <div className="mt-2 bg-card border border-border rounded-xl p-4 animate-in slide-in-from-top-2 duration-300 shadow-xl z-10 relative">
                    <SchemaManager 
                      integrationId={activeConnection.id}
                      currentSchema={activeConnection.dynamicSchema || []}
                      onUpdate={actions.refreshData}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
