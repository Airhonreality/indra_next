'use client';

import { useState } from 'react';
import { Plus, Trash2, Save, Loader2, Database } from 'lucide-react';
import type { FieldSchema } from '@/core/types/integration';

interface SchemaManagerProps {
  integrationId: string;
  currentSchema: FieldSchema[];
  onUpdate: () => void;
}

export function SchemaManager({ integrationId, currentSchema, onUpdate }: SchemaManagerProps) {
  const [fields, setFields] = useState<FieldSchema[]>(currentSchema || []);
  const [loading, setLoading] = useState(false);

  const addField = () => {
    const newField: FieldSchema = {
      key: `field_${Date.now()}`,
      type: 'string',
      label: 'New Field',
      required: false
    };
    setFields([...fields, newField]);
  };

  const removeField = (index: number) => {
    setFields(fields.filter((_, i) => i !== index));
  };

  const updateField = (index: number, updates: Partial<FieldSchema>) => {
    const newFields = [...fields];
    newFields[index] = { ...newFields[index], ...updates };
    setFields(newFields);
  };

  const saveSchema = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/integrations/${integrationId}/schema`, {
        method: 'PATCH',
        body: JSON.stringify({ dynamicSchema: fields })
      });
      if (!res.ok) throw new Error('Failed to save schema');
      onUpdate();
    } catch (err) {
      console.error(err);
      alert('Error saving schema');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-4 shadow-sm">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <Database className="size-4 text-primary" />
          <h3 className="text-sm font-bold uppercase tracking-tighter">Dynamic Schema Manager</h3>
        </div>
        <button
          onClick={addField}
          className="p-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-all"
        >
          <Plus className="size-4" />
        </button>
      </div>

      <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
        {fields.map((field, index) => (
          <div key={index} className="group relative flex flex-col gap-3 p-4 rounded-xl bg-muted/30 border border-border/50 hover:border-primary/30 transition-all animate-in fade-in slide-in-from-bottom-2">
            <div className="flex items-center justify-between">
               <span className="text-[8px] font-black uppercase tracking-[0.2em] text-primary/60">Field Instance #{index + 1}</span>
               <button
                  onClick={() => removeField(index)}
                  className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-all opacity-0 group-hover:opacity-100"
                >
                  <Trash2 className="size-3" />
                </button>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-[9px] font-bold uppercase tracking-widest opacity-40">Label Name</p>
                <input
                  placeholder="Ej: Nombre Proyecto"
                  className="w-full bg-background border border-border/60 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-primary outline-none transition-all"
                  value={field.label}
                  onChange={e => updateField(index, { label: e.target.value, key: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                />
              </div>
              <div className="space-y-1">
                <p className="text-[9px] font-bold uppercase tracking-widest opacity-40">Data Type</p>
                <select
                  className="w-full bg-background border border-border/60 rounded-lg px-2 py-2 text-xs focus:ring-1 focus:ring-primary outline-none appearance-none"
                  value={field.type}
                  onChange={e => updateField(index, { type: e.target.value as any })}
                >
                  <option value="string">STRING (Text)</option>
                  <option value="number">NUMBER (Int/Float)</option>
                  <option value="boolean">BOOLEAN (Yes/No)</option>
                  <option value="date">DATE (ISO-8601)</option>
                </select>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
               <div className="flex items-center gap-2 px-2 py-1 bg-primary/5 border border-primary/10 rounded-md">
                 <span className="text-[8px] font-mono text-primary uppercase">Slug Key:</span>
                 <span className="text-[8px] font-mono text-muted-foreground">{field.key}</span>
               </div>
            </div>
          </div>
        ))}
        {fields.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 bg-muted/10 rounded-2xl border border-dashed border-border opacity-40">
             <Database className="size-8 mb-2" />
             <p className="text-xs uppercase font-bold tracking-widest">No definitions found</p>
          </div>
        )}
      </div>

      <button
        onClick={saveSchema}
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-lg py-2 text-xs font-bold uppercase tracking-widest hover:opacity-90 transition-all"
      >
        {loading ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
        Persist Schema Changes
      </button>
    </div>
  );
}
