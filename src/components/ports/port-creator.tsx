'use client';

/**
 * PORT CREATOR COMPONENT
 * Administrative UI for generating public Ingestion Ports.
 * Connects a public slug to a specific Storage Connection and Target Path.
 */

import { useState } from 'react';
import { createIngestionPort } from '@/app/actions/ports';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Globe, Loader2, Check } from 'lucide-react';

interface PortCreatorProps {
  connections: Array<{ id: string; label: string; type: string }>;
  onCreated?: () => void;
}

export function PortCreator({ connections, onCreated }: PortCreatorProps) {
  const [isPending, setIsPending] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [formData, setFormData] = useState({
    label: '',
    slug: '',
    integrationId: '',
    targetPath: 'root'
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsPending(true);
    
    try {
      await createIngestionPort({
        ...formData,
        config: {},
        schema: [
          { key: 'name', type: 'string', label: 'File Name', required: true }
        ]
      });
      setIsSuccess(true);
      setTimeout(() => {
        setIsSuccess(false);
        setFormData({ label: '', slug: '', integrationId: '', targetPath: 'root' });
        onCreated?.();
      }, 2000);
    } catch (err) {
      alert('Error creating port: ' + (err as Error).message);
    } finally {
      setIsPending(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-8 rounded-xl bg-card border border-border shadow-sm space-y-6">
      <div className="flex items-center gap-4 mb-4">
        <div className="size-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
          <Globe className="size-4 text-primary" />
        </div>
        <h3 className="text-lg font-bold tracking-tight uppercase tracking-widest">Configurar Nuevo Portal</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Nombre del Portal</Label>
          <Input 
            placeholder="Ej: Ingesta de Producción" 
            value={formData.label}
            onChange={e => setFormData({ ...formData, label: e.target.value })}
            className="bg-muted border-border"
            required
          />
        </div>
        <div className="space-y-2">
          <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Identificador (Slug)</Label>
          <Input 
            placeholder="mi-proyecto-2026" 
            value={formData.slug}
            onChange={e => setFormData({ ...formData, slug: e.target.value })}
            className="bg-muted border-border"
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Conexión de Destino</Label>
        <select 
          className="w-full h-10 px-3 rounded-md bg-muted border border-border text-sm"
          value={formData.integrationId}
          onChange={e => setFormData({ ...formData, integrationId: e.target.value })}
          required
        >
          <option value="">-- Seleccionar Conexión --</option>
          {connections.map(c => (
            <option key={c.id} value={c.id}>{c.label} ({c.type})</option>
          ))}
        </select>
      </div>

      <Button 
        type="submit" 
        disabled={isPending || isSuccess}
        className="w-full bg-primary text-primary-foreground hover:opacity-90 font-bold uppercase tracking-widest text-[10px] py-6"
      >
        {isPending ? <Loader2 className="size-4 animate-spin" /> : isSuccess ? <Check className="size-4" /> : 'Activar Portal Público'}
      </Button>
    </form>
  );
}
