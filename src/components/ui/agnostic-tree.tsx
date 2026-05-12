/**
 * 🌳 ARTEFACTO: AgnosticTree.tsx
 * ────────────
 * CAPA: UI / Atoms (Fractal Navigator)
 * VERSIÓN: 1.1.0
 * COMMIT: P3-M3.2-SMART-TREE-COLUMNS
 * 
 * 🎯 FUNCTIONAL_SCOPE:
 * - Proyectar estructuras jerárquicas mediante columnas inteligentes.
 * - Cada columna se hidrata de forma independiente usando el hook 'useInventory'.
 */

import React, { useState, useRef } from 'react';
import { ChevronRight, Folder, File, Loader2, Share2, Search, Database } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useInventory } from '@/hooks/use-inventory';

export interface AgnosticAtom {
  id: string;
  name: string;
  type: 'file' | 'folder';
  rawMimeType?: string;
  isShared?: boolean;
}

interface AgnosticTreeProps {
  integrationId: string;
  onSelect: (atom: AgnosticAtom) => void;
  className?: string;
}

export function AgnosticTree({
  integrationId,
  onSelect,
  className
}: AgnosticTreeProps) {
  const [activePath, setActivePath] = useState<string[]>(['root']);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleItemSelect = (atom: AgnosticAtom, columnIndex: number) => {
    // 1. Update path (truncate if needed)
    const newPath = [...activePath.slice(0, columnIndex + 1), atom.id];
    setActivePath(newPath);

    if (atom.type === 'file') {
      onSelect(atom);
    }

    // 2. Scroll to right to show new column
    setTimeout(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTo({ left: scrollRef.current.scrollWidth, behavior: 'smooth' });
      }
    }, 100);
  };

  return (
    <div 
      ref={scrollRef}
      className={cn(
        "flex h-[400px] w-full overflow-x-auto overflow-y-hidden custom-scrollbar gap-px bg-border/20 rounded-xl border border-border glass-card",
        className
      )}
    >
      {activePath.map((parentId, idx) => (
        <TreeColumn 
          key={`${parentId}-${idx}`}
          integrationId={integrationId}
          parentId={parentId}
          isActive={idx === activePath.length - 1}
          selectedId={activePath[idx + 1]}
          onItemClick={(atom) => handleItemSelect(atom, idx)}
          level={idx}
        />
      ))}
    </div>
  );
}

/**
 * SMART COLUMN COMPONENT
 * Each column manages its own discovery logic.
 */
function TreeColumn({ 
  integrationId, 
  parentId, 
  onItemClick, 
  selectedId, 
  level 
}: { 
  integrationId: string; 
  parentId: string; 
  onItemClick: (atom: AgnosticAtom) => void; 
  selectedId?: string;
  isActive: boolean;
  level: number;
}) {
  const { items, isLoading, error } = useInventory(integrationId, { parentId });

  return (
    <div className="min-w-[240px] w-[240px] h-full bg-background/40 backdrop-blur-sm border-r border-border/50 flex flex-col animate-in slide-in-from-left-2">
      {/* Column Header */}
      <div className="p-3 border-b border-border/30 bg-muted/20 flex items-center justify-between">
        <span className="text-[9px] font-bold uppercase tracking-widest opacity-50 flex items-center gap-2">
          {level === 0 ? <Database className="size-2 text-primary" /> : null}
          {level === 0 ? 'Infrastructure Root' : `Level ${level}`}
        </span>
        {isLoading && <Loader2 className="size-3 animate-spin text-primary" />}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
        {error && (
          <div className="p-4 text-[8px] text-destructive uppercase font-bold text-center">
            {error}
          </div>
        )}
        
        {!isLoading && items.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center opacity-20">
            <Search className="size-8 mb-2" />
            <span className="text-[8px] uppercase font-bold">Empty Node</span>
          </div>
        )}

        {items.map((atom) => {
          const isSelected = selectedId === atom.id;
          return (
            <button
              key={atom.id}
              onClick={() => onItemClick(atom as AgnosticAtom)}
              className={cn(
                "w-full flex items-center justify-between p-2 rounded-lg text-left transition-all group",
                isSelected 
                  ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-[1.02] z-10" 
                  : "hover:bg-muted/50 text-muted-foreground hover:text-foreground"
              )}
            >
              <div className="flex items-center gap-3 overflow-hidden">
                {atom.type === 'folder' ? (
                  <Folder className={cn("size-4 shrink-0", isSelected ? "text-primary-foreground" : "text-primary/60")} />
                ) : (
                  <File className="size-4 shrink-0 opacity-40" />
                )}
                <div className="flex flex-col overflow-hidden">
                  <span className="text-xs font-medium truncate leading-tight">{atom.name}</span>
                  {atom.isShared && (
                    <div className="flex items-center gap-1 text-[7px] uppercase font-bold opacity-60">
                      <Share2 className="size-2" /> Shared
                    </div>
                  )}
                </div>
              </div>
              {atom.type === 'folder' && (
                <ChevronRight className={cn("size-3 shrink-0", isSelected ? "opacity-100" : "opacity-20")} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
