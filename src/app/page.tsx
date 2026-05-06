import { Suspense } from 'react';
import { ConnectionManager } from '@/components/connection-manager';
import { PortCreator } from '@/components/ports/port-creator';
import { ResourceExplorer } from '@/components/resource-explorer';
import { i18n } from '@/lib/i18n';
import { 
  Database, 
  Workflow, 
  Globe, 
  Activity, 
  ShieldCheck 
} from 'lucide-react';
import { auth } from "@/auth";
import { db } from '@/lib/db';
import { integrations } from '@/core/db/schema';
import { eq } from 'drizzle-orm';

const t = i18n.es;

export default async function DashboardPage() {
  const session = await auth();
  const userId = session?.user?.id;

  // Fetch connections for the PortCreator
  const userConnections = userId ? await db
    .select()
    .from(integrations)
    .where(eq(integrations.userId, userId)) : [];

  const connectionConfigs = userConnections.map(c => ({
    id: c.id,
    label: c.label,
    integration: c.type,
    connectionId: c.connectionId
  }));

  return (
    <main className="min-h-screen bg-[#050505] text-zinc-400 selection:bg-primary/30">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] size-[40%] bg-primary/5 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] size-[40%] bg-blue-500/5 blur-[120px] rounded-full" />
      </div>

      <div className="relative max-w-7xl mx-auto px-6 py-12 lg:py-20 space-y-20">
        
        {/* HEADER */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-8 border-b border-white/5 pb-12">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Activity className="size-5 text-primary animate-pulse" />
              <span className="text-[10px] font-black uppercase tracking-[0.4em] text-primary/80">Infrastructure Live</span>
            </div>
            <h1 className="text-5xl md:text-7xl font-black text-white tracking-tighter leading-none">
              INDRA <span className="text-primary">NEXT</span>
            </h1>
          </div>
          <div className="flex items-center gap-6 p-4 rounded-3xl bg-white/[0.02] border border-white/5 backdrop-blur-md">
            <div className="text-right space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">Sovereign Identity</p>
              <p className="text-sm font-bold text-white">{session?.user?.name || 'Admin'}</p>
            </div>
            <div className="size-12 rounded-2xl bg-primary/10 border border-white/10 flex items-center justify-center">
              <ShieldCheck className="size-6 text-white/80" />
            </div>
          </div>
        </header>

        {/* ROW 1: CONNECTIONS & DISCOVERY */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
          <section className="lg:col-span-2 space-y-8">
             <div className="flex items-center gap-4">
              <Database className="size-5 text-primary" />
              <h2 className="text-xl font-bold text-white tracking-widest uppercase">{t.connections.title}</h2>
            </div>
            <Suspense fallback={<div className="h-64 bg-white/5 animate-pulse rounded-3xl" />}>
              <ConnectionManager />
            </Suspense>
          </section>

          <aside className="space-y-8">
            <ResourceExplorer connections={connectionConfigs} />
          </aside>
        </div>

        {/* ROW 2: PORTALS & WORKFLOWS */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 pt-12 border-t border-white/5">
          <section className="space-y-8">
            <div className="flex items-center gap-4">
              <Globe className="size-5 text-blue-500" />
              <h2 className="text-xl font-bold text-white tracking-widest uppercase">{t.portals.title}</h2>
            </div>
            <PortCreator connections={connectionConfigs} />
          </section>

          <section className="space-y-8 p-8 rounded-[2.5rem] bg-white/[0.02] border border-white/5 opacity-50 grayscale">
            <div className="flex items-center gap-4">
              <Workflow className="size-5 text-emerald-500" />
              <h2 className="text-xl font-bold text-white tracking-widest uppercase">Workflow Engine</h2>
            </div>
            <div className="aspect-square flex flex-col items-center justify-center border border-dashed border-white/10 rounded-full">
              <p className="text-[10px] font-black uppercase tracking-[0.3em]">Phase 4 // Inngest Worker</p>
              <p className="text-[8px] italic opacity-40">Coming after port validation</p>
            </div>
          </section>
        </div>

      </div>
    </main>
  );
}
