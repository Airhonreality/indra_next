/**
 * 🚪 ARTEFACTO: page.tsx (PublicPortalPage)
 * ────────────
 * CAPA: UI / Routes (Public Ingestion Gateway)
 * VERSIÓN: 1.4.0
 * COMMIT: P3-M6.1-ARCHITECTURAL-CLEANUP
 * 
 * 🎯 FUNCTIONAL_SCOPE:
 * - Punto de entrada público/privado para la ingesta de datos y archivos (SME).
 * - Orquestación de componentes de alto nivel (Formularios, Dropzone, Telemetría).
 * - Gateway de acceso soberano basado en 'slug' de Port.
 * 
 * 🛡️ AXIOMATIC_CONTRACT:
 * - MUST: Ser un artefacto de composición, delegando lógica de dominio a Hooks especializados.
 * - NEVER: Implementar lógica de red o hardware directamente (Aislamiento de Capas).
 * - ALWAYS: Validar el estado del 'Port' antes de proyectar la interfaz.
 * 
 * 📜 ARCH_DECISION: Se desmiembra el motor de ingesta y la gestión de hardware (Wake Lock) 
 * hacia hooks independientes para cumplir con el principio de responsabilidad única de Indra.
 * 
 * 🔑 KEYWORDS: #PublicGateway #ComponentComposition #LayerIsolation #SME
 * 🔗 RELATIONSHIPS: [useIngestionOrchestrator, useWakeLock, TelemetryHUD, AgnosticDropzone]
 */

'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { DataPortalPreview } from '@/components/data-portal-preview';
import { AgnosticDropzone } from '@/components/ui/agnostic-dropzone';
import { TelemetryHUD } from '@/components/ingestion/telemetry-hud';
import { useIngestionOrchestrator } from '@/hooks/use-ingestion-orchestrator';
import { useWakeLock } from '@/hooks/use-wake-lock';
import { i18n } from '@/lib/i18n';
import { Loader2, ShieldCheck, CheckCircle2 } from 'lucide-react';

export default function PublicPortalPage() {
  const { slug } = useParams() as { slug: string };
  const [port, setPort] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  
  // Logic Orchestration (Decoupled)
  const { processQueue, status, telemetry } = useIngestionOrchestrator(slug);
  const wakeLock = useWakeLock();

  useEffect(() => {
    fetch(`/api/p/${slug}`)
      .then(res => res.json())
      .then(data => {
        if (data.port) setPort(data.port);
        setLoading(false);
      });
  }, [slug]);

  const handleStartIngestion = async (formData: any) => {
    if (selectedFiles.length === 0) return;
    
    try {
      await wakeLock.request();
      await processQueue(selectedFiles, formData);
    } catch (err) {
      console.error('[Portal Error]', err);
    } finally {
      wakeLock.release();
    }
  };

  if (loading) return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="size-8 animate-spin text-primary" /></div>;
  if (!port) return <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground font-bold uppercase tracking-widest">404 // Portal no encontrado</div>;

  return (
    <div className="min-h-screen bg-background text-foreground p-6 flex flex-col items-center custom-scrollbar">
      {/* HEADER: Sovereign Identity */}
      <header className="w-full max-w-2xl flex items-center justify-between py-12">
        <div className="flex items-center gap-3">
          <div className="size-10 bg-primary/10 border border-primary/20 rounded-xl flex items-center justify-center">
            <ShieldCheck className="size-5 text-primary" />
          </div>
          <h1 className="text-xl font-bold tracking-tighter uppercase">{port.label}</h1>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Secure Transfer</span>
          <span className="text-[8px] font-mono opacity-40 uppercase tracking-tighter">Sovereign Gateway v1.4.0</span>
        </div>
      </header>

      <main className="w-full max-w-2xl bg-card border border-border rounded-[2.5rem] shadow-sm p-12 space-y-12 relative overflow-hidden">
        {status === 'success' ? (
          <div className="py-20 flex flex-col items-center justify-center text-center space-y-6 animate-in zoom-in-95 duration-500">
            <div className="size-24 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <CheckCircle2 className="size-12 text-emerald-500" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold tracking-tighter">Misión Completada</h2>
              <p className="text-sm text-muted-foreground italic">{selectedFiles.length} activos procesados exitosamente.</p>
            </div>
            <button onClick={() => window.location.reload()} className="px-6 py-2 rounded-xl bg-muted border border-border text-[10px] font-bold uppercase tracking-widest hover:bg-muted/80 transition-colors">Nueva Sesión</button>
          </div>
        ) : (
          <>
            <div className="space-y-4 text-center">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-[10px] font-bold uppercase tracking-widest text-primary">Portal Activo</div>
              <h2 className="text-3xl font-bold tracking-tighter leading-none">Depósito de Activos</h2>
              <p className="text-sm text-muted-foreground italic">Infraestructura blindada para cargas pesadas y transcodificación distribuida.</p>
            </div>

            <AgnosticDropzone 
              onFilesAdded={(files) => setSelectedFiles(prev => [...prev, ...files])} 
              files={selectedFiles} 
              onRemoveFile={(idx) => setSelectedFiles(prev => prev.filter((_, i) => i !== idx))} 
              isUploading={status !== 'idle'} 
            />

            <DataPortalPreview 
              schema={port.schema} 
              onValidate={handleStartIngestion} 
              actionLabel={selectedFiles.length > 1 ? `Procesar ${selectedFiles.length} Activos` : "Procesar Ingesta"} 
              isDisabled={status !== 'idle' || selectedFiles.length === 0} 
            />

            <TelemetryHUD 
              telemetry={telemetry} 
              status={status} 
              fileName={selectedFiles[telemetry.currentFileIndex]?.name || ''} 
            />

            <div className="pt-8 border-t border-border flex flex-col items-center gap-4">
              <div className="flex items-center gap-2 opacity-40">
                <ShieldCheck className="size-4 text-primary" />
                <span className="text-[10px] font-bold uppercase tracking-[0.3em]">Encrypted End-to-End Tunnel</span>
              </div>
            </div>
          </>
        )}
      </main>

      <footer className="mt-20 text-[9px] font-bold uppercase tracking-[0.4em] text-muted-foreground opacity-50">
        Powered by Indra NEXT Infrastructure // Sovereign Core
      </footer>
    </div>
  );
}
