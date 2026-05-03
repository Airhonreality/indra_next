'use client';

import { useState, useTransition } from 'react';
import {
  Database, Sheet, File, Folder, ChevronRight, ChevronDown,
  Loader2, RefreshCw, AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { listSources, getSourceSchema } from '@/app/actions/pipeline';
import type { SourceItem } from '@/app/actions/pipeline';
import type { FieldSchema } from '@/core/types/integration';

// ── INTEGRATION DESCRIPTOR ─────────────────────────────────────────────────────

export interface IntegrationConfig {
  id: string;
  label: string;
  integration: string; // adapter id: 'notion' | 'google-sheets' | 'storage'
  connectionId?: string;
  basePath?: string;
}

// ── ICONS ──────────────────────────────────────────────────────────────────────

function SourceIcon({ type, className }: { type: SourceItem['type'] | 'integration'; className?: string }) {
  const cls = cn('shrink-0', className);
  if (type === 'integration') return <RefreshCw className={cls} />;
  if (type === 'database')    return <Database className={cls} />;
  if (type === 'spreadsheet') return <Sheet className={cls} />;
  if (type === 'file')        return <File className={cls} />;
  return                             <Folder className={cls} />;
}

function integrationColor(integration: string) {
  if (integration === 'notion')        return 'text-zinc-900 dark:text-zinc-100';
  if (integration === 'google-sheets') return 'text-emerald-600 dark:text-emerald-400';
  if (integration === 'storage')       return 'text-amber-600 dark:text-amber-400';
  return 'text-muted-foreground';
}

// ── SCHEMA PILL LIST ───────────────────────────────────────────────────────────

function SchemaPreview({ fields }: { fields: FieldSchema[] }) {
  const typeColor: Record<string, string> = {
    string: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
    number: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300',
    boolean: 'bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-300',
    date: 'bg-orange-50 text-orange-600 dark:bg-orange-900/30 dark:text-orange-300',
    select: 'bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-300',
    'multi-select': 'bg-teal-50 text-teal-600 dark:bg-teal-900/30 dark:text-teal-300',
    relation: 'bg-pink-50 text-pink-600 dark:bg-pink-900/30 dark:text-pink-300',
    computed: 'bg-muted text-muted-foreground',
  };

  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {fields.map(f => (
        <span
          key={f.key}
          className={cn('inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium', typeColor[f.type] ?? typeColor.string)}
        >
          {f.label}
          <span className="opacity-60 font-normal">{f.type}</span>
        </span>
      ))}
    </div>
  );
}

// ── SOURCE NODE ────────────────────────────────────────────────────────────────

interface SourceNodeProps {
  source: SourceItem;
  onSelect?: (source: SourceItem, schema: FieldSchema[]) => void;
  selected?: boolean;
}

function SourceNode({ source, onSelect, selected }: SourceNodeProps) {
  const [open, setOpen] = useState(false);
  const [schema, setSchema] = useState<FieldSchema[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const toggle = () => {
    if (!open && schema === null) {
      startTransition(async () => {
        try {
          const fields = await getSourceSchema(source.integration, source.id, {
            connectionId: source.connectionId,
          });
          setSchema(fields);
        } catch (e) {
          setError('Schema load failed');
        }
      });
    }
    setOpen(v => !v);
  };

  return (
    <div className={cn('rounded-lg border transition-colors', selected ? 'border-primary/40 bg-primary/5' : 'border-border bg-card hover:border-border/80')}>
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center gap-2.5 p-2.5 text-left"
      >
        {open
          ? <ChevronDown className="size-3.5 text-muted-foreground shrink-0" />
          : <ChevronRight className="size-3.5 text-muted-foreground shrink-0" />}
        <SourceIcon type={source.type} className={cn('size-4', integrationColor(source.integration))} />
        <span className="flex-1 text-sm font-medium truncate">{source.label}</span>
        {isPending && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
        {onSelect && (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onSelect(source, schema ?? []); }}
            className="shrink-0 rounded px-2 py-0.5 text-xs bg-primary text-primary-foreground opacity-0 group-hover:opacity-100 hover:opacity-100 focus:opacity-100 transition-opacity"
          >
            Select
          </button>
        )}
      </button>

      {open && (
        <div className="border-t border-border px-3 pb-3 pt-2">
          {error && (
            <p className="flex items-center gap-1.5 text-xs text-destructive">
              <AlertCircle className="size-3.5" />{error}
            </p>
          )}
          {schema !== null && schema.length > 0 && (
            <>
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-1">
                {schema.length} fields
              </p>
              <SchemaPreview fields={schema} />
              {onSelect && (
                <button
                  type="button"
                  onClick={() => onSelect(source, schema)}
                  className="mt-2.5 w-full rounded-md border border-primary/30 bg-primary/10 py-1 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
                >
                  Use as source / target
                </button>
              )}
            </>
          )}
          {schema !== null && schema.length === 0 && !error && (
            <p className="text-xs text-muted-foreground">No schema available for this source.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── INTEGRATION SECTION ────────────────────────────────────────────────────────

interface IntegrationSectionProps {
  config: IntegrationConfig;
  onSelect?: (source: SourceItem, schema: FieldSchema[]) => void;
  selectedSourceId?: string;
}

function IntegrationSection({ config, onSelect, selectedSourceId }: IntegrationSectionProps) {
  const [sources, setSources] = useState<SourceItem[] | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const toggle = () => {
    if (!open && sources === null) {
      startTransition(async () => {
        try {
          const data = await listSources(config.integration, {
            connectionId: config.connectionId,
            basePath: config.basePath,
          });
          setSources(data);
        } catch (e) {
          setError('Failed to load sources');
          setSources([]);
        }
      });
    }
    setOpen(v => !v);
  };

  const refresh = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSources(null);
    setError(null);
    if (open) {
      startTransition(async () => {
        try {
          const data = await listSources(config.integration, {
            connectionId: config.connectionId,
            basePath: config.basePath,
          });
          setSources(data);
        } catch {
          setError('Failed to refresh');
          setSources([]);
        }
      });
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden shadow-xs">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors"
      >
        {open
          ? <ChevronDown className="size-4 text-muted-foreground" />
          : <ChevronRight className="size-4 text-muted-foreground" />}
        <SourceIcon type="integration" className={cn('size-4', integrationColor(config.integration))} />
        <span className="flex-1 font-semibold text-sm">{config.label}</span>
        <span className={cn('text-xs font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground', integrationColor(config.integration))}>
          {config.integration}
        </span>
        {isPending && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        {open && !isPending && (
          <button type="button" onClick={refresh} title="Refresh" className="p-1 rounded hover:bg-muted">
            <RefreshCw className="size-3.5 text-muted-foreground" />
          </button>
        )}
      </button>

      {open && (
        <div className="border-t border-border px-3 py-2 space-y-1.5">
          {error && (
            <p className="flex items-center gap-1.5 text-xs text-destructive py-2">
              <AlertCircle className="size-3.5" />{error}
            </p>
          )}
          {sources !== null && sources.length === 0 && !error && (
            <p className="text-xs text-muted-foreground py-2 px-1">
              No sources found. Check your connection settings.
            </p>
          )}
          {sources !== null && sources.map(source => (
            <SourceNode
              key={source.id}
              source={source}
              onSelect={onSelect}
              selected={source.id === selectedSourceId}
            />
          ))}
          {sources === null && !isPending && (
            <p className="text-xs text-muted-foreground py-2 px-1 animate-pulse">Loading sources…</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── FRACTAL VIEWER ─────────────────────────────────────────────────────────────

interface FractalViewerProps {
  integrations: IntegrationConfig[];
  onSelect?: (source: SourceItem, schema: FieldSchema[]) => void;
  selectedSourceId?: string;
  className?: string;
}

export function FractalViewer({ integrations, onSelect, selectedSourceId, className }: FractalViewerProps) {
  if (!integrations.length) {
    return (
      <div className={cn('flex flex-col items-center justify-center gap-2 py-12 text-center text-muted-foreground', className)}>
        <Database className="size-8 opacity-40" />
        <p className="text-sm">No integrations configured.</p>
        <p className="text-xs">Add integrations to start navigating your data silos.</p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground px-1">
        Data Silos
      </p>
      {integrations.map(config => (
        <IntegrationSection
          key={config.id}
          config={config}
          onSelect={onSelect}
          selectedSourceId={selectedSourceId}
        />
      ))}
    </div>
  );
}
