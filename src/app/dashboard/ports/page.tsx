import { Suspense } from 'react';
import { getIngestionPorts } from '@/app/actions/ports';
import { getActiveIntegrations } from '@/app/actions/integrations';
import { PortList } from '@/components/ports/port-list';
import { PortDesignerWrapper } from '@/components/ports/port-designer-wrapper';
import { Globe, Plus, ShieldCheck } from 'lucide-react';

export const metadata = {
  title: 'Ingestion Ports | Indra NEXT',
  description: 'Manage sovereign public ingestion endpoints',
};

export default async function PortsPage() {
  const [ports, integrations] = await Promise.all([
    getIngestionPorts(),
    getActiveIntegrations(),
  ]);

  return (
    <div className="max-w-7xl mx-auto px-6 py-12">
      {/* ── Header ── */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-cyan-500 font-bold text-xs uppercase tracking-[0.2em]">
            <ShieldCheck className="w-4 h-4" />
            Infraestructura Soberana
          </div>
          <h1 className="text-4xl font-bold text-white tracking-tight">Puertos de Ingesta</h1>
          <p className="text-zinc-500 max-w-xl">
            Crea puntos de entrada públicos para que terceros suban contenido directamente a tus silos. 
            Indra asegura la integridad y organización axiomática.
          </p>
        </div>

        <PortDesignerWrapper integrations={integrations} />
      </header>

      {/* ── Ports Grid/List ── */}
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <h2 className="text-zinc-400 font-medium flex items-center gap-2">
            <Globe className="w-4 h-4" />
            Puertos Activos ({ports.length})
          </h2>
        </div>
        
        <Suspense fallback={<div className="h-64 bg-zinc-900/20 animate-pulse rounded-2xl border border-zinc-800" />}>
          <PortList ports={ports} />
        </Suspense>
      </div>
    </div>
  );
}
