/**
 * 🗂️ ARTEFACTO: IngestionPortList.tsx
 * ────────────
 * CAPA: UI / Features (Project Memory)
 * VERSIÓN: 1.0.0
 * 
 * 🎯 FUNCTIONAL_SCOPE:
 * - Proyección visual de los puertos de ingesta activos vinculados a una conexión.
 * - Acceso rápido a la edición y visualización de rutas públicas expuestas.
 */

import React from 'react';
import { ExternalLink, Copy, CheckCircle2, Globe, Settings2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIngestionPorts } from '@/hooks/use-ingestion-ports';

interface IngestionPortListProps {
  connectionId: string;
}

export function IngestionPortList({ connectionId }: IngestionPortListProps) {
  const { ports, isLoading } = useIngestionPorts(connectionId);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  const copyToClipboard = (slug: string) => {
    const url = `${window.location.origin}/p/${slug}`;
    navigator.clipboard.writeText(url);
    setCopiedId(slug);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (isLoading) return <div className="text-[10px] animate-pulse py-4 opacity-50 uppercase font-bold">Consultando Memoria de Proyectos...</div>;
  if (ports.length === 0) return null;

  return (
    <div className="space-y-3 mt-6 border-t border-border pt-6 animate-in fade-in duration-500">
      <div className="flex items-center gap-2 mb-2">
        <Globe className="size-3 text-primary" />
        <h5 className="text-[10px] font-bold uppercase tracking-widest text-primary">Proyectos de Ingesta Activos</h5>
      </div>
      
      <div className="grid grid-cols-1 gap-2">
        {ports.map((port) => (
          <div key={port.id} className="group flex items-center justify-between p-3 bg-muted/20 border border-border rounded-xl hover:bg-muted/40 transition-all">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-tight">{port.label}</span>
              <span className="text-[8px] font-mono opacity-50">/p/{port.slug}</span>
            </div>
            
            <div className="flex items-center gap-2">
              <button 
                onClick={() => copyToClipboard(port.slug)}
                className="p-1.5 hover:bg-background rounded-md border border-transparent hover:border-border transition-all"
                title="Copiar URL Pública"
              >
                {copiedId === port.slug ? <CheckCircle2 className="size-3 text-emerald-500" /> : <Copy className="size-3 opacity-40 hover:opacity-100" />}
              </button>
              <a 
                href={`/p/${port.slug}`} 
                target="_blank" 
                className="p-1.5 hover:bg-background rounded-md border border-transparent hover:border-border transition-all"
                title="Ver Ruta Pública"
              >
                <ExternalLink className="size-3 opacity-40 hover:opacity-100" />
              </a>
              <button className="p-1.5 hover:bg-background rounded-md border border-transparent hover:border-border transition-all opacity-20 cursor-not-allowed">
                <Settings2 className="size-3" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
