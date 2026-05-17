/**
 * 🏛️ ARTEFACTO: rule-architect.tsx
 * ────────────
 * CAPA: Components / Routing (Agnostic Namespace Architecture)
 * VERSIÓN: 5.0.0
 * COMMIT: P4-M12.5-RECURSIVE-PATH-TREE-ARCHITECT
 * 
 * 🎯 FUNCTIONAL_SCOPE:
 * - Diseñador de arquitectura de namespace ultra-intuitivo basado en árbol recursivo de desplegables.
 * - Elimina la barra de botones fijos (+FECHA, +VARIABLE, etc.) para priorizar la anidación dinámica.
 * - Soporte para inyección inline de campos dinámicos (Custom Fields) autogenerados.
 * - Sincronización bidireccional reactiva con el esquema de datos del formulario de ingesta público.
 * 
 * 🛡️ AXIOMATIC_CONTRACT:
 * - MUST: Auto-desplegar un siguiente nivel (Lvl N+1) vacío inmediatamente al poblar el nivel actual.
 * - NEVER: Forzar variables de estilo o clases cromáticas fuera del esquema grayscale/tokens nativos de Indra.
 * - ALWAYS: Mantener limpia la composición del patrón de rutas resultante resolviendo slugs únicos.
 */

'use client';

import React, { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import {
  Trash2,
  ChevronRight,
  Calendar,
  Variable,
  Settings2,
  Database,
  Sparkles,
  Plus
} from 'lucide-react';
import { type PortSchemaField } from '@/stores/indra-store';

export type RuleBlockType = 'date' | 'variable' | 'custom';

export interface RuleNode {
  id: string;
  type: RuleBlockType;
  value: string; // e.g. '{year}', '{project}', '{articulo}'
  label: string; // e.g. 'Año', 'Nombre del Proyecto', 'Artículo'
  isCustom?: boolean;
}

interface RuleArchitectProps {
  initialRules?: RuleNode[];
  availableFields?: Array<{ id: string, label: string }>;
  schemaFields?: PortSchemaField[];
  onSchemaFieldsChange?: (fields: PortSchemaField[]) => void;
  basePath?: string;
  onChange?: (rules: RuleNode[]) => void;
  className?: string;
}

export function RuleArchitect({ 
  initialRules = [], 
  availableFields = [],
  schemaFields = [],
  onSchemaFieldsChange,
  basePath = 'root',
  onChange, 
  className 
}: RuleArchitectProps) {
  // Parse initial rules or fallback to a single empty placeholder node
  const [nodes, setNodes] = useState<RuleNode[]>(() => {
    if (initialRules.length > 0) return initialRules;
    return [];
  });

  // Track the inline editing state for custom variables at each index
  const [customInputs, setCustomInputs] = useState<Record<number, string>>({});

  // Helper to slugify custom variable names
  const slugify = (text: string) => {
    return text
      .toLowerCase()
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9_-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  };

  // Synchronize dynamic nodes with the parent callback
  const updateNodes = (newNodes: RuleNode[]) => {
    setNodes(newNodes);
    onChange?.(newNodes.filter(n => n.value !== ''));
  };

  const handleSelectChange = (index: number, val: string) => {
    const newNodes = [...nodes];

    if (val === '') {
      // Clear this node and truncate any child levels
      const updated = newNodes.slice(0, index);
      updateNodes(updated);
      return;
    }

    if (val === 'CREATE_NEW') {
      // Put in custom creation mode
      newNodes[index] = {
        id: Math.random().toString(36).substring(2, 9),
        type: 'custom',
        value: '',
        label: '',
        isCustom: true
      };
      setCustomInputs(prev => ({ ...prev, [index]: '' }));
      updateNodes(newNodes);
      return;
    }

    // Built-in date selection
    const dateOptions: Record<string, string> = {
      '{year}': 'Año',
      '{month}': 'Mes',
      '{day}': 'Día',
      '{hour}': 'Hora',
      '{minute}': 'Minuto'
    };

    if (dateOptions[val]) {
      newNodes[index] = {
        id: Math.random().toString(36).substring(2, 9),
        type: 'date',
        value: val,
        label: dateOptions[val]
      };
      // Clean custom input state for this index
      setCustomInputs(prev => {
        const c = { ...prev };
        delete c[index];
        return c;
      });
      updateNodes(newNodes);
      return;
    }

    // Existing Field selection
    const matchedField = availableFields.find(f => `{${f.id}}` === val);
    if (matchedField) {
      newNodes[index] = {
        id: Math.random().toString(36).substring(2, 9),
        type: 'variable',
        value: val,
        label: matchedField.label
      };
      setCustomInputs(prev => {
        const c = { ...prev };
        delete c[index];
        return c;
      });
      updateNodes(newNodes);
    }
  };

  const handleCustomNameChange = (index: number, text: string) => {
    setCustomInputs(prev => ({ ...prev, [index]: text }));

    const slug = slugify(text);
    if (!slug) return;

    const newNodes = [...nodes];
    newNodes[index] = {
      ...newNodes[index],
      value: `{${slug}}`,
      label: text
    };
    updateNodes(newNodes);

    // Dynamic schema field registration (Instant integration with the ingestion form!)
    if (onSchemaFieldsChange && schemaFields) {
      const keyExists = schemaFields.some(f => f.key === slug);
      if (!keyExists) {
        const newField: PortSchemaField = {
          key: slug,
          type: 'string',
          label: text,
          required: false
        };
        // Insert or update
        onSchemaFieldsChange([...schemaFields, newField]);
      } else {
        // Update label dynamically as they type
        const updated = schemaFields.map(f => f.key === slug ? { ...f, label: text } : f);
        onSchemaFieldsChange(updated);
      }
    }
  };

  const removeNode = (index: number) => {
    const newNodes = nodes.filter((_, i) => i !== index);
    setCustomInputs(prev => {
      const c = { ...prev };
      delete c[index];
      return c;
    });
    updateNodes(newNodes);
  };

  // Auto-extend logic: If all nodes in sequence have valid values, append an empty choice
  const activeNodes = nodes.filter(n => n.value !== '');
  const showPlaceholderLevel = nodes.length === activeNodes.length;

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {/* MINIMAL HUD HEADER */}
      <div className="flex items-center justify-between mb-1 pb-2 border-b border-border/40">
        <h4 className="text-[10px] font-bold uppercase tracking-widest text-foreground flex items-center gap-2">
          <Settings2 className="size-3 text-primary animate-spin" style={{ animationDuration: '6s' }} />
          DISEÑADOR DE RUTAS RECURSIVO
        </h4>
        <span className="text-[8px] font-mono text-muted-foreground uppercase bg-muted/40 px-2 py-0.5 rounded border border-border">
          FRACTAL TREE INGEST
        </span>
      </div>

      <div className="flex items-start gap-4 overflow-x-auto pb-4 custom-scrollbar min-h-[180px]">
        {/* PHYSICAL ROOT ANCHOR */}
        <div className="min-w-[170px] bg-muted/20 border border-border/60 border-dashed rounded-xl p-4 flex flex-col justify-center items-center text-center opacity-70">
          <Database className="size-4 text-muted-foreground/60 mb-2" />
          <p className="text-[7px] uppercase font-black tracking-widest text-muted-foreground mb-1">Origen Físico</p>
          <p className="text-[9px] font-mono truncate w-full px-2" title={basePath}>/{basePath}</p>
        </div>

        {/* HORIZONTAL FRACTAL TREE LOOP */}
        {nodes.map((node, index) => {
          const isSelected = node.value !== '';
          const isCustomMode = node.isCustom;

          return (
            <React.Fragment key={node.id || index}>
              <div className="flex items-center text-muted-foreground/30"><ChevronRight className="size-3 shrink-0" /></div>
              
              <div className={cn(
                "min-w-[210px] bg-card border rounded-xl p-3.5 shadow-sm transition-all duration-300 relative group animate-in slide-in-from-left-2",
                node.isCustom ? "border-amber-500/20 bg-amber-500/[0.01]" : "border-border/80 hover:border-border"
              )}>
                <div className="flex items-center justify-between mb-2.5">
                  <Badge variant="outline" className={cn(
                    "text-[7px] tracking-widest uppercase font-bold",
                    node.isCustom ? "border-amber-500/30 text-amber-500 bg-amber-500/5" : "border-border"
                  )}>
                    LVL {index + 1}
                  </Badge>
                  {isSelected && (
                    <button 
                      type="button"
                      onClick={() => removeNode(index)} 
                      className="text-muted-foreground/40 hover:text-destructive transition-colors"
                      title="Eliminar nivel"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  )}
                </div>

                <div className="space-y-2">
                  <select 
                    className="w-full bg-background border border-border/80 rounded-lg px-2 py-1.5 text-[10px] outline-none font-medium focus:border-primary/80 transition-colors"
                    value={isCustomMode ? 'CREATE_NEW' : node.value}
                    onChange={(e) => handleSelectChange(index, e.target.value)}
                  >
                    <option value="">-- Seleccionar Opción --</option>
                    
                    <optgroup label="Fecha / Tiempo">
                      <option value="{year}">Año</option>
                      <option value="{month}">Mes</option>
                      <option value="{day}">Día</option>
                      <option value="{hour}">Hora</option>
                      <option value="{minute}">Minuto</option>
                    </optgroup>

                    {availableFields.length > 0 && (
                      <optgroup label="Campos de Ingesta">
                        {availableFields.map(f => (
                          <option key={f.id} value={`{${f.id}}`}>{f.label}</option>
                        ))}
                      </optgroup>
                    )}

                    <optgroup label="Especial">
                      <option value="CREATE_NEW" className="text-amber-500 font-bold">+ Crear Nuevo Campo...</option>
                    </optgroup>
                  </select>

                  {/* INLINE CUSTOM VARIABLE FORM */}
                  {isCustomMode && (
                    <div className="space-y-1.5 animate-in slide-in-from-top-1 duration-200">
                      <input 
                        type="text"
                        placeholder="Nombre variable (Ej: Articulo)"
                        className="w-full bg-background border border-amber-500/20 rounded-lg px-2.5 py-1.5 text-[9px] outline-none font-mono focus:border-amber-500/40 transition-colors"
                        value={customInputs[index] ?? ''}
                        onChange={(e) => handleCustomNameChange(index, e.target.value)}
                        autoFocus
                      />
                      <p className="text-[7px] text-amber-500/60 leading-relaxed italic">
                        Inyectará `{slugify(customInputs[index] ?? '') || 'variable'}` en la ruta y creará el input en el formulario público.
                      </p>
                    </div>
                  )}

                  {/* VISUAL ICON LABEL DECORATION */}
                  {isSelected && !isCustomMode && (
                    <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground/80 font-mono tracking-wide mt-1 pl-1">
                      {node.type === 'date' ? <Calendar className="size-3 text-primary/80" /> : <Variable className="size-3 text-amber-500/80" />}
                      <span>{node.value}</span>
                    </div>
                  )}
                </div>
              </div>
            </React.Fragment>
          );
        })}

        {/* 🏛️ AUTO-SPAWNED NEXT LEVEL DROP-DOWN PLACEHOLDER */}
        {showPlaceholderLevel && (
          <React.Fragment>
            <div className="flex items-center text-muted-foreground/15"><ChevronRight className="size-3 shrink-0" /></div>
            
            <div className="min-w-[210px] bg-muted/5 border border-dashed border-border/40 rounded-xl p-3.5 flex flex-col justify-center animate-in fade-in duration-300">
              <div className="flex items-center justify-between mb-2.5">
                <Badge variant="outline" className="text-[7px] tracking-widest uppercase font-bold opacity-30">
                  LVL {nodes.length + 1}
                </Badge>
                <Plus className="size-3 opacity-15" />
              </div>

              <select 
                className="w-full bg-background border border-dashed border-border/50 rounded-lg px-2 py-1.5 text-[10px] outline-none font-medium opacity-50 focus:opacity-100 transition-all cursor-pointer"
                value=""
                onChange={(e) => {
                  if (e.target.value !== '') {
                    // Initialize this level
                    const newNodes: RuleNode[] = [...nodes, {
                      id: Math.random().toString(36).substring(2, 9),
                      type: 'date' as const,
                      value: '',
                      label: ''
                    }];
                    setNodes(newNodes);
                    // trigger selection logic
                    setTimeout(() => handleSelectChange(nodes.length, e.target.value), 50);
                  }
                }}
              >
                <option value="">+ Añadir Paso...</option>
                
                <optgroup label="Fecha / Tiempo">
                  <option value="{year}">Año</option>
                  <option value="{month}">Mes</option>
                  <option value="{day}">Día</option>
                  <option value="{hour}">Hora</option>
                  <option value="{minute}">Minuto</option>
                </optgroup>

                {availableFields.length > 0 && (
                  <optgroup label="Campos de Ingesta">
                    {availableFields.map(f => (
                      <option key={f.id} value={`{${f.id}}`}>{f.label}</option>
                    ))}
                  </optgroup>
                )}

                <optgroup label="Especial">
                  <option value="CREATE_NEW" className="text-amber-500 font-bold">+ Crear Nuevo Campo...</option>
                </optgroup>
              </select>
            </div>
          </React.Fragment>
        )}
      </div>
    </div>
  );
}
