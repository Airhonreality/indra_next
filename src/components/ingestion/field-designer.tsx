'use client';

import { Trash2, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { FieldSchema } from '@/core/types/integration';

interface Field {
  key: string;
  type: FieldSchema['type'];
  label: string;
  required?: boolean;
}

interface IngestionFieldDesignerProps {
  fields: Field[];
  onChange: (fields: Field[]) => void;
}

export function IngestionFieldDesigner({ fields, onChange }: IngestionFieldDesignerProps) {
  const addField = () => {
    const newField: Field = {
      key: `field_${Date.now()}`,
      type: 'string',
      label: 'Nuevo Campo',
      required: true,
    };
    onChange([...fields, newField]);
  };

  const removeField = (idx: number) => {
    onChange(fields.filter((_, i) => i !== idx));
  };

  const updateField = (idx: number, updates: Partial<Field>) => {
    const newFields = [...fields];
    newFields[idx] = { ...newFields[idx], ...updates };

    if (updates.label) {
      newFields[idx].key = updates.label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    }

    onChange(newFields);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="text-[10px] font-bold uppercase tracking-widest text-primary">Esquema de Datos (Campos del Formulario)</Label>
        <button
          type="button"
          onClick={addField}
          className="text-[9px] font-bold uppercase tracking-widest px-3 py-1 bg-primary/10 text-primary rounded-full hover:bg-primary/20 transition-all"
        >
          <Plus className="size-3 inline mr-1" /> Añadir Campo
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {fields.map((field, idx) => (
          <div key={idx} className="flex items-center gap-2 p-2 bg-muted/20 border border-border rounded-lg group animate-in fade-in slide-in-from-left-2">
            <Input
              value={field.label}
              onChange={(e) => updateField(idx, { label: e.target.value })}
              className="h-8 text-[10px] bg-background"
              placeholder="Nombre del campo"
            />
            <select
              value={field.type}
              onChange={(e) => updateField(idx, { type: e.target.value as FieldSchema['type'] })}
              className="h-8 text-[10px] bg-background border border-border rounded-md px-1 outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="string">Texto</option>
              <option value="date">Fecha</option>
              <option value="number">Número</option>
              <option value="select">Lista</option>
            </select>
            <button
              type="button"
              onClick={() => removeField(idx)}
              className="p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all"
            >
              <Trash2 className="size-3" />
            </button>
          </div>
        ))}
      </div>
      {fields.length === 0 && (
        <p className="text-[10px] text-muted-foreground italic text-center py-4 border border-dashed border-border rounded-lg">
          No hay campos definidos. El portal solo recibirá archivos.
        </p>
      )}
    </div>
  );
}
