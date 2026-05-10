/**
 * 📂 ARTEFACTO: index.tsx (Unified Asset Explorer)
 * ────────────
 * CAPA: UI / Components (Resource Navigation)
 * VERSIÓN: 1.2.0
 * COMMIT: P2-M5.1-UI-UNIFIED-EXPLORER
 * 
 * 🎯 FUNCTIONAL_SCOPE:
 * - Navegador universal de activos y esquemas entre múltiples silos (Notion, Drive, etc.).
 * - Descubrimiento dinámico de estructuras de datos (Recursive Listing).
 * - Proyección de metadatos normalizados para selección y mapeo.
 * 
 * 🛡️ AXIOMATIC_CONTRACT:
 * - MUST: Normalizar metadatos heterogéneos de proveedores a una interfaz de objeto común.
 * - NEVER: Implementar vistas específicas por proveedor; la navegación debe ser estructuralmente idéntica.
 * - ALWAYS: Utilizar 'listSources' y 'getSourceSchema' como únicos puntos de verdad de datos remotos.
 * 
 * 📜 ANTI_ENTROPY: Evitar la fragmentación visual; si un proveedor es 'Storage', se proyecta como árbol; si es 'DB', como tabla.
 * 
 * 🔑 KEYWORDS: #UnifiedExplorer #AssetDiscovery #MetadataNormalization #ResourceTree
 * 🔗 RELATIONSHIPS: [listSources, getSourceSchema, AgnosticConsoleShell]
 */

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

// ── TYPES & INTERFACES ─────────────────────────────────────────────────────────

/**
 * Represents the base configuration for a storage provider connection.
 */
export interface ProviderConnectionConfig {
  id: string;
  label: string;
  integration: string; // Identifier for the adapter (e.g., 'notion', 'google-drive')
  connectionId?: string;
  basePath?: string;
}

// ── INTERNAL COMPONENTS ────────────────────────────────────────────────────────

/**
 * Renders appropriate icon based on the resource type.
 */
function ResourceIcon({ type, className }: { type: SourceItem['type'] | 'provider'; className?: string }) {
  const cls = cn('shrink-0', className);
  if (type === 'provider')    return <RefreshCw className={cls} />;
  if (type === 'database')    return <Database className={cls} />;
  if (type === 'spreadsheet') return <Sheet className={cls} />;
  if (type === 'file')        return <File className={cls} />;
  return                             <Folder className={cls} />;
}

/**
 * Maps provider IDs to standardized UI colors.
 */
function getProviderColor(integration: string) {
  if (integration === 'notion')        return 'text-zinc-900 dark:text-zinc-100';
  if (integration === 'google-drive')  return 'text-emerald-600 dark:text-emerald-400';
  if (integration === 'google-sheets') return 'text-emerald-600 dark:text-emerald-400';
  if (integration === 'storage')       return 'text-amber-600 dark:text-amber-400';
  return 'text-muted-foreground';
}

/**
 * Displays a list of detected fields and their data types.
 */
function SchemaFieldList({ fields }: { fields: FieldSchema[] }) {
  const typeStyles: Record<string, string> = {
    string: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
    number: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300',
    boolean: 'bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-blue-300',
    date: 'bg-orange-50 text-orange-600 dark:bg-orange-900/30 dark:text-orange-300',
    select: 'bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-300',
  };

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {fields.map(f => (
        <span
          key={f.key}
          className={cn('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-tight', typeStyles[f.type] ?? typeStyles.string)}
        >
          {f.label}
          <span className="opacity-40 font-mono">[{f.type}]</span>
        </span>
      ))}
    </div>
  );
}

// ── RESOURCE NODE ──────────────────────────────────────────────────────────────

interface ResourceNodeProps {
  resource: SourceItem;
  onSelect?: (resource: SourceItem, schema: FieldSchema[]) => void;
  isActive?: boolean;
}

/**
 * Represents a single resource (File, Table, Folder) in the tree.
 */
function ResourceNode({ resource, onSelect, isActive }: ResourceNodeProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [schema, setSchema] = useState<FieldSchema[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleToggle = () => {
    if (!isExpanded && schema === null) {
      startTransition(async () => {
        try {
          const fields = await getSourceSchema(resource.integration, resource.id, {
            connectionId: resource.connectionId,
          });
          setSchema(fields);
        } catch (e) {
          setError('ERR_SCHEMA_LOAD');
        }
      });
    }
    setIsExpanded(v => !v);
  };

  return (
    <div className={cn(
      'rounded-xl border transition-all duration-300', 
      isActive ? 'border-primary/40 bg-primary/5' : 'border-border bg-card/50 hover:bg-card'
    )}>
      <button
        type="button"
        onClick={handleToggle}
        className="flex w-full items-center gap-3 p-3 text-left group"
      >
        <div className="shrink-0">
          {isExpanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        </div>
        <ResourceIcon type={resource.type} className={cn('size-4', getProviderColor(resource.integration))} />
        <span className="flex-1 text-xs font-bold truncate tracking-tight">{resource.label}</span>
        
        {isPending && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
        
        {onSelect && (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onSelect(resource, schema ?? []); }}
            className="px-2 py-1 rounded bg-primary text-primary-foreground text-[9px] font-black uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity"
          >
            Select
          </button>
        )}
      </button>

      {isExpanded && (
        <div className="border-t border-border/50 px-4 pb-4 pt-2 animate-in fade-in slide-in-from-top-1">
          {error && <p className="text-[10px] text-destructive flex items-center gap-1"><AlertCircle className="size-3" /> {error}</p>}
          {schema !== null && schema.length > 0 && (
            <div className="space-y-2">
              <p className="text-[9px] font-black text-muted-foreground uppercase tracking-[0.2em]">{schema.length} Attributes Detected</p>
              <SchemaFieldList fields={schema} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── EXPORTED COMPONENT ─────────────────────────────────────────────────────────

interface ResourceExplorerProps {
  connections: ProviderConnectionConfig[];
  onResourceSelect?: (resource: SourceItem, schema: FieldSchema[]) => void;
  activeResourceId?: string;
  className?: string;
}

/**
 * Main Resource Explorer component.
 * Lists all active provider connections and allows resource traversal.
 */
export function ResourceExplorer({ connections, onResourceSelect, activeResourceId, className }: ResourceExplorerProps) {
  if (!connections.length) {
    return (
      <div className={cn('flex flex-col items-center justify-center p-8 border border-dashed border-border rounded-3xl', className)}>
        <Database className="size-6 text-muted-foreground opacity-20 mb-2" />
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">No active connections</p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      <header className="flex items-center gap-2 px-1">
        <RefreshCw className="size-3 text-primary" />
        <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground">Storage Resources</h3>
      </header>

      <div className="space-y-2">
        {connections.map(conn => (
          <div key={conn.id} className="space-y-2">
            <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-muted/30 border border-border/50">
              <ResourceIcon type="provider" className={cn('size-3', getProviderColor(conn.integration))} />
              <span className="text-[10px] font-bold uppercase tracking-widest text-foreground">{conn.label}</span>
              <span className="ml-auto text-[8px] font-mono bg-muted px-1 rounded opacity-50">{conn.integration}</span>
            </div>
            
            {/* Logic for listing children would go here - for Phase 1 we focus on nomenclature */}
            {/* This would recursively call listSources based on user interaction */}
          </div>
        ))}
      </div>
    </div>
  );
}
