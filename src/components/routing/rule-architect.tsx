'use client';

import React, { useState } from 'react';
import { 
  Plus, 
  Trash2, 
  ChevronRight, 
  Calendar, 
  Folder, 
  Variable, 
  Settings2,
  CalendarDays,
  CalendarRange
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type RuleBlockType = 'date' | 'variable' | 'static' | 'filter';

export interface RuleNode {
  id: string;
  type: RuleBlockType;
  value: string;
  label: string;
}

interface RuleArchitectProps {
  initialRules?: RuleNode[];
  onChange?: (rules: RuleNode[]) => void;
  className?: string;
}

export function RuleArchitect({ initialRules = [], onChange, className }: RuleArchitectProps) {
  const [rules, setRules] = useState<RuleNode[]>(initialRules);

  const addRule = (type: RuleBlockType) => {
    const newRule: RuleNode = {
      id: Math.random().toString(36).substr(2, 9),
      type,
      value: type === 'date' ? '{year}/{month}' : '',
      label: type === 'date' ? 'Time-based' : 'New Rule'
    };
    const updated = [...rules, newRule];
    setRules(updated);
    onChange?.(updated);
  };

  const removeRule = (id: string) => {
    const updated = rules.filter(r => r.id !== id);
    setRules(updated);
    onChange?.(updated);
  };

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-[10px] font-bold uppercase tracking-widest text-primary/60 flex items-center gap-2">
          <Settings2 className="size-3" />
          Rule Architecture HUD
        </h4>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            type="button"
            className="h-7 text-[9px] uppercase tracking-tighter"
            onClick={() => addRule('date')}
          >
            <CalendarDays className="size-3 mr-1" /> + Fecha
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            type="button"
            className="h-7 text-[9px] uppercase tracking-tighter"
            onClick={() => addRule('static')}
          >
            <Folder className="size-3 mr-1" /> + Carpeta
          </Button>
        </div>
      </div>

      <div className="flex items-start gap-4 overflow-x-auto pb-4 custom-scrollbar min-h-[160px]">
        {/* Renderizado de Columnas (Fractal Mode) */}
        {rules.map((rule, index) => (
          <React.Fragment key={rule.id}>
            <div className="min-w-[200px] bg-card border border-border rounded-xl p-4 shadow-sm animate-in slide-in-from-left-4 duration-300">
              <div className="flex items-center justify-between mb-3">
                <Badge variant="outline" className="text-[8px] uppercase tracking-widest bg-primary/5">
                  Lvl {index + 1}
                </Badge>
                <button 
                  type="button"
                  onClick={() => removeRule(rule.id)} 
                  className="text-destructive/50 hover:text-destructive transition-colors"
                >
                  <Trash2 className="size-3" />
                </button>
              </div>

              <div className="space-y-3">
                {rule.type === 'date' && (
                  <div className="p-3 bg-muted/50 rounded-lg border border-border space-y-2">
                    <div className="flex items-center gap-2 text-primary">
                      <Calendar className="size-3" />
                      <span className="text-[10px] font-bold uppercase">Time Segment</span>
                    </div>
                    <select 
                      className="w-full bg-background border border-border rounded px-2 py-1 text-[10px] outline-none"
                      value={rule.value}
                      onChange={(e) => {
                        const updated = [...rules];
                        updated[index].value = e.target.value;
                        setRules(updated);
                        onChange?.(updated);
                      }}
                    >
                      <option value="{year}">Solo Año</option>
                      <option value="{year}/{month}">Año / Mes</option>
                      <option value="{year}/{month}/{day}">Año / Mes / Día</option>
                      <option value="{date}">Fecha Completa (ISO)</option>
                    </select>
                  </div>
                )}

                {rule.type === 'static' && (
                  <div className="p-3 bg-muted/50 rounded-lg border border-border space-y-2">
                    <div className="flex items-center gap-2 text-amber-500">
                      <Folder className="size-3" />
                      <span className="text-[10px] font-bold uppercase">Static Folder</span>
                    </div>
                    <input 
                      type="text"
                      className="w-full bg-background border border-border rounded px-2 py-1 text-[10px] outline-none"
                      placeholder="Nombre carpeta..."
                      value={rule.value}
                      onChange={(e) => {
                        const updated = [...rules];
                        updated[index].value = e.target.value;
                        setRules(updated);
                        onChange?.(updated);
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
            {index < rules.length - 1 && (
              <div className="pt-10 flex flex-col items-center opacity-20 shrink-0">
                <ChevronRight className="size-4" />
                <div className="w-[1px] h-full bg-border mt-2" />
              </div>
            )}
          </React.Fragment>
        ))}

        {rules.length === 0 && (
          <div className="w-full h-32 border-2 border-dashed border-border rounded-2xl flex flex-col items-center justify-center text-muted-foreground bg-muted/5">
             <Plus className="size-6 mb-2 opacity-20" />
             <p className="text-[10px] font-bold uppercase tracking-[0.3em] opacity-40 text-center">Add first rule block to start<br/>designing the route namespace</p>
          </div>
        )}
      </div>
    </div>
  );
}
