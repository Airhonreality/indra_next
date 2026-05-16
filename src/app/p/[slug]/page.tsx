/**
 * 🚪 ARTEFACTO: page.tsx (PublicPortalPage)
 * ────────────
 * CAPA: UI / Routes (Public Ingestion Gateway)
 * VERSIÓN: 2.0.0
 * COMMIT: P3-M11.3-AGNOSTIC-BLOCK-PROJECTION
 */

'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { registry } from '@/core/registry';
import { Loader2, ShieldCheck } from 'lucide-react';

export default function PublicPortalPage() {
  const { slug } = useParams() as { slug: string };
  const [port, setPort] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [IngestorBlock, setIngestorBlock] = useState<React.ComponentType<any> | null>(null);

  useEffect(() => {
    // 1. Resolve Port Metadata
    fetch(`/api/p/${slug}`)
      .then(res => res.json())
      .then(data => {
        if (data.port) setPort(data.port);
        setLoading(false);
      });

    // 2. Resolve Ingestion Capacity (Agnostic Discovery)
    registry.resolveBlock('INGESTION_SOVEREIGN').then(block => {
      setIngestorBlock(() => block);
    });
  }, [slug]);

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
          <span className="text-[8px] font-mono tracking-tighter">v2.0.0</span>
        </div>
      </header>

      <main className="w-full max-w-2xl bg-card border border-border rounded-[2.5rem] shadow-sm p-12 space-y-12 relative overflow-hidden">
        {/* AGNOSTIC CAPABILITY PROJECTION */}
        {IngestorBlock ? (
          <IngestorBlock slug={slug} />
        ) : (
          <div className="py-20 text-center space-y-4">
            <Loader2 className="size-6 animate-spin mx-auto text-muted-foreground" />
            <p className="text-[10px] font-bold uppercase tracking-widest opacity-40">Resolviendo Capacidad de Ingesta...</p>
          </div>
        )}

        <div className="pt-8 border-t border-border flex items-center justify-center opacity-40">
          <ShieldCheck className="size-4 text-primary mr-2" />
          <span className="text-[10px] font-bold uppercase tracking-[0.3em]">End-to-End Encryption Tunnel</span>
        </div>
      </main>

      <footer className="mt-20 text-[9px] font-bold uppercase tracking-[0.4em] text-muted-foreground opacity-30">
        Indra NEXT // Agnostic Discovery v2.0.0
      </footer>
    </div>
  );
}
