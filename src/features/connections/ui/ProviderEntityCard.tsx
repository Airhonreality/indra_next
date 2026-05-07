import { useState } from 'react';
import { ChevronDown, Link2, Loader2, Key, Database, HardDrive, FileJson, Cloud } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ProviderManifest, Connection } from '../integration_types';

interface ProviderEntityCardProps {
  manifest: ProviderManifest;
  isNangoConfigured: boolean;
  activeConnection?: Connection;
  isProcessing: boolean;
  localPathValue: string;
  onSetLocalPath: (path: string) => void;
  onAuthorize: (id: string) => void;
  onMountLocal: (id: string, path: string) => void;
  onOpenSchemaManager: (id: string) => void;
  isSchemaManagerOpen: boolean;
}

const getIcon = (iconName: string) => {
  switch (iconName) {
    case 'Cloud': return <Cloud className="size-5 text-muted-foreground" />;
    case 'Database': return <Database className="size-5 text-muted-foreground" />;
    case 'Table': return <Database className="size-5 text-muted-foreground" />;
    case 'HardDrive': return <HardDrive className="size-5 text-muted-foreground" />;
    case 'FileJson': return <FileJson className="size-5 text-muted-foreground" />;
    default: return <Link2 className="size-5 text-muted-foreground" />;
  }
};

export function ProviderEntityCard({
  manifest,
  isNangoConfigured,
  activeConnection,
  isProcessing,
  localPathValue,
  onSetLocalPath,
  onAuthorize,
  onMountLocal,
  onOpenSchemaManager,
  isSchemaManagerOpen
}: ProviderEntityCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isActive = !!activeConnection;

  return (
    <div className={cn(
      "group relative flex flex-col rounded-2xl border transition-all duration-300 bg-card",
      isExpanded ? "border-primary/40 shadow-md" : "border-border hover:border-primary/20",
      isActive && !isExpanded && "border-emerald-500/30"
    )}>
      {/* HEADER: Schema 1 (Superficie) */}
      <div 
        className="relative flex items-center justify-between p-6 cursor-pointer select-none"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-4">
          <div className={cn(
            "size-12 rounded-xl flex items-center justify-center border",
            isActive ? "bg-emerald-500/10 border-emerald-500/20" : "bg-muted border-border"
          )}>
            {getIcon(manifest.icon)}
          </div>
          <div>
            <p className="font-bold text-base tracking-tighter text-foreground uppercase flex items-center gap-2">
              {manifest.label}
              {isActive && <span className="size-1.5 rounded-full bg-emerald-500" />}
            </p>
            <div className="flex gap-2 mt-1">
              <span className="text-[8px] font-bold uppercase tracking-widest text-primary">
                {manifest.configType === 'oauth' ? 'OAuth API' : 'Local Node'}
              </span>
              {manifest.configType === 'oauth' && (
                <span className={cn("text-[8px] font-bold uppercase tracking-widest", isNangoConfigured ? "text-blue-500" : "text-zinc-500")}>
                  {isNangoConfigured ? '✓ OAuth Configured' : '✗ Missing OAuth Config'}
                </span>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <ChevronDown className={cn(
            "size-5 text-muted-foreground transition-transform duration-300",
            isExpanded ? "rotate-180" : ""
          )} />
        </div>
      </div>

      {/* EXPANDABLE AREA: Schema 2 (Affordances & Config) */}
      <div className={cn(
        "overflow-hidden transition-all duration-500 ease-in-out",
        isExpanded ? "max-h-[800px] opacity-100" : "max-h-0 opacity-0"
      )}>
        <div className="p-6 pt-0 border-t border-border mt-2 space-y-6">
          
          {/* Affordances / Capacidades */}
          <div className="space-y-2">
            <h5 className="text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Provider Capabilities</h5>
            <p className="text-xs text-muted-foreground">{manifest.description}</p>
            <div className="flex gap-2 mt-2">
              {manifest.capabilities.map(cap => (
                <span key={cap} className="px-2 py-1 bg-muted rounded-md text-[9px] font-mono text-foreground border border-border">
                  {cap}
                </span>
              ))}
            </div>
          </div>

          {/* Configuración / Acciones */}
          <div className="space-y-2 bg-muted/30 p-4 rounded-xl border border-border">
            <h5 className="text-[9px] font-bold uppercase tracking-[0.2em] text-foreground flex items-center gap-2 mb-4">
              <Key className="size-3" />
              Provider Configuration
            </h5>

            {/* RUTAS LÓGICAS SEGÚN TIPO DE CONFIGURACIÓN */}
            
            {/* 1. OAUTH (NANGO) */}
            {manifest.configType === 'oauth' && (
              <div className="space-y-3">
                {!isNangoConfigured && (
                  <div className="flex flex-col gap-2">
                    <p className="text-[10px] text-muted-foreground">This provider requires OAuth client credentials to be provisioned.</p>
                    <button
                      onClick={() => window.open('https://app.nango.dev', '_blank')}
                      className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-[9px] font-bold uppercase tracking-widest bg-muted text-foreground border border-border hover:bg-muted/80 transition-all"
                    >
                      Configure OAuth Client (Nango Console)
                    </button>
                  </div>
                )}
                
                {isNangoConfigured && !isActive && (
                  <button
                    onClick={() => onAuthorize(manifest.id)}
                    disabled={isProcessing}
                    className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-[9px] font-bold uppercase tracking-widest bg-primary text-primary-foreground hover:opacity-90 transition-all"
                  >
                    {isProcessing ? <Loader2 className="size-4 animate-spin" /> : 'Authenticate Request (OAuth)'}
                  </button>
                )}

                {isActive && (
                  <div className="w-full text-center py-3 text-[9px] font-bold uppercase tracking-widest text-emerald-600 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
                    Active OAuth Connection
                  </div>
                )}
              </div>
            )}

            {/* 2. LOCAL PATH (STORAGE / JSON) */}
            {manifest.configType === 'local_path' && (
              <div className="space-y-3">
                <p className="text-[10px] text-muted-foreground">Local node requires an absolute host path for volume mounting.</p>
                <input 
                  type="text" 
                  placeholder="e.g. /mnt/data/vault/ or C:/storage/" 
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs font-mono"
                  value={isActive ? '/var/lib/indra/data' : localPathValue}
                  onChange={(e) => onSetLocalPath(e.target.value)}
                  disabled={isActive || isProcessing}
                />
                <button
                  onClick={() => onMountLocal(manifest.id, localPathValue)}
                  disabled={isActive || isProcessing || !localPathValue}
                  className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-[9px] font-bold uppercase tracking-widest bg-primary text-primary-foreground hover:opacity-90 transition-all disabled:opacity-50"
                >
                  {isProcessing ? <Loader2 className="size-4 animate-spin" /> : isActive ? 'Volume Mounted' : 'Mount Storage Volume'}
                </button>
              </div>
            )}

            {/* GESTIÓN DE ESQUEMA (Si está activo) */}
            {isActive && (
              <div className="mt-4 pt-4 border-t border-border">
                <button
                  onClick={() => onOpenSchemaManager(activeConnection.id)}
                  className="w-full py-2 flex items-center justify-center gap-2 rounded-xl bg-transparent text-primary border border-primary/20 hover:bg-primary/5 text-[9px] font-bold uppercase tracking-widest transition-all"
                >
                  <Database className="size-3" />
                  {isSchemaManagerOpen ? 'Close Schema' : 'Manage Data Schema'}
                </button>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
