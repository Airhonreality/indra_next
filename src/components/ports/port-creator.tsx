'use client';

/**
 * 🌐 ARTEFACTO: port-creator.tsx
 * ────────────
 * CAPA: UI / Components (Ingestion Orchestrator)
 * VERSIÓN: 3.0.0 (Modularized)
 * 
 * 🎯 FUNCTIONAL_SCOPE:
 * - Orquestador para la creación de Túneles de Ingesta.
 * - Coordina el diseño del portal, esquema de datos y previsualización operativa.
 * 
 * 🛡️ AXIOMATIC_CONTRACT:
 * - MUST: Delegar la lógica de nomenclatura al RoutingService.
 * - MUST: Separar la configuración (Form) de la operación (Operator).
 */

import { useState } from 'react';
import { createIngestionPort } from '@/app/actions/ports';
import { RoutingService } from '@/core/services/routing';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Globe, Loader2, Check, FolderTree, Link } from 'lucide-react';
import { useInventory } from '@/hooks/use-inventory';
import { AgnosticTree } from '@/components/ui/agnostic-tree';
import { IngestionFieldDesigner } from '@/components/ingestion/field-designer';
import { IngestionOperator } from '@/components/ingestion/operator';

interface PortCreatorProps {
  connections: Array<{ id: string; label: string; type: string; connectionId?: string }>;
  onCreated?: () => void;
}

export function PortCreator({ connections, onCreated }: PortCreatorProps) {
  const [isPending, setIsPending] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [showPublicLink, setShowPublicLink] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    label: '',
    slug: '',
    integrationId: '',
    targetPath: 'root',
    pattern: '/{year}/{month}/{project}'
  });

  const [schemaFields, setSchemaFields] = useState<any[]>([
    { key: 'project', type: 'string', label: 'Nombre del Proyecto', required: true }
  ]);

  const handleNameChange = (val: string) => {
    const slug = RoutingService.generateSlug(val);
    setFormData(prev => ({ ...prev, label: val, slug }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsPending(true);
    
    try {
      await createIngestionPort({
        ...formData,
        config: { pattern: formData.pattern },
        schema: schemaFields
      });
      
      const publicUrl = `${window.location.origin}/p/${formData.slug}`;
      setIsSuccess(true);
      setShowPublicLink(publicUrl);
      
      setTimeout(() => {
        setIsSuccess(false);
        onCreated?.();
      }, 2000);
    } catch (err) {
      alert('Error: ' + (err as Error).message);
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="p-8 rounded-xl bg-card border border-border shadow-sm space-y-6 animate-in fade-in slide-in-from-bottom-2">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <div className="size-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Globe className="size-4 text-primary" />
            </div>
            <h3 className="text-lg font-bold tracking-tight uppercase tracking-widest">Diseñador de Túneles</h3>
          </div>
          <span className="text-[9px] font-mono opacity-40 uppercase tracking-tighter">v3.0 Sovereign Hub</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* IDENTIDAD */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Nombre del Portal</Label>
              <Input 
                placeholder="Ej: Recepción de Activos" 
                value={formData.label}
                onChange={e => handleNameChange(e.target.value)}
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
                  className="w-full h-10 px-3 rounded-md bg-muted border border-border text-sm outline-none focus:ring-1 focus:ring-primary"
                  value={formData.integrationId}
                  onChange={e => setFormData({ ...formData, integrationId: e.target.value })}
                  required
                >
                  <option value="">-- Seleccionar Silo --</option>
                  {connections.filter(c => c.connectionId).map(c => (
                    <option key={c.id} value={c.id}>{c.label} ({c.type})</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                  <FolderTree className="size-3" /> Template de Ruta
                </Label>
                <Input 
                  value={formData.pattern}
                  onChange={e => setFormData({ ...formData, pattern: e.target.value })}
                  className="bg-muted border-border font-mono text-[10px]"
                  required
                />
              </div>
          </div>
        </div>

        {formData.integrationId && (
          <div className="pt-4 border-t border-border/50 space-y-4">
            <Label className="text-[10px] font-bold uppercase tracking-widest text-primary">Punto de Inyección (Navegador Fractal)</Label>
            <AgnosticTree 
              integrationId={formData.integrationId}
              onSelect={(atom) => setFormData({ ...formData, targetPath: atom.id })}
              className="h-[200px]"
            />
          </div>
        )}

        <div className="pt-4 border-t border-border/50">
          <IngestionFieldDesigner 
            fields={schemaFields}
            onChange={setSchemaFields}
          />
        </div>

        <div className="pt-4 border-t border-border flex flex-col md:flex-row gap-4 items-center justify-between">
           <p className="text-[9px] text-muted-foreground leading-tight max-w-xs">
             <span className="font-bold text-primary">INFO:</span> Se aplicará un sufijo único para evitar colisiones en producción.
           </p>
           <Button 
            type="submit" 
            disabled={isPending || isSuccess || !formData.integrationId}
            className="w-full md:w-auto px-10 bg-primary text-primary-foreground font-bold uppercase tracking-widest text-[10px] py-6 shadow-lg shadow-primary/20"
          >
            {isPending ? <Loader2 className="size-4 animate-spin" /> : isSuccess ? <Check className="size-4" /> : 'Activar Túnel'}
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
