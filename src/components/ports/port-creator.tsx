'use client';

/**
 * PORT CREATOR & INGESTION OPERATOR
 * Administrative UI for generating public Ingestion Ports and executing immediate uploads.
 * Implements auto-slug generation, dynamic path templates, and embedded admin ingestion.
 */

import { useState, useEffect } from 'react';
import { createIngestionPort } from '@/app/actions/ports';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Globe, Loader2, Check, ArrowRight, FolderTree, UploadCloud, Link, Copy, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PortCreatorProps {
  connections: Array<{ id: string; label: string; type: string }>;
  onCreated?: () => void;
}

export function PortCreator({ connections, onCreated }: PortCreatorProps) {
  const [isPending, setIsPending] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [showPublicLink, setShowPublicLink] = useState<string | null>(null);
  
  const [availableFolders, setAvailableFolders] = useState<any[]>([]);
  const [isLoadingFolders, setIsLoadingFolders] = useState(false);
  
  const [formData, setFormData] = useState({
    label: '',
    slug: '',
    integrationId: '',
    targetPath: 'root',
    pattern: '/{year}/{month}/{project}' // Routing Engine Template
  });

  const [schemaFields, setSchemaFields] = useState<any[]>([
    { key: 'project', type: 'string', label: 'Nombre del Proyecto', required: true }
  ]);

  // FETCH FOLDERS WHEN CONNECTION CHANGES
  useEffect(() => {
    if (!formData.integrationId) return;
    
    const fetchFolders = async () => {
      setIsLoadingFolders(true);
      try {
        const res = await fetch(`/api/integrations/${formData.integrationId}/inventory`);
        const data = await res.json();
        // Filter only folders (Agnostic Object Format)
        const folders = (data.objects || []).filter((obj: any) => obj.type === 'folder');
        setAvailableFolders(folders);
      } catch (err) {
        console.error('Failed to fetch folders', err);
      } finally {
        setIsLoadingFolders(false);
      }
    };
    
    fetchFolders();
  }, [formData.integrationId]);

  // AUTO-SLUG GENERATION
  const handleNameChange = (val: string) => {
    const slug = val
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    setFormData(prev => ({ ...prev, label: val, slug }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsPending(true);
    
    try {
      await createIngestionPort({
        ...formData,
        config: {
          pattern: formData.pattern
        },
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
      alert('Error creating port: ' + (err as Error).message);
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
            <h3 className="text-lg font-bold tracking-tight uppercase tracking-widest">Ingestion Funnel Designer</h3>
          </div>
          <span className="text-[9px] font-mono opacity-40 uppercase tracking-tighter">v2.1 Routing Engine</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* IDENTIDAD DEL PORTAL */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Nombre Principal del Portal</Label>
              <Input 
                placeholder="Ej: Ingesta Producción" 
                value={formData.label}
                onChange={e => handleNameChange(e.target.value)}
                className="bg-muted border-border font-medium"
                required
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Slug Generado (ReadOnly)</Label>
              <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 border border-border rounded-lg text-xs font-mono text-muted-foreground">
                <Link className="size-3" />
                /p/{formData.slug || '...'}
              </div>
            </div>
          </div>

          {/* TARGET & LOGIC */}
          <div className="space-y-4">
             <div className="space-y-2">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Conexión de Destino (Silo)</Label>
                <select 
                  className="w-full h-10 px-3 rounded-md bg-muted border border-border text-sm"
                  value={formData.integrationId}
                  onChange={e => setFormData({ ...formData, integrationId: e.target.value })}
                  required
                >
                  <option value="">-- Seleccionar Nodo --</option>
                  {connections.map(c => (
                    <option key={c.id} value={c.id}>{c.label} ({c.type})</option>
                  ))}
                </select>
              </div>

              {formData.integrationId && (
                <div className="space-y-2 animate-in slide-in-from-top-2">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Carpeta de Destino (Root)</Label>
                  <select 
                    className="w-full h-10 px-3 rounded-md bg-muted/30 border border-dashed border-border text-xs"
                    value={formData.targetPath}
                    onChange={e => setFormData({ ...formData, targetPath: e.target.value })}
                    required
                  >
                    <option value="root">/ (Directorio Raíz)</option>
                    {availableFolders.map(f => (
                      <option key={f.id} value={f.id}>/{f.name}</option>
                    ))}
                  </select>
                  {isLoadingFolders && <p className="text-[8px] animate-pulse uppercase font-bold text-primary">Descubriendo directorios...</p>}
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                  <FolderTree className="size-3" />
                  Target Path Template (Routing Logic)
                </Label>
                <Input 
                  placeholder="/{year}/{project}" 
                  value={formData.pattern}
                  onChange={e => setFormData({ ...formData, pattern: e.target.value })}
                  className="bg-muted border-border font-mono text-[10px]"
                  required
                />
              </div>
          </div>
        </div>

        {/* SCHEMA DESIGNER SECTION */}
        <div className="space-y-4 pt-4 border-t border-border/50">
          <div className="flex items-center justify-between">
             <Label className="text-[10px] font-bold uppercase tracking-widest text-primary">Esquema de Datos (Formulario Público)</Label>
             <button 
              type="button"
              onClick={() => setSchemaFields([...schemaFields, { key: `field_${Date.now()}`, type: 'string', label: 'Nuevo Campo', required: true }])}
              className="text-[9px] font-bold uppercase tracking-widest px-3 py-1 bg-primary/10 text-primary rounded-full hover:bg-primary/20 transition-all"
             >
               + Añadir Campo
             </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
             {schemaFields.map((field, idx) => (
               <div key={idx} className="flex items-center gap-2 p-2 bg-muted/20 border border-border rounded-lg group">
                  <Input 
                    value={field.label}
                    onChange={e => {
                      const newFields = [...schemaFields];
                      newFields[idx].label = e.target.value;
                      newFields[idx].key = e.target.value.toLowerCase().replace(/\s+/g, '_');
                      setSchemaFields(newFields);
                    }}
                    className="h-8 text-[10px] bg-background"
                  />
                  <select 
                    value={field.type}
                    onChange={e => {
                      const newFields = [...schemaFields];
                      newFields[idx].type = e.target.value;
                      setSchemaFields(newFields);
                    }}
                    className="h-8 text-[10px] bg-background border border-border rounded-md px-1"
                  >
                    <option value="string">Texto</option>
                    <option value="date">Fecha</option>
                    <option value="select">Lista</option>
                  </select>
                  <button 
                    type="button"
                    onClick={() => setSchemaFields(schemaFields.filter((_, i) => i !== idx))}
                    className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <Trash2 className="size-3" />
                  </button>
               </div>
             ))}
          </div>
        </div>

        <div className="pt-4 border-t border-border flex flex-col md:flex-row gap-4 items-center justify-between">
           <p className="text-[9px] text-muted-foreground leading-tight max-w-xs">
             <span className="font-bold text-primary">TIP:</span> Usa variables entre llaves para que Indra cree las carpetas automáticamente basado en la fecha o campos del formulario.
           </p>
           <Button 
            type="submit" 
            disabled={isPending || isSuccess || !formData.integrationId}
            className="w-full md:w-auto px-10 bg-primary text-primary-foreground hover:opacity-90 font-bold uppercase tracking-widest text-[10px] py-6 shadow-lg shadow-primary/20"
          >
            {isPending ? <Loader2 className="size-4 animate-spin" /> : isSuccess ? <Check className="size-4" /> : 'Activar Configuración de Ingesta'}
          </Button>
        </div>
      </form>

      {/* EMBEDDED INGESTION OPERATOR (Admin Mode) */}
      {formData.integrationId && (
        <div className="p-8 rounded-xl bg-primary/5 border border-primary/10 border-dashed space-y-6 animate-in zoom-in-95 duration-500">
           <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <UploadCloud className="size-5 text-primary" />
                <h4 className="text-xs font-bold uppercase tracking-widest">Operador de Ingesta Inmediata</h4>
              </div>
              {showPublicLink && (
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(showPublicLink);
                    alert('URL pública copiada');
                  }}
                  className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-widest text-primary hover:underline"
                >
                  <Copy className="size-3" />
                  Compartir URL Pública
                </button>
              )}
           </div>

           <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="md:col-span-1 space-y-4">
                 <p className="text-[10px] text-muted-foreground italic">
                   Configuración activa: Subiendo a <span className="font-bold text-foreground">{formData.targetPath}{formData.pattern}</span>
                 </p>
                 <div className="space-y-2">
                    <Label className="text-[9px] font-bold uppercase tracking-widest opacity-50">Variable: Project Name</Label>
                    <Input placeholder="Ej: Muebles_2024" className="h-8 text-xs bg-background" />
                 </div>
              </div>
              <div className="md:col-span-2">
                 <div className="h-full min-h-[120px] rounded-xl border-2 border-dashed border-primary/20 bg-background/50 flex flex-col items-center justify-center hover:bg-background transition-all cursor-pointer group">
                    <UploadCloud className="size-8 text-muted-foreground group-hover:text-primary transition-colors mb-2" />
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground group-hover:text-foreground">Arrastra aquí para subir "A tu antojo"</p>
                    <p className="text-[8px] text-muted-foreground/60 mt-1">Se aplicará la lógica: {formData.pattern}</p>
                 </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
}

