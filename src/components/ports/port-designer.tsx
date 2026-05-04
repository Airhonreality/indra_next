'use client';

import React, { useState } from 'react';
import { Plus, Trash2, Globe, Settings, Database, Folder, ChevronRight, Save, Layout, FileText, Calendar } from 'lucide-react';
import type { PortConfig, PortFieldSchema } from '@/core/db/schema';
import { createIngestionPort } from '@/app/actions/ports';

interface PortDesignerProps {
  integrations: { id: string; label: string; type: string }[];
  onSuccess?: () => void;
}

export function PortDesigner({ integrations, onSuccess }: PortDesignerProps) {
  const [label, setLabel] = useState('');
  const [slug, setSlug] = useState('');
  const [integrationId, setIntegrationId] = useState(integrations[0]?.id || '');
  const [targetPath, setTargetPath] = useState('root');
  const [pattern, setPattern] = useState('/{capture_date}/{file_name}');
  const [schema, setSchema] = useState<PortFieldSchema[]>([
    { key: 'nombre_proyecto', label: 'Nombre del Proyecto', type: 'string', required: true }
  ]);
  const [isSaving, setIsSaving] = useState(false);

  const addField = () => {
    const key = `field_${Date.now()}`;
    setSchema([...schema, { key, label: 'Nuevo Campo', type: 'string', required: false }]);
  };

  const removeField = (index: number) => {
    setSchema(schema.filter((_, i) => i !== index));
  };

  const updateField = (index: number, patch: Partial<PortFieldSchema>) => {
    const next = [...schema];
    next[index] = { ...next[index], ...patch };
    setSchema(next);
  };

  const handleSave = async () => {
    if (!label || !slug || !integrationId) return;
    setIsSaving(true);
    try {
      await createIngestionPort({
        label,
        slug,
        integrationId,
        targetPath,
        config: { pattern },
        schema
      });
      onSuccess?.();
    } catch (err) {
      alert('Error al guardar el puerto');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* ── Configuration Panel ── */}
      <div className="lg:col-span-7 space-y-6">
        <section className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 backdrop-blur-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-cyan-500/10 rounded-lg">
              <Settings className="w-5 h-5 text-cyan-400" />
            </div>
            <h2 className="text-lg font-semibold text-white">Configuración del Puerto</h2>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Nombre del Puerto</label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Ej: Ingesta Clientes VIP"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/20 transition-all"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">URL Slug (Público)</label>
              <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5">
                <span className="text-zinc-600 text-sm mr-1">/p/</span>
                <input
                  type="text"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  placeholder="slug-unico"
                  className="bg-transparent text-sm text-white focus:outline-none w-full"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mt-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Silo de Destino</label>
              <select
                value={integrationId}
                onChange={(e) => setIntegrationId(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none"
              >
                {integrations.map(i => (
                  <option key={i.id} value={i.id}>{i.label} ({i.type})</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">ID Carpeta Raíz</label>
              <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5">
                <Folder className="w-4 h-4 text-zinc-600 mr-2" />
                <input
                  type="text"
                  value={targetPath}
                  onChange={(e) => setTargetPath(e.target.value)}
                  className="bg-transparent text-sm text-white focus:outline-none w-full"
                />
              </div>
            </div>
          </div>
        </section>

        {/* ── Axiomatic Pattern ── */}
        <section className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500/10 rounded-lg">
                <Database className="w-5 h-5 text-purple-400" />
              </div>
              <h2 className="text-lg font-semibold text-white">Patrón de Organización</h2>
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4">
              <input
                type="text"
                value={pattern}
                onChange={(e) => setPattern(e.target.value)}
                className="w-full bg-transparent text-lg font-mono text-cyan-400 focus:outline-none"
              />
              <div className="mt-4 flex flex-wrap gap-2">
                {['capture_date', 'file_name', ...schema.map(f => f.key)].map(chip => (
                  <button
                    key={chip}
                    onClick={() => setPattern(prev => `${prev}{${chip}}/`)}
                    className="text-[10px] font-bold uppercase tracking-tighter px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded-md transition-colors"
                  >
                    {`{${chip}}`}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-[11px] text-zinc-500">
              Usa los tokens para crear estructuras de carpetas dinámicas. Indra creará las carpetas automáticamente.
            </p>
          </div>
        </section>
      </div>

      {/* ── Schema Designer ── */}
      <div className="lg:col-span-5 space-y-6">
        <section className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 backdrop-blur-sm flex flex-col h-full">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-500/10 rounded-lg">
                <Layout className="w-5 h-5 text-amber-400" />
              </div>
              <h2 className="text-lg font-semibold text-white">Esquema del Formulario</h2>
            </div>
            <button
              onClick={addField}
              className="p-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-zinc-400 transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-3 flex-1">
            {schema.map((field, idx) => (
              <div key={field.key} className="bg-zinc-950/50 border border-zinc-800/50 rounded-xl p-3 space-y-3 group">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={field.label}
                    onChange={(e) => updateField(idx, { label: e.target.value })}
                    className="bg-transparent text-sm font-medium text-white focus:outline-none flex-1"
                  />
                  <button onClick={() => removeField(idx)} className="opacity-0 group-hover:opacity-100 p-1 text-zinc-600 hover:text-red-400 transition-all">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={field.type}
                    onChange={(e) => updateField(idx, { type: e.target.value as any })}
                    className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-[10px] text-zinc-400"
                  >
                    <option value="string">Texto</option>
                    <option value="number">Número</option>
                    <option value="date">Fecha</option>
                    <option value="select">Selección</option>
                  </select>
                  <label className="flex items-center gap-2 text-[10px] text-zinc-500 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={field.required}
                      onChange={(e) => updateField(idx, { required: e.target.checked })}
                      className="rounded border-zinc-800 bg-zinc-900 text-cyan-500"
                    />
                    Requerido
                  </label>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={handleSave}
            disabled={isSaving || !label || !slug}
            className="w-full mt-6 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-cyan-900/20"
          >
            {isSaving ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save className="w-5 h-5" />}
            Guardar Puerto Soberano
          </button>
        </section>
      </div>
    </div>
  );
}
