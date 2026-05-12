/**
 * 🚪 ARTEFACTO: page.tsx (PublicPortalPage)
 * ────────────
 * CAPA: UI / Routes (Public Ingestion Gateway)
 * VERSIÓN: 1.5.0
 * COMMIT: P3-M7.0-AXIOMATIC-DECOUPLING
 * 
 * 🎯 FUNCTIONAL_SCOPE:
 * - Punto de entrada público para la ingesta soberana de activos (SME).
 * - Orquestador de composición de alto nivel para el portal de ingesta.
 * - Resolución y validación del estado del Port mediante 'slug'.
 * 
 * 🛡️ AXIOMATIC_CONTRACT:
 * - MUST: Delegar toda la lógica de hardware y red a Hooks especializados (Axioma de Independencia).
 * - NEVER: Almacenar estado de infraestructura o lógica de streaming en este nivel.
 * - ALWAYS: Proporcionar una interfaz de marca blanca resiliente y segura.
 * 
 * 📜 ARCH_DECISION: Se aplica el Diseño Axiomático de Nam P Suh para eliminar el acoplamiento 
 * entre la ruta (Gateway) y el motor de ingesta, resultando en un código 100% declarativo.
 */

'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { DataPortalPreview } from '@/components/data-portal-preview';
import { AgnosticDropzone } from '@/components/ui/agnostic-dropzone';
import { TelemetryHUD } from '@/components/ingestion/telemetry-hud';
import { useIngestionOrchestrator } from '@/hooks/use-ingestion-orchestrator';
import { useWakeLock } from '@/hooks/use-wake-lock';
import { Loader2, ShieldCheck, CheckCircle2 } from 'lucide-react';

export default function PublicPortalPage() {
  const { slug } = useParams() as { slug: string };
  const [port, setPort] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  
  // Decoupled Orchestration Layers
  const { processQueue, reset, status, telemetry } = useIngestionOrchestrator(slug);
  const systemWakeLock = useWakeLock();

  useEffect(() => {
    fetch(`/api/p/${slug}`)
      .then(res => res.json())
      .then(data => {
        if (data.port) setPort(data.port);
        setLoading(false);
      });
  }, [slug]);

  /**
   * 🛡️ Sovereign Ingestion Handler
   * Orchestrates the hardware and network layers before starting the transfer.
   */
  const handleStartIngestion = async (formData: any) => {
    if (selectedFiles.length === 0) return;
    
    try {
      await systemWakeLock.request();
      await processQueue(selectedFiles, formData);
    } catch (err) {
      console.error('[Ingestion Failure]', err);
      // Errors are handled internally by the orchestrator (status: 'error')
    } finally {
      systemWakeLock.release();
    }
  };

  const handleReset = () => {
    setSelectedFiles([]);
    reset();
  };

  if (loading) return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="size-8 animate-spin text-primary" /></div>;
  if (!port) return <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground font-bold uppercase tracking-widest">404 // Port Inexistente</div>;

  return (
    <div className="min-h-screen bg-background text-foreground p-6 flex flex-col items-center custom-scrollbar">
      {/* BRAND HEADER */}
      <header className="w-full max-w-2xl flex items-center justify-between py-12">
        <div className="flex items-center gap-3">
          <div className="size-10 bg-primary/10 border border-primary/20 rounded-xl flex items-center justify-center">
            <ShieldCheck className="size-5 text-primary" />
          </div>
          <h1 className="text-xl font-bold tracking-tighter uppercase">{port.label}</h1>
        </div>
        <div className="flex flex-col items-end opacity-40">
          <span className="text-[10px] font-bold uppercase tracking-widest">Gateway Soberano</span>
          <span className="text-[8px] font-mono tracking-tighter">v1.5.0</span>
        </div>
      </header>

      <main className="w-full max-w-2xl bg-card border border-border rounded-[2.5rem] shadow-sm p-12 space-y-12 relative overflow-hidden">
        {status === 'success' ? (
          <div className="py-20 flex flex-col items-center justify-center text-center space-y-6 animate-in zoom-in-95 duration-500">
            <div className="size-24 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <CheckCircle2 className="size-12 text-emerald-500" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold tracking-tighter">Ingesta Finalizada</h2>
              <p className="text-sm text-muted-foreground italic">Los activos han sido transferidos soberanamente a la infraestructura de destino.</p>
            </div>
            <button 
              onClick={handleReset} 
              className="px-6 py-2 rounded-xl bg-muted border border-border text-[10px] font-bold uppercase tracking-widest hover:bg-muted/80 transition-colors"
            >
              Iniciar Nueva Sesión
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-4 text-center">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-[10px] font-bold uppercase tracking-widest text-primary">Status: Active</div>
              <h2 className="text-3xl font-bold tracking-tighter leading-none">Depósito de Activos Digitales</h2>
              <p className="text-sm text-muted-foreground italic">Completa el formulario y selecciona los archivos para procesar la ingesta.</p>
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
              actionLabel={selectedFiles.length > 1 ? `Procesar ${selectedFiles.length} Archivos` : "Procesar Ingesta"} 
              isDisabled={status !== 'idle' || selectedFiles.length === 0} 
            />

            <TelemetryHUD 
              telemetry={telemetry} 
              status={status} 
              fileName={selectedFiles[telemetry.currentFileIndex]?.name || ''} 
            />

            <div className="pt-8 border-t border-border flex items-center justify-center opacity-40">
              <ShieldCheck className="size-4 text-primary mr-2" />
              <span className="text-[10px] font-bold uppercase tracking-[0.3em]">End-to-End Encryption Tunnel</span>
            </div>
          </>
        )}
      </main>

      <footer className="mt-20 text-[9px] font-bold uppercase tracking-[0.4em] text-muted-foreground opacity-30">
        Indra NEXT // Ingestion Orchestrator v1.5.0
      </footer>
    </div>
  );
}
