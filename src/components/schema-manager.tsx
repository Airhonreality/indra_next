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
      name: `field_${Date.now()}`,
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

      <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
        {fields.map((field, index) => (
          <div key={index} className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2 duration-300">
            <input
              placeholder="Field Label"
              className="flex-1 bg-muted border border-border rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              value={field.label}
              onChange={e => updateField(index, { label: e.target.value, name: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
            />
            <select
              className="bg-muted border border-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              value={field.type}
              onChange={e => updateField(index, { type: e.target.value as any })}
            >
              <option value="string">Text</option>
              <option value="number">Number</option>
              <option value="boolean">Boolean</option>
              <option value="date">Date</option>
            </select>
            <button
              onClick={() => removeField(index)}
              className="p-1.5 text-muted-foreground hover:text-destructive transition-colors"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
        {fields.length === 0 && (
          <p className="text-center py-4 text-xs text-muted-foreground italic">No custom fields defined for this silo.</p>
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
