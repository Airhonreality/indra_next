'use client';

import React from 'react';
import { Globe, Trash2, ExternalLink, Power, PowerOff, Copy, Check } from 'lucide-react';
import { deleteIngestionPort, updateIngestionPort } from '@/app/actions/ports';
import { useState } from 'react';

interface PortListProps {
  ports: any[];
}

export function PortList({ ports }: PortListProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyUrl = (slug: string, id: string) => {
    const url = `${window.location.origin}/p/${slug}`;
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const togglePort = async (id: string, current: boolean) => {
    await updateIngestionPort(id, { isActive: !current });
  };

  const handleDelete = async (id: string) => {
    if (confirm('¿Estás seguro de eliminar este puerto? Esta acción no se puede deshacer.')) {
      await deleteIngestionPort(id);
    }
  };

  if (ports.length === 0) {
    return (
      <div className="bg-zinc-900/30 border border-dashed border-zinc-800 rounded-2xl p-12 text-center">
        <Globe className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
        <h3 className="text-zinc-400 font-medium">No hay puertos de ingesta activos</h3>
        <p className="text-zinc-600 text-sm mt-1">Crea tu primer puerto para empezar a recibir contenido.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden bg-zinc-900/50 border border-zinc-800 rounded-2xl backdrop-blur-sm">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-zinc-800/50">
            <th className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Puerto</th>
            <th className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Destino</th>
            <th className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Slug</th>
            <th className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest text-right">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/50">
          {ports.map((port) => (
            <tr key={port.id} className="group hover:bg-white/[0.02] transition-colors">
              <td className="px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${port.isActive ? 'bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.5)]' : 'bg-zinc-700'}`} />
                  <span className="text-sm font-medium text-white">{port.label}</span>
                </div>
              </td>
              <td className="px-6 py-4">
                <div className="flex items-center gap-2 text-zinc-400">
                  <span className="text-xs font-mono">{port.targetPath.slice(0, 12)}...</span>
                </div>
              </td>
              <td className="px-6 py-4">
                <button
                  onClick={() => copyUrl(port.slug, port.id)}
                  className="flex items-center gap-2 text-xs font-mono text-zinc-500 hover:text-cyan-400 transition-colors"
                >
                  /p/{port.slug}
                  {copiedId === port.id ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                </button>
              </td>
              <td className="px-6 py-4 text-right">
                <div className="flex items-center justify-end gap-2">
                  <a
                    href={`/p/${port.slug}`}
                    target="_blank"
                    className="p-2 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-lg transition-all"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                  <button
                    onClick={() => togglePort(port.id, port.isActive)}
                    className={`p-2 rounded-lg transition-all ${port.isActive ? 'text-zinc-500 hover:text-amber-400 hover:bg-amber-400/10' : 'text-zinc-500 hover:text-green-400 hover:bg-green-400/10'}`}
                  >
                    {port.isActive ? <PowerOff className="w-4 h-4" /> : <Power className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => handleDelete(port.id)}
                    className="p-2 text-zinc-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
