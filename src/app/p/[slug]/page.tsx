'use client';

/**
 * PUBLIC INGESTION PORTAL PAGE
 * Accessible via /p/[slug].
 * Renders a dynamic form and handles multi-part uploads to the target silo.
 */

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { DataPortalPreview } from '@/components/data-portal-preview';
import { i18n } from '@/lib/i18n';
import { Loader2, ShieldCheck, UploadCloud, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const t = i18n.es;

export default function PublicPortalPage() {
  const { slug } = useParams();
  const [port, setPort] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    fetch(`/api/p/${slug}`)
      .then(res => res.json())
      .then(data => {
        if (data.port) setPort(data.port);
        setLoading(false);
      });
  }, [slug]);

  const handleUpload = async (formData: any) => {
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = fileInput?.files?.[0];

    if (!file) {
      alert('Por favor selecciona un archivo');
      return;
    }

    setUploadStatus('uploading');
    setProgress(10);

    try {
      // 1. Negociar sesión con Indra
      const negRes = await fetch(`/api/p/${slug}/upload`, {
        method: 'POST',
        body: JSON.stringify({
          fileName: file.name,
          mimeType: file.type,
          fileSize: file.size
        })
      });
      const { uploadUrl, error } = await negRes.json();
      if (error) throw new Error(error);

      // 2. Subida directa al Silo (Google Drive) via Resumable URI
      // En una implementación real de producción, usaríamos XHR para rastrear progreso exacto
      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file
      });

      if (!uploadRes.ok) throw new Error('Fallo al subir el archivo al almacenamiento final');

      setProgress(100);
      setUploadStatus('success');
    } catch (err) {
      console.error(err);
      setUploadStatus('error');
      alert('Error: ' + (err as Error).message);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!port) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center text-zinc-500 font-bold uppercase tracking-widest">
        404 // Portal no encontrado
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-zinc-400 p-6 flex flex-col items-center">
      {/* HEADER DE MARCA BLANCA */}
      <header className="w-full max-w-2xl flex items-center justify-between py-12">
        <div className="flex items-center gap-3">
          <div className="size-10 bg-primary/10 border border-primary/20 rounded-xl flex items-center justify-center">
            <ShieldCheck className="size-5 text-primary" />
          </div>
          <h1 className="text-xl font-black text-white tracking-tighter uppercase">{port.label}</h1>
        </div>
        <span className="text-[10px] font-black uppercase tracking-widest text-zinc-600">Secure Transfer // Indra NEXT</span>
      </header>

      <main className="w-full max-w-2xl bg-white/[0.02] border border-white/5 rounded-[3rem] p-12 space-y-12">
        {uploadStatus === 'success' ? (
          <div className="py-20 flex flex-col items-center justify-center text-center space-y-6 animate-in zoom-in-95 duration-500">
            <div className="size-24 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <CheckCircle2 className="size-12 text-emerald-500" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-white tracking-tighter">Envío Completado</h2>
              <p className="text-sm text-zinc-500 italic">El archivo ha sido transferido soberanamente a la infraestructura de destino.</p>
            </div>
            <button 
              onClick={() => window.location.reload()}
              className="px-6 py-2 rounded-xl bg-white/5 border border-white/10 text-[10px] font-bold uppercase tracking-widest hover:bg-white/10 transition-colors"
            >
              Enviar otro archivo
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-4 text-center">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-[10px] font-black uppercase tracking-widest text-primary">
                Portal Activo
              </div>
              <h2 className="text-3xl font-bold text-white tracking-tighter">Depósito de Activos Digitales</h2>
              <p className="text-sm text-zinc-500">Completa el esquema de datos y selecciona el archivo para procesar la ingesta.</p>
            </div>

            <DataPortalPreview 
              schema={port.schema} 
              onValidate={handleUpload}
              actionLabel="Procesar Ingesta"
              isDisabled={uploadStatus === 'uploading'}
            />

            {uploadStatus === 'uploading' && (
              <div className="space-y-4 animate-in fade-in duration-300">
                <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-primary transition-all duration-1000 ease-out" 
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest text-zinc-600">
                  <div className="flex items-center gap-2">
                    <Loader2 className="size-3 animate-spin" />
                    Transfiriendo Datos...
                  </div>
                  <span>{progress}%</span>
                </div>
              </div>
            )}

            <div className="pt-8 border-t border-white/5 flex items-center justify-center gap-2">
              <UploadCloud className="size-4 text-zinc-700" />
              <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-700">Encrypted End-to-End Tunnel</span>
            </div>
          </>
        )}
      </main>

      <footer className="mt-20 text-[9px] font-black uppercase tracking-[0.4em] text-zinc-700">
        Powered by Indra NEXT Infrastructure // Sovereign Core
      </footer>
    </div>
  );
}
