/**
 * 🗂️ ARTEFACTO: ProviderEntityRow.tsx
 * ────────────
 * CAPA: UI / Widgets (Capability Projector)
 * VERSIÓN: 1.7.0
 * COMMIT: P3-M2.3-UI-WIDGET-REFAC-HOOK
 * 
 * 🎯 FUNCTIONAL_SCOPE:
 * - Proyectar visualmente las capacidades de un nodo de infraestructura (Storage, DB, API).
 * - Proveer interfaces de operación: [Auth, Exploración de Inventario, Ejecución de Métodos].
 * - Gestionar el ciclo de vida visual de una conexión (Conectar, Reparar, Desconectar).
 * 
 * 🛡️ AXIOMATIC_CONTRACT:
 * - MUST: Descubrir y mostrar UI basada estrictamente en 'manifest.capabilities'.
 * - NEVER: Gestionar lógica de fetch local para el inventario; delegar SIEMPRE al hook 'useInventory'.
 * - NEVER: Mezclar lógica de transporte; usar los métodos del hook de acciones suministrado.
 * - ALWAYS: Proyectar el 'Inventory Operator' (Upload) si el nodo tiene capacidad de inyección.
 * 
 * 📜 ARCH_DECISION: Se transiciona de un modelo híbrido a uno de 'Consumo Puro' donde el widget es solo una shell visual que reacciona al estado del hook de inventario global.
 * 
 * 🔑 KEYWORDS: #CapabilityProjector #InfrastructureNode #DynamicUI #AgnosticForm
 * 🔗 RELATIONSHIPS: [AgnosticConsoleShell, useInventory, SchemaManager, PortCreator]
 */

import { useState, useEffect } from 'react';
import { 
  ChevronDown, 
  Link2, 
  Loader2, 
  Key, 
  Database, 
  HardDrive, 
  FileJson, 
  Cloud, 
  Activity, 
  Terminal,
  Eye,
  Settings2,
  Trash2,
  RefreshCw,
  LayoutGrid,
  Search,
  UploadCloud
} from 'lucide-react';
import { AgnosticDropzone } from '@/components/ui/agnostic-dropzone';
import { TelemetryHUD } from '@/components/ingestion/telemetry-hud';
import { useIngestionOrchestrator } from '@/hooks/use-ingestion-orchestrator';
import { cn } from '@/lib/utils';
import { ProviderManifest, Connection } from '../integration_types';
import { SchemaManager } from '@/components/schema-manager';
import { useInventory } from '@/hooks/use-inventory';
import { AgnosticTree } from '@/components/ui/agnostic-tree';

interface ProviderEntityRowProps {
  manifest: ProviderManifest;
  isNangoConfigured: boolean;
  activeConnection?: Connection;
  isProcessing: boolean;
  localPathValue: string;
  onSetLocalPath: (path: string) => void;
  onAuthorize: (id: string) => void;
  onMountLocal: (id: string, path: string) => void;
  onDisconnect?: (id: string) => void;
  refreshData: () => void;
}

const getIcon = (iconName: string) => {
  switch (iconName) {
    case 'Cloud': return <Cloud className="size-5" />;
    case 'Database': return <Database className="size-5" />;
    case 'Table': return <Database className="size-5" />;
    case 'HardDrive': return <HardDrive className="size-5" />;
    case 'FileJson': return <FileJson className="size-5" />;
    default: return <Link2 className="size-5" />;
  }
};

export function ProviderEntityRow({
  manifest,
  isNangoConfigured,
  activeConnection,
  isProcessing,
  localPathValue,
  onSetLocalPath,
  onAuthorize,
  onMountLocal,
  onDisconnect,
  refreshData
}: ProviderEntityRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<'auth' | 'view' | 'execute'>('auth');
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const isActive = !!activeConnection;

  const { 
    items: filteredInventory, 
    isLoading: isHydrating, 
    refresh: hydrateInventory,
    searchQuery,
    setSearchQuery
  } = useInventory(isActive ? activeConnection.id : undefined);

  const { processQueue, status: uploadStatus, telemetry } = useIngestionOrchestrator(activeConnection?.id || '');

  const addLog = (msg: string) => {
    setTerminalLogs(prev => [...prev.slice(-4), `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  const executeAction = async (action: string) => {
    if (!activeConnection || isExecuting) return;
    setIsExecuting(true);
    addLog(`Executing ${action.toUpperCase()}...`);
    try {
      const res = await fetch(`/api/integrations/${activeConnection.id}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });
      const data = await res.json();
      addLog(data.message || data.error);
    } catch (err) {
      addLog(`Error: Action failed.`);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleImmediateIngestion = async () => {
    if (!activeConnection || selectedFiles.length === 0) return;
    addLog(`Initiating sovereign ingestion via unified orchestrator...`);
    
    try {
      // Reutilizamos la misma lógica de cola que el portal público
      await processQueue(selectedFiles, { targetPath: '/' }); 
      addLog(`Success: Assets injected into ${manifest.label}`);
      setSelectedFiles([]);
    } catch (err) {
      addLog(`Error: Ingestion failed at domain level.`);
    }
  };

  return (
    <div className={cn(
      "group relative flex flex-col rounded-xl border transition-all duration-300",
      isExpanded ? "bg-card border-primary/40 shadow-sm" : "bg-card/40 border-border hover:border-border-strong",
      isActive && !isExpanded && "border-emerald-500/20"
    )}>
      
      {/* ROW HEADER: MINIMAL STATE */}
      <div 
        className="flex items-center justify-between px-6 py-4 cursor-pointer select-none"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-6">
          <div className={cn(
            "size-10 rounded-lg flex items-center justify-center border transition-colors",
            isActive ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600" : "bg-muted border-border text-muted-foreground"
          )}>
            {getIcon(manifest.icon)}
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-bold tracking-tight text-foreground uppercase flex items-center gap-2">
              {manifest.label}
              {isActive && <span className="text-[10px] lowercase font-mono text-emerald-500 bg-emerald-500/5 px-1.5 py-0.5 rounded border border-emerald-500/10">Active</span>}
            </span>
            <span className="text-[9px] text-muted-foreground uppercase tracking-widest opacity-50">{manifest.id}</span>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="hidden md:flex gap-4">
             {manifest.capabilities.map(cap => (
                <span key={cap} className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground/60 border-l border-border pl-3">
                  {cap.replace('_', ' ')}
                </span>
              ))}
          </div>
          <ChevronDown className={cn(
            "size-4 text-muted-foreground transition-transform duration-300",
            isExpanded ? "rotate-180" : ""
          )} />
        </div>
      </div>

      {/* EXPANDABLE BODY: THE MICRO-OPERATOR */}
      <div className={cn(
        "overflow-hidden transition-all duration-300",
        isExpanded ? "max-h-[2600px] opacity-100" : "max-h-0 opacity-0"
      )}>
        <div className="px-6 pb-6 pt-2 border-t border-border/50">
          
          {/* SUB-TABS (Fichas A, B, C) */}
          <div className="flex gap-6 border-b border-border mb-6">
            <button 
              onClick={() => setActiveSubTab('auth')}
              className={cn(
                "pb-3 text-[9px] font-bold uppercase tracking-widest border-b-2 transition-all",
                activeSubTab === 'auth' ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              [A] Configuration
            </button>
            <button 
              onClick={() => setActiveSubTab('view')}
              className={cn(
                "pb-3 text-[9px] font-bold uppercase tracking-widest border-b-2 transition-all",
                activeSubTab === 'view' ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              [B] Projection & Schema
            </button>
            <button 
              onClick={() => setActiveSubTab('execute')}
              className={cn(
                "pb-3 text-[9px] font-bold uppercase tracking-widest border-b-2 transition-all",
                activeSubTab === 'execute' ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              [C] Execution Terminal
            </button>
          </div>

          <div className="animate-in fade-in slide-in-from-top-1 duration-300">
            
            {/* FICHA A: CONFIGURATION / AUTH */}
            {activeSubTab === 'auth' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 py-4">
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Key className="size-3 text-primary" />
                    <h5 className="text-[10px] font-bold uppercase tracking-widest">Credentials Binding</h5>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {manifest.description}
                  </p>
                  <div className="flex gap-2">
                    {manifest.capabilities.map(cap => (
                      <span key={cap} className="px-1.5 py-0.5 bg-muted rounded text-[8px] font-mono border border-border">
                        {cap}
                      </span>
                    ))}
                  </div>

                  {/* PROJECT MEMORY (New!) */}
                  {isActive && <IngestionPortList connectionId={activeConnection.id} />}
                </div>

                <div className="bg-muted/30 p-5 rounded-xl border border-border space-y-4">
                   {manifest.configType === 'oauth' ? (
                      <div className="space-y-4">
                        {!isNangoConfigured ? (
                          <div className="space-y-3">
                            <p className="text-[10px] text-muted-foreground italic">Client ID missing in sovereign bouncer (Nango).</p>
                            <button
                              onClick={() => window.open('https://app.nango.dev', '_blank')}
                              className="w-full flex items-center justify-center gap-2 rounded-lg py-2.5 text-[9px] font-bold uppercase tracking-widest bg-muted text-foreground border border-border hover:bg-muted/80 transition-all"
                            >
                              Configure OAuth Client (Nango)
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <p className="text-[10px] text-emerald-600/80 font-bold uppercase tracking-widest">✓ Infrastructure Provisioned</p>
                            {!isActive ? (
                              <button
                                onClick={() => onAuthorize(manifest.id)}
                                disabled={isProcessing}
                                className="w-full flex items-center justify-center gap-2 rounded-lg py-3 text-[9px] font-bold uppercase tracking-widest bg-primary text-primary-foreground hover:opacity-90 transition-all"
                              >
                                {isProcessing ? <Loader2 className="size-4 animate-spin" /> : 'Authorize Connection'}
                              </button>
                            ) : (
                              <div className="space-y-4">
                                <div className="w-full text-center py-3 text-[9px] font-bold uppercase tracking-widest text-emerald-600 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                                  Connection Alive
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                   <button
                                     onClick={() => onAuthorize(manifest.id)}
                                     disabled={isProcessing}
                                     className="flex items-center justify-center gap-2 rounded-lg py-2 text-[8px] font-bold uppercase tracking-widest bg-muted text-foreground border border-border hover:bg-muted/80 transition-all"
                                   >
                                     <RefreshCw className={cn("size-3", isProcessing && "animate-spin")} />
                                     Repair
                                   </button>
                                   <button
                                     onClick={() => onDisconnect && onDisconnect(activeConnection.id)}
                                     disabled={isProcessing}
                                     className="flex items-center justify-center gap-2 rounded-lg py-2 text-[8px] font-bold uppercase tracking-widest bg-red-500/10 text-red-600 border border-red-500/20 hover:bg-red-500/20 transition-all"
                                   >
                                     <Trash2 className="size-3" />
                                     Disconnect
                                   </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                   ) : (
                      <div className="space-y-4">
                         <p className="text-[10px] text-muted-foreground">Define absolute host directory for volume mounting.</p>
                         <input 
                            type="text" 
                            placeholder="/mnt/indra/data/vault" 
                            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs font-mono"
                            value={isActive ? '/var/lib/indra/data' : localPathValue}
                            onChange={(e) => onSetLocalPath(e.target.value)}
                            disabled={isActive || isProcessing}
                          />
                          <button
                            onClick={() => onMountLocal(manifest.id, localPathValue)}
                            disabled={isActive || isProcessing || !localPathValue}
                            className="w-full flex items-center justify-center gap-2 rounded-lg py-3 text-[9px] font-bold uppercase tracking-widest bg-primary text-primary-foreground hover:opacity-90 transition-all disabled:opacity-50"
                          >
                            {isProcessing ? <Loader2 className="size-4 animate-spin" /> : isActive ? 'Volume Mounted' : 'Mount Storage Volume'}
                          </button>
                      </div>
                   )}
                </div>
              </div>
            )}

            {/* FICHA B: PROJECTION & SCHEMA */}
            {activeSubTab === 'view' && (
              <div className="space-y-6 py-4">
                {!isActive ? (
                  <div className="flex flex-col items-center justify-center p-12 bg-muted/20 rounded-xl border border-dashed border-border text-muted-foreground">
                    <Eye className="size-6 mb-2 opacity-20" />
                    <p className="text-[10px] font-bold uppercase tracking-widest">Connect provider to project capabilities</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {/* AGNOSTIC INVENTORY PROJECTION */}
                    <div className="md:col-span-3 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <LayoutGrid className="size-3 text-primary" />
                          <h5 className="text-[10px] font-bold uppercase tracking-widest text-primary">Infrastructure Discovery (Fractal)</h5>
                        </div>
                        <button 
                          onClick={() => hydrateInventory()} 
                          className="p-1 hover:bg-muted rounded-md transition-colors"
                        >
                          <RefreshCw className={cn("size-3", isHydrating && "animate-spin")} />
                        </button>
                      </div>

                      

                      <AgnosticTree 
                        integrationId={activeConnection.id}
                        onSelect={(atom) => addLog(`Selected: ${atom.name} (${atom.id})`)}
                        className="h-[500px]"
                      />

                      <div className="flex items-center gap-4 px-3 py-2 bg-muted/20 border border-border rounded-lg">
                        <span className="text-[8px] font-bold uppercase tracking-widest opacity-40">Status:</span>
                        <span className="text-[8px] font-mono text-primary animate-pulse">Fractal Bridge Active</span>
                      </div>
                    </div>
                    
                    {/* SCHEMA MANAGER & INGESTION */}
                    <div className="md:col-span-3 flex flex-col gap-6">
                      
                      {/* UNIFIED INGESTION OPERATOR (AgnosticDropzone) */}
                      {manifest.capabilities.includes('file_upload') && (
                        <div className="space-y-4 animate-in slide-in-from-top-4 duration-500">
                          <div className="flex items-center gap-2">
                            <UploadCloud className="size-3 text-primary" />
                            <h5 className="text-[10px] font-bold uppercase tracking-widest text-primary">Immediate Ingestion Operator</h5>
                          </div>
                          <AgnosticDropzone 
                            onFilesAdded={(files) => setSelectedFiles(prev => [...prev, ...files])}
                            files={selectedFiles}
                            onRemoveFile={(idx) => setSelectedFiles(prev => prev.filter((_, i) => i !== idx))}
                            className="h-32 rounded-2xl"
                          />

                          <TelemetryHUD 
                            telemetry={telemetry}
                            status={uploadStatus}
                            fileName={selectedFiles[telemetry.currentFileIndex]?.name || ''}
                          />

                          {selectedFiles.length > 0 && uploadStatus === 'idle' && (
                            <button 
                              onClick={handleImmediateIngestion}
                              className="w-full py-2.5 bg-primary text-primary-foreground rounded-xl text-[10px] font-bold uppercase tracking-widest hover:opacity-90 transition-all shadow-sm"
                            >
                              Inject {selectedFiles.length} Assets into {manifest.label}
                            </button>
                          )}
                        </div>
                      )}

                      <div className="flex flex-col gap-4">
                        <div className="flex items-center gap-2">
                          <Settings2 className="size-3 text-primary" />
                          <h5 className="text-[10px] font-bold uppercase tracking-widest">Data Schema Blueprint</h5>
                        </div>
                        <div className="bg-muted/10 p-5 rounded-xl border border-border h-full">
                          <SchemaManager 
                            integrationId={activeConnection.id}
                            currentSchema={activeConnection.dynamicSchema || []}
                            onUpdate={refreshData}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* FICHA C: EXECUTION TERMINAL */}
            {activeSubTab === 'execute' && (
              <div className="space-y-6 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Terminal className="size-3 text-primary" />
                    <h5 className="text-[10px] font-bold uppercase tracking-widest">Method Executor</h5>
                  </div>
                  <div className="flex gap-2">
                    <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[9px] font-mono text-muted-foreground uppercase">Runtime Ready</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {/* Action Bento Box */}
                  <button 
                    onClick={() => executeAction('health_check')}
                    disabled={isExecuting || !isActive}
                    className="flex flex-col items-center justify-center gap-3 p-6 rounded-xl bg-muted/20 border border-border hover:bg-muted/40 hover:border-primary/20 transition-all group disabled:opacity-50"
                  >
                    <Activity className="size-5 text-muted-foreground group-hover:text-primary transition-colors" />
                    <span className="text-[9px] font-bold uppercase tracking-widest">Health Check</span>
                  </button>
                  
                  <button 
                    onClick={() => executeAction('force_sync')}
                    disabled={isExecuting || !isActive}
                    className="flex flex-col items-center justify-center gap-3 p-6 rounded-xl bg-muted/20 border border-border hover:bg-muted/40 hover:border-primary/20 transition-all group disabled:opacity-50"
                  >
                    <RefreshCw className="size-5 text-muted-foreground group-hover:text-primary transition-colors" />
                    <span className="text-[9px] font-bold uppercase tracking-widest">Force Sync</span>
                  </button>

                  <button className="flex flex-col items-center justify-center gap-3 p-6 rounded-xl bg-muted/20 border border-border hover:bg-muted/40 hover:border-primary/20 transition-all group opacity-50 grayscale cursor-not-allowed">
                    <Database className="size-5 text-muted-foreground" />
                    <span className="text-[9px] font-bold uppercase tracking-widest">Wipe Data</span>
                  </button>

                  <button 
                    onClick={() => executeAction('purge_cache')}
                    disabled={isExecuting || !isActive}
                    className="flex flex-col items-center justify-center gap-3 p-6 rounded-xl bg-muted/20 border border-border hover:bg-muted/40 hover:border-destructive transition-all group disabled:opacity-50"
                  >
                    <Trash2 className="size-5 text-muted-foreground group-hover:text-destructive transition-colors" />
                    <span className="text-[9px] font-bold uppercase tracking-widest">Purge Cache</span>
                  </button>
                </div>

                {/* Output Console simulation */}
                <div className="bg-zinc-950 rounded-lg p-4 font-mono text-[10px] text-emerald-500 overflow-hidden border border-border shadow-inner min-h-[100px]">
                   <p className="opacity-50 mb-1"># Indra Runtime Environment - {manifest.id}</p>
                   {terminalLogs.length === 0 && <p className="opacity-30">Waiting for instructions...</p>}
                   {terminalLogs.map((log, i) => (
                     <p key={i} className="animate-in slide-in-from-left-1 duration-200">{log}</p>
                   ))}
                   {isExecuting && (
                     <div className="flex gap-1 animate-pulse mt-1">
                        <span className="w-2 h-4 bg-emerald-500" />
                     </div>
                   )}
                </div>
              </div>
            )}

          </div>

        </div>
      </div>
    </div>
  );
}
