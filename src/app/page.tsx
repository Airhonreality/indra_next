import { Suspense } from 'react';
import { AgnosticConsoleShell } from '@/features/connections/ui/AgnosticConsoleShell';
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
    type: c.type,
    connectionId: c.connectionId
  }));

  return (
    <main className="min-h-screen bg-background text-foreground selection:bg-primary/30">
      <div className="relative max-w-full mx-auto px-6 lg:px-12 py-12 lg:py-20 space-y-20">
        
        {/* HEADER */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-8 border-b border-border pb-12">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Activity className="size-5 text-primary animate-pulse" />
              <span className="text-[10px] font-bold uppercase tracking-[0.4em] text-primary/80">Infrastructure Live</span>
            </div>
            <h1 className="text-5xl md:text-7xl font-bold tracking-tighter leading-none">
              INDRA <span className="text-primary font-serif">NEXT</span>
            </h1>
          </div>
          <div className="flex items-center gap-6 p-4 rounded-xl bg-card border border-border shadow-sm">
            <div className="text-right space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Sovereign Identity</p>
              <p className="text-sm font-bold">{session?.user?.name || 'Admin'}</p>
            </div>
            <div className="size-12 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
              <ShieldCheck className="size-6 text-primary" />
            </div>
          </div>
        </header>

        {/* ROW 1: CONNECTIONS & DISCOVERY (FULL WIDTH) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
          <section className="lg:col-span-3 space-y-8">
             <div className="flex items-center gap-4">
              <Database className="size-5 text-primary" />
              <h2 className="text-xl font-bold tracking-widest uppercase">{t.connections.title}</h2>
            </div>
            <Suspense fallback={<div className="h-64 bg-muted animate-pulse rounded-xl" />}>
              <AgnosticConsoleShell />
            </Suspense>
          </section>
        </div>

        {/* ROW 2: SIDEBAR RESOURCES (MOVED BELOW OR AS SUB-SECTION) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
          <aside className="lg:col-span-3 space-y-8 border-t border-border pt-12">
            <div className="flex items-center gap-4">
              <Activity className="size-5 text-primary" />
              <h2 className="text-xl font-bold tracking-widest uppercase">Infrastructure Nodes</h2>
            </div>
            <ResourceExplorer connections={connectionConfigs} />
          </aside>
        </div>

        {/* END OF MAIN CONTENT */}
      </div>
    </main>
  );
}
