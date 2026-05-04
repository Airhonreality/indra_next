'use client';
// Indra NEXT Sovereign - Production Fix Build

import { useState, useEffect } from 'react';
import { ArrowRight, Zap, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import { FractalViewer, type IntegrationConfig } from '@/components/fractal-viewer';
import { WidgetProjector } from '@/components/widget-projector';
import { IntegrationsManager } from '@/components/integrations-manager';
import { executePipeline } from '@/app/actions/pipeline';
import type { SourceItem } from '@/app/actions/pipeline';
import type { FieldSchema } from '@/core/types/integration';
import { useSession, signIn, signOut } from 'next-auth/react';
import { cn } from '@/lib/utils';


type PipelineStatus = 'idle' | 'pending' | 'dispatched' | 'error';

interface SelectedSource {
  source: SourceItem;
  schema: FieldSchema[];
}

// ── PIPELINE BUILDER ──────────────────────────────────────────────────────────

function PipelineBuilder({ source, target }: { source: SelectedSource; target: SelectedSource }) {
  const [status, setStatus] = useState<PipelineStatus>('idle');
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dispatch = async () => {
    setStatus('pending');
    setError(null);
    try {
      const result = await executePipeline(
        { integration: source.source.integration, connectionId: source.source.connectionId, id: source.source.id },
        { integration: target.source.integration, connectionId: target.source.connectionId, id: target.source.id }
      );
      setJobId(result.jobId);
      setStatus('dispatched');
    } catch (e) {
      setError((e as Error).message);
      setStatus('error');
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <h2 className="text-sm font-semibold text-foreground">Pipeline</h2>

      <div className="flex items-center gap-3">
        <div className="flex-1 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Source</p>
          <p className="text-sm font-semibold mt-0.5 truncate">{source.source.label}</p>
          <p className="text-xs text-muted-foreground">{source.source.integration}</p>
        </div>
        <ArrowRight className="size-4 text-muted-foreground shrink-0" />
        <div className="flex-1 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Target</p>
          <p className="text-sm font-semibold mt-0.5 truncate">{target.source.label}</p>
          <p className="text-xs text-muted-foreground">{target.source.integration}</p>
        </div>
      </div>

      {status === 'idle' && (
        <button
          onClick={dispatch}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Zap className="size-4" />
          Dispatch Pipeline
        </button>
      )}

      {status === 'pending' && (
        <div className="flex items-center justify-center gap-2 rounded-lg border border-border py-2.5 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Dispatching to Inngest…
        </div>
      )}

      {status === 'dispatched' && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-1">
          <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="size-4" />
            Pipeline dispatched
          </p>
          <p className="text-xs text-muted-foreground font-mono break-all">{jobId}</p>
          <p className="text-xs text-muted-foreground">Monitor progress in the Inngest dashboard.</p>
        </div>
      )}

      {status === 'error' && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <p className="flex items-center gap-1.5 text-sm font-medium text-destructive">
            <AlertCircle className="size-4" />
            {error}
          </p>
        </div>
      )}
    </div>
  );
}

// ── PAGE ──────────────────────────────────────────────────────────────────────

export default function Home() {
  const { data: session, status } = useSession();
  const userId = session?.user?.id;
  const isLoaded = status !== 'loading';
  
  const [integrations, setIntegrations] = useState<IntegrationConfig[]>([]);
  const [sourceSelection, setSourceSelection] = useState<SelectedSource | null>(null);
  const [targetSelection, setTargetSelection] = useState<SelectedSource | null>(null);
  const [selecting, setSelecting] = useState<'source' | 'target'>('source');

  useEffect(() => {
    if (status !== 'authenticated' || !userId) return;

    const loadIntegrations = async () => {
      const res = await fetch(`/api/integrations?userId=${userId}`);
      const data = await res.json();
      
      const activeIntegrations: IntegrationConfig[] = data.integrations.map((i: any) => ({
        id: i.id,
        label: i.label,
        integration: i.type,
        connectionId: i.connectionId
      }));

      setIntegrations([
        { id: 'storage-local', label: 'Local Storage', integration: 'storage', basePath: './data' },
        ...activeIntegrations
      ]);
    };
    loadIntegrations();
  }, [status, userId]);

  if (status === 'loading') {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-background">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-background p-6 space-y-8 animate-in fade-in duration-700">
        <div className="flex flex-col items-center space-y-4 text-center">
          <div className="size-16 rounded-2xl bg-primary flex items-center justify-center shadow-2xl shadow-primary/20">
            <Zap className="size-8 text-primary-foreground" />
          </div>
          <h1 className="text-4xl font-bold tracking-tighter sm:text-5xl uppercase italic">INDRA NEXT</h1>
          <p className="text-muted-foreground max-w-[600px]">
            La infraestructura soberana para la ingesta y transcodificación de media a escala de Terabytes.
            Conecta tus silos, automatiza tus flujos.
          </p>
        </div>
        
        <button
          onClick={() => signIn('google')}
          className="group flex items-center gap-3 bg-foreground text-background px-8 py-4 rounded-full font-bold uppercase tracking-widest hover:scale-105 transition-all shadow-xl"
        >
          <span>Entrar con Google</span>
          <ArrowRight className="size-4 group-hover:translate-x-1 transition-transform" />
        </button>

        <div className="grid grid-cols-3 gap-8 pt-8 border-t border-border w-full max-w-2xl text-center">
          <div>
            <p className="text-2xl font-bold">700+</p>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Integraciones</p>
          </div>
          <div>
            <p className="text-2xl font-bold">100%</p>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Soberano</p>
          </div>
          <div>
            <p className="text-2xl font-bold">TB</p>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Escalabilidad</p>
          </div>
        </div>
      </div>
    );
  }

  const handleSelect = (source: SourceItem, schema: FieldSchema[]) => {
    if (selecting === 'source') {
      setSourceSelection({ source, schema });
      setSelecting('target');
    } else {
      setTargetSelection({ source, schema });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-6 py-4 flex items-center gap-3">
        <div className="size-7 rounded-md bg-primary flex items-center justify-center">
          <Zap className="size-4 text-primary-foreground" />
        </div>
        <h1 className="font-semibold text-foreground flex-1">INDRA NEXT</h1>
        
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex flex-col items-end">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Sovereign Identity</span>
            <span className="text-[11px] font-medium">{session?.user?.email}</span>
          </div>
          {session?.user?.image && (
            <img src={session.user.image} className="size-8 rounded-full border border-border" alt="" />
          )}
          <button 
            onClick={() => signOut()}
            className="p-2 hover:bg-muted rounded-lg transition-colors text-muted-foreground"
            title="Sign out"
          >
            <AlertCircle className="size-4" />
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-6 max-w-7xl mx-auto">

        {/* LEFT: FractalViewer */}
        <div className="lg:col-span-1 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Silo Navigator</h2>
            <div className="flex gap-1.5">
              <button
                onClick={() => setSelecting('source')}
                className={cn(
                  'rounded-md px-2 py-0.5 text-xs font-medium transition-colors',
                  selecting === 'source' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'
                )}
              >
                → Source
              </button>
              <button
                onClick={() => setSelecting('target')}
                className={cn(
                  'rounded-md px-2 py-0.5 text-xs font-medium transition-colors',
                  selecting === 'target' ? 'bg-emerald-600 text-white' : 'bg-muted text-muted-foreground hover:bg-accent'
                )}
              >
                → Target
              </button>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Click <strong>{selecting === 'source' ? 'a source' : 'a target'}</strong> to configure the pipeline.
          </p>

          <FractalViewer
            integrations={integrations}
            onSelect={handleSelect}
            selectedSourceId={selecting === 'source' ? sourceSelection?.source.id : targetSelection?.source.id}
          />
        </div>

        {/* CENTER: Pipeline Builder */}
        <div className="lg:col-span-1 space-y-4">
          <h2 className="text-sm font-semibold">Pipeline Builder</h2>

          {sourceSelection && targetSelection ? (
            <PipelineBuilder source={sourceSelection} target={targetSelection} />
          ) : (
            <div className="rounded-xl border border-dashed border-border p-8 flex flex-col items-center gap-3 text-center text-muted-foreground">
              <ArrowRight className="size-8 opacity-30" />
              <p className="text-sm">Select a source and target from the Silo Navigator to build a pipeline.</p>
            </div>
          )}

          {sourceSelection && (
            <div className="rounded-xl border border-border bg-card p-4 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Source selection</p>
              <p className="text-sm font-medium">{sourceSelection.source.label}</p>
              <p className="text-xs text-muted-foreground">{sourceSelection.schema.length} fields detected</p>
            </div>
          )}
        </div>

        {/* RIGHT: WidgetProjector */}
        <div className="lg:col-span-1 space-y-4">
          <h2 className="text-sm font-semibold">Schema Preview</h2>

          {sourceSelection?.schema.length ? (
            <div className="rounded-xl border border-border bg-card p-5">
              <p className="text-xs text-muted-foreground mb-4">
                Previewing schema from <strong>{sourceSelection.source.label}</strong>
              </p>
              <WidgetProjector
                schema={sourceSelection.schema}
                onSubmit={(values, errors) => {
                  if (Object.keys(errors).length === 0) {
                    console.log('Form values:', values);
                  }
                }}
                submitLabel="Preview Record"
              />
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border p-8 flex flex-col items-center gap-3 text-center text-muted-foreground">
              <p className="text-sm">Select a source to preview its schema and test field rendering.</p>
            </div>
          )}
        </div>
      </div>

      {/* BOTTOM: Infrastructure Management */}
      <div className="max-w-7xl mx-auto p-6 border-t border-border mt-12">
        <div className="bg-muted/30 rounded-2xl p-8 border border-border">
          <IntegrationsManager />
        </div>
      </div>
    </div>
  );
}
