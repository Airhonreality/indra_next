'use client';

import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { PortDesigner } from './port-designer';

export function PortDesignerWrapper({ integrations }: { integrations: any[] }) {
  const [isOpen, setIsOpen] = useState(false);

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 bg-zinc-100 hover:bg-white text-black px-6 py-3 rounded-xl font-semibold transition-all shadow-xl shadow-white/5 active:scale-95"
      >
        <Plus className="w-5 h-5" />
        Nuevo Puerto
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
      <div className="relative w-full max-w-6xl max-h-[90vh] overflow-y-auto bg-zinc-950 border border-zinc-800 rounded-3xl p-8 shadow-2xl shadow-cyan-900/10">
        <button
          onClick={() => setIsOpen(false)}
          className="absolute top-6 right-6 p-2 text-zinc-500 hover:text-white bg-zinc-900 rounded-full transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
        
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-white">Diseñador de Puertos Soberanos</h2>
          <p className="text-zinc-500 text-sm">Configura la axiomática y el esquema de ingesta.</p>
        </div>

        <PortDesigner 
          integrations={integrations} 
          onSuccess={() => {
            setIsOpen(false);
            window.location.reload(); // Quick refresh to update the list
          }} 
        />
      </div>
    </div>
  );
}
