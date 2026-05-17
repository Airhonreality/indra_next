'use client';

/**
 * 🌐 ARTEFACTO: port-creator.tsx
 * ────────────
 * CAPA: UI / Components (Ingestion Orchestrator)
 * VERSIÓN: 4.0.0 — Autonomous Cell (Axiomatic Decoupling)
 *
 * 🎯 FUNCTIONAL_SCOPE:
 * - Orquestador autónomo para creación/edición de Túneles de Ingesta.
 * - Se hidrata solo (useConnections) sin recibir datos del padre.
 * - Lee selectedPort del store y emite invalidate('ports') al completar.
 */

import { useState, useEffect } from 'react';
import { createIngestionPort, updateIngestionPort } from '@/app/actions/ports';
import { RoutingService } from '@/core/services/routing';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Globe, Loader2, Check, Link, PlusCircle,
  Database, Folder, Zap,
} from 'lucide-react';
import { AgnosticTree } from '@/components/ui/agnostic-tree';
import { IngestionFieldDesigner } from '@/components/ingestion/field-designer';
import { IngestionOperator } from '@/components/ingestion/operator';
import { RuleArchitect, type RuleNode } from '@/components/routing/rule-architect';
import { useConnections } from '@/hooks/use-connections';
import { useIndraStore, type PortSchemaField } from '@/stores/indra-store';

interface PortCreatorProps {
  className?: string;
}

export function PortCreator({ className }: PortCreatorProps) {
  const { activeConnections } = useConnections();
  const selectedPort = useIndraStore((s) => s.selectedPort);
  const selectPort = useIndraStore((s) => s.selectPort);
  const invalidate = useIndraStore((s) => s.invalidate);

  const [isPending, setIsPending] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [showPublicLink, setShowPublicLink] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    label: '',
    slug: '',
    integrationId: '',
    targetPath: 'root',
    pattern: '/{year}/{month}/{project}',
  });
  const [schemaFields, setSchemaFields] = useState<PortSchemaField[]>([
    { key: 'project', type: 'string', label: 'Nombre del Proyecto', required: true },
  ]);

  const [initialRules, setInitialRules] = useState<RuleNode[]>([]);
  const isEditMode = !!selectedPort;

  useEffect(() => {
    const patternStr = selectedPort?.config?.pattern || '/{year}/{month}/{project}';
    
    const parsePatternToRules = (pStr: string, fields: PortSchemaField[]): RuleNode[] => {
      const segments = pStr.split('/').filter((s) => s.startsWith('{') && s.endsWith('}'));
      const dateLabels: Record<string, string> = {
        '{year}': 'Año',
        '{month}': 'Mes',
        '{day}': 'Día',
        '{hour}': 'Hora',
        '{minute}': 'Minuto'
      };

      return segments.map((seg) => {
        if (dateLabels[seg]) {
          return {
            id: Math.random().toString(36).substring(2, 9),
            type: 'date',
            value: seg,
            label: dateLabels[seg]
          };
        }
        const key = seg.slice(1, -1);
        const matchedField = fields.find((f) => f.key === key);
        return {
          id: Math.random().toString(36).substring(2, 9),
          type: matchedField ? 'variable' : 'custom',
          value: seg,
          label: matchedField?.label || key
        };
      });
    };

    if (selectedPort) {
      const fields = selectedPort.schema ?? [];
      setFormData({
        label: selectedPort.label,
        slug: selectedPort.slug,
        integrationId: selectedPort.integrationId,
        targetPath: selectedPort.targetPath,
        pattern: selectedPort.config?.pattern || '/{year}/{month}/{project}',
      });
      setSchemaFields(fields);
      setInitialRules(parsePatternToRules(patternStr, fields));
    } else {
      setFormData({
        label: '',
        slug: '',
        integrationId: '',
        targetPath: 'root',
        pattern: '/{year}/{month}/{project}',
      });
      const defaultFields: PortSchemaField[] = [{ key: 'project', type: 'string', label: 'Nombre del Proyecto', required: true }];
      setSchemaFields(defaultFields);
      setInitialRules(parsePatternToRules('/{year}/{month}/{project}', defaultFields));
    }
  }, [selectedPort]);
  const handleNameChange = (val: string) => {
    if (isEditMode) {
      setFormData((prev) => ({ ...prev, label: val }));
      return;
    }
    const slug = RoutingService.generateSlug(val);
    setFormData((prev) => ({ ...prev, label: val, slug }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsPending(true);

    try {
      if (isEditMode) {
        await updateIngestionPort(selectedPort.id, {
          ...formData,
          config: { pattern: formData.pattern },
          schema: schemaFields,
        });
      } else {
        await createIngestionPort({
          ...formData,
          config: { pattern: formData.pattern },
          schema: schemaFields,
        });
      }

      const publicUrl = `${window.location.origin}/p/${formData.slug}`;
      setIsSuccess(true);
      setShowPublicLink(publicUrl);

      setTimeout(() => {
        setIsSuccess(false);
        selectPort(null);
        invalidate('ports');
      }, 2000);
    } catch (err) {
      alert('Error: ' + (err as Error).message);
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className={`space-y-6 ${className ?? ''}`}>
      <form onSubmit={handleSubmit} className="p-8 rounded-xl bg-card border border-border shadow-sm space-y-6 animate-in fade-in slide-in-from-bottom-2">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <div className={`size-8 rounded-lg ${isEditMode ? 'bg-amber-500/10 border-amber-500/20' : 'bg-primary/10 border-primary/20'} border flex items-center justify-center transition-colors`}>
              <Globe className={`size-4 ${isEditMode ? 'text-amber-500' : 'text-primary'}`} />
            </div>
            <div className="flex flex-col">
              <h3 className="text-lg font-bold tracking-tight uppercase tracking-widest leading-none">
                {isEditMode ? 'Editor de Túneles' : 'Diseñador de Túneles'}
              </h3>
              {isEditMode && <span className="text-[8px] text-amber-500 font-bold uppercase mt-1">Modo Edición Activo</span>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isEditMode && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => selectPort(null)}
                className="text-[9px] font-bold uppercase tracking-widest h-8 gap-2 hover:bg-primary/5"
              >
                <PlusCircle className="size-3" /> Nuevo Proyecto
              </Button>
            )}
            <span className="text-[9px] font-mono opacity-40 uppercase tracking-tighter">v4.0 Sovereign Hub</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* IDENTIDAD */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Nombre del Portal</Label>
              <Input
                placeholder="Ej: Recepción de Activos"
                value={formData.label}
                onChange={(e) => handleNameChange(e.target.value)}
                className="bg-muted border-border font-medium"
                required
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">URL Pública (Routing Service)</Label>
              <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 border border-border rounded-lg text-xs font-mono text-muted-foreground">
                <Link className="size-3" />
                /p/{formData.slug || '...'}
              </div>
            </div>
          </div>

          {/* DESTINO */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Silo de Destino</Label>
              <select
                disabled={isEditMode}
                className="w-full h-10 px-3 rounded-md bg-muted border border-border text-sm outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                value={formData.integrationId}
                onChange={(e) => setFormData({ ...formData, integrationId: e.target.value })}
                required
              >
                <option value="">-- Seleccionar Silo --</option>
                {activeConnections.filter((c) => c.id).map((c) => (
                  <option key={c.id} value={c.id}>{c.label} ({c.type})</option>
                ))}
              </select>
              {isEditMode && <p className="text-[8px] text-muted-foreground mt-1 italic">El destino no puede modificarse en túneles activos.</p>}
            </div>
          </div>
        </div>

        {/* ── SECCIÓN 1: DEFINICIÓN DE DATOS ── */}
        <div className="pt-4 border-t border-border/50 space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-[10px] font-bold uppercase tracking-widest text-primary">Esquema de Datos (Formulario de Ingesta)</Label>
            <Badge variant="outline" className="text-[8px] opacity-50">Variables Disponibles</Badge>
          </div>
          <IngestionFieldDesigner
            fields={schemaFields}
            onChange={setSchemaFields}
          />
        </div>

        {/* ── SECCIÓN 2: ORIGEN Y ENRUTAMIENTO ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-6 border-t border-border/50">
          {/* Punto de Inyección */}
          <div className="space-y-4">
            <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <Database className="size-3" /> 1. Punto de Inyección (Origen)
            </Label>
            <AgnosticTree
              integrationId={formData.integrationId}
              initialSelectedId={formData.targetPath}
              onSelect={(atom) => setFormData({ ...formData, targetPath: atom.id })}
              className="h-[250px]"
            />
            <div className="p-3 bg-muted/30 border border-border rounded-lg flex items-center gap-3">
              <div className="size-6 rounded bg-primary/10 flex items-center justify-center">
                <Folder className="size-3 text-primary" />
              </div>
              <div className="overflow-hidden">
                <p className="text-[8px] uppercase font-black opacity-40">Base Path Seleccionado:</p>
                <p className="text-[10px] font-mono truncate">{formData.targetPath}</p>
              </div>
            </div>
          </div>

          {/* Arquitectura de Reglas */}
          <div className="space-y-4">
            <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <Zap className="size-3" /> 2. Arquitectura de Namespace (Reglas)
            </Label>
            <RuleArchitect
              key={initialRules.map(r => r.value).join('-')}
              initialRules={initialRules}
              basePath={formData.targetPath}
              availableFields={schemaFields.map((f) => ({ id: f.key, label: f.label }))}
              schemaFields={schemaFields}
              onSchemaFieldsChange={setSchemaFields}
              onChange={(nodes) => {
                const pattern = '/' + nodes.map((n) => n.value).join('/');
                setFormData({ ...formData, pattern: pattern || '/' });
              }}
              className="mt-0"
            />
            <div className="flex items-center gap-2 px-3 py-2 bg-primary/5 border border-primary/20 rounded-lg text-[10px] font-mono text-primary overflow-hidden">
              <span className="opacity-40 uppercase shrink-0">Ruta Resultante:</span>
              <span className="truncate">{formData.targetPath}/{formData.pattern}</span>
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-border flex flex-col md:flex-row gap-4 items-center justify-between">
          <p className="text-[9px] text-muted-foreground leading-tight max-w-xs">
            <span className="font-bold text-primary">INFO:</span> Se aplicará un sufijo único para evitar colisiones en producción.
          </p>
          <Button
            type="submit"
            disabled={isPending || isSuccess || !formData.integrationId}
            className={`w-full md:w-auto px-10 ${isEditMode ? 'bg-amber-600 hover:bg-amber-700' : 'bg-primary'} text-primary-foreground font-bold uppercase tracking-widest text-[10px] py-6 shadow-lg transition-all`}
          >
            {isPending ? <Loader2 className="size-4 animate-spin" /> : isSuccess ? <Check className="size-4" /> : isEditMode ? 'Actualizar Túnel' : 'Activar Túnel'}
          </Button>
        </div>
      </form>

      {formData.integrationId && (
        <IngestionOperator
          targetPath={formData.targetPath}
          pattern={formData.pattern}
          publicUrl={showPublicLink}
          mode="preview"
        />
      )}
    </div>
  );
}
