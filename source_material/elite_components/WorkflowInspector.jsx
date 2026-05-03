import React, { useState, useEffect } from 'react';
import { useWorkflow } from './context/WorkflowContext';
import { SlotSelector } from '../../utilities/SlotSelector';
import ArtifactSelector from '../../utilities/ArtifactSelector';
import { IndraIcon } from '../../utilities/IndraIcons';
import { IndraMicroHeader } from '../../utilities/IndraMicroHeader';
import { IndraActionTrigger } from '../../utilities/IndraActionTrigger';

/**
 * =============================================================================
 * COMPONENTE: WorkflowInspector (Escrutinio de Nodo / Gatillo)
 * DOGMA: Micro-Modularidad y Contratos Estrictos
 * =============================================================================
 */

import { useProtocolDiscovery } from './hooks/useProtocolDiscovery';
import { useAtomCatalog } from '../../../hooks/useAtomCatalog';

export function WorkflowInspector() {
    const { 
        workflow, 
        bridge, // Inyectamos el bridge desde el contexto
        selectedStationId, 
        setSelectedStationId, 
        updateStation, 
        updateTrigger, 
        removeStation, 
        removeTrigger 
    } = useWorkflow();

    const { 
        providers: PROVIDER_DICT, 
        protocolsByProvider: PROTOCOL_DICT, 
        getFieldsForProtocol, 
        isLoading: isLoadingDiscovery 
    } = useProtocolDiscovery(bridge);
    
    // ── PERSISTENCIA REACTIVA ──
    // Eliminamos coreUrl/sessionSecret: el bridge ya los contiene encapsulados.

    // --- CATÁLOGO DE ESQUEMAS (CONTRATOS) ---
    const { 
        atoms: availableSchemas, 
        isLoading: isSchemasLoading,
        importAtom: handleImportSchema
    } = useAtomCatalog({ atomClass: 'DATA_SCHEMA' });

    const [showSlotSelector, setShowSlotSelector] = useState(false);
    const [activeParam, setActiveParam] = useState(null);
    
    // UI PREMIUM: SELECTOR DE CONTRATOS (SCHEMAS)
    const [showSchemaPicker, setShowSchemaPicker] = useState(false);
    const [schemaSearch, setSchemaSearch] = useState('');
    const [expandedSchemaId, setExpandedSchemaId] = useState(null);

    const isTrigger = selectedStationId === 'trigger';
    const station = !isTrigger ? (workflow.payload?.stations || []).find(s => s.id === selectedStationId) : null;
    const trigger = isTrigger ? (workflow.payload?.trigger || {}) : null;

    // AXIOMA: Reset de estado transitorio al cambiar de foco
    useEffect(() => {
        setShowSlotSelector(false);
        setActiveParam(null);
        setShowSchemaPicker(false);
        setSchemaSearch('');
        setExpandedSchemaId(null);
    }, [selectedStationId]);

    useEffect(() => {
        const targetTrigger = workflow.payload?.trigger;
        const schemaId = targetTrigger?.source_id || targetTrigger?.schema_id;

        if (schemaId && bridge && (!targetTrigger.fields || targetTrigger.fields.length === 0)) {
            const hydrateTriggerFields = async () => {
                try {
                    const result = await bridge.execute({
                        provider: 'system',
                        protocol: 'ATOM_READ',
                        context_id: schemaId
                    }, { vaultKey: `schema_fields_${schemaId}` });
                    
                    if (result.items && result.items[0]) {
                        const schemaAtom = result.items[0];
                        const fields = schemaAtom.payload?.fields || schemaAtom.raw?.fields || [];
                        updateTrigger({ ...targetTrigger, fields });
                    }
                } catch (e) {
                    console.error("[TriggerHydration] Error:", e);
                }
            };
            hydrateTriggerFields();
        }
    }, [workflow.payload?.trigger?.source_id, workflow.payload?.trigger?.schema_id, bridge]);

    // =========================================================================
    // AXIOMA: HIDRATACIÓN DE ESTACIÓN (HERENCIA DE ADN)
    // =========================================================================
    /** 
     * Este efecto escucha cambios en el Context ID de la estación. 
     * Si la operación es un renderizado de documento, el sistema "escanea" 
     * la plantilla para heredar automáticamente las claves necesarias.
     */
    useEffect(() => {
        if (!station || station.config?.protocol !== 'NATIVE_DOCUMENT_RENDER') return;
        
        const templateId = station.mapping?.context_id?.value;
        if (!templateId || templateId.includes('$')) return;

        const hydrateStationFields = async () => {
            try {
                const result = await bridge.execute({
                    provider: 'system',
                    protocol: 'ATOM_READ',
                    context_id: templateId
                }, { vaultKey: `schema_fields_${templateId}` });
                
                if (result.items && result.items[0]) {
                    const docAtom = result.items[0];
                    const sources = docAtom.payload?.sources || [];
                    
                    if (sources.length > 0) {
                        const schemaResults = await Promise.all(sources.map(sid => 
                            bridge.execute({ provider: 'system', protocol: 'ATOM_READ', context_id: sid }, { vaultKey: `schema_fields_${sid}` })
                        ));
                        
                        const allFields = schemaResults.flatMap(r => r.items?.[0]?.payload?.fields || []);
                        const keys = [...new Set(allFields.map(f => f.alias || f.id))];
                        
                        const currentVariables = station.mapping?.variables?.value || {};
                        const newVariables = { ...currentVariables };
                        let hasChanges = false;
                        
                        keys.forEach(k => {
                            if (newVariables[k] === undefined) {
                                newVariables[k] = ''; 
                                hasChanges = true;
                            }
                        });
                        
                        if (hasChanges) {
                            updateStation(station.id, { 
                                mapping: { 
                                    ...(station.mapping || {}), 
                                    variables: { type: 'MAP', value: newVariables } 
                                } 
                            });
                        }
                    }
                }
            } catch (e) {
                console.error("[DNA_Inheritance] Error:", e);
            }
        };
        hydrateStationFields();
    }, [selectedStationId, station?.mapping?.context_id?.value, bridge]);


    if (!station && !trigger) return null;

    const handlePurge = () => {
        if (isTrigger) removeTrigger();
        else removeStation(station.id);
        setSelectedStationId(null);
    };

    const buildContextStack = () => {
        const stack = { sources: {}, ops: {} };
        const activeTrigger = trigger || workflow.payload?.trigger;
        const triggerLabel = activeTrigger?.label || 'GATILLO';
        
        // 1. Extraemos campos del Gatillo (Inputs)
        if (activeTrigger) {
            const definedFields = activeTrigger?.source?.fields || activeTrigger?.fields || [];
            stack.sources[triggerLabel] = { 
                fields: definedFields.length > 0 ? definedFields : [
                    { id: 'all', label: 'RAÍZ_DE_DATOS_(PAYLOAD)', type: 'OBJECT' },
                    { id: 'id', label: 'ID_DE_IGNICIÓN', type: 'TEXT' }
                ]
            };
        }

        // 2. Extraemos campos de Pasos Anteriores (Contexto Horizontal)
        if (!isTrigger) {
            const currentIndex = (workflow.payload?.stations || []).findIndex(s => s.id === selectedStationId);
            (workflow.payload?.stations || []).slice(0, currentIndex).forEach(s => {
                const stepAlias = s.export_as || s.config?.label || s.id;
                stack.ops[stepAlias] = { 
                    type: 'ATOM', 
                    fields: [
                        { id: 'all', label: 'ÁTOMO_COMPLETO', type: 'OBJECT' },
                        { id: 'id', label: 'ID', type: 'TEXT' },
                        { id: 'handle.label', label: 'NOMBRE', type: 'TEXT' },
                        { id: 'file_base64', label: 'CONTENIDO_BASE64', type: 'TEXT' }
                    ]
                };
            });
        }
        return stack;
    };

    const handleMappingSelect = (slot) => {
        let newMapping;
        
        if (activeParam.includes('.')) {
            // Caso: Mapping anidado (ej: variables.nombre_cliente)
            const [parent, child] = activeParam.split('.');
            const currentMap = station.mapping?.[parent]?.value || {};
            
            // AXIOMA: Inyección Automática de DNA (Si es nueva, auto-generar clave)
            const isNewInjection = child === 'NEW_VAR_INJECTION';
            const targetKey = isNewInjection ? slot.label.toLowerCase().replace(/[^a-z0-9]+/g, '_') : child;
            const targetValue = slot.path.startsWith('$') ? `{{${slot.path}}}` : slot.path;

            newMapping = {
                ...(station.mapping || {}),
                [parent]: {
                    type: 'MAP',
                    value: {
                        ...currentMap,
                        [targetKey]: targetValue
                    }
                }
            };
        } else {
            // Caso: Mapping directo de campo
            newMapping = {
                ...(station.mapping || {}),
                [activeParam]: { path: slot.path, type: 'REFERENCE', label: slot.label }
            };
        }
        
        updateStation(station.id, { mapping: newMapping });
        setShowSlotSelector(false);
        setActiveParam(null);
    };

    const handleStaticMappingUpdate = (paramId, value, subKey = null) => {
        let newMapping;

        if (subKey) {
            // Actualización de clave dentro de un MAPA (ej: variables[key] = value)
            const currentMap = station.mapping?.[paramId]?.value || {};
            newMapping = {
                ...(station.mapping || {}),
                [paramId]: {
                    type: 'MAP',
                    value: {
                        ...currentMap,
                        [subKey]: value
                    }
                }
            };
        } else {
            // Actualización directa
            newMapping = {
                ...(station.mapping || {}),
                [paramId]: { value: value, type: 'STATIC' }
            };
        }
        
        updateStation(station.id, { mapping: newMapping });
    };

    const removeMapKey = (paramId, key) => {
        const currentMap = { ...(station.mapping?.[paramId]?.value || {}) };
        delete currentMap[key];
        
        updateStation(station.id, { 
            mapping: {
                ...(station.mapping || {}),
                [paramId]: { type: 'MAP', value: currentMap }
            }
        });
    };

    const removeMapping = (paramId) => {
        const newMapping = { ...(station.mapping || {}) };
        delete newMapping[paramId];
        updateStation(station.id, { mapping: newMapping });
    };

    return (
        <div className="inspector-content stack fill" style={{ padding: 'var(--space-2) var(--space-4)', overflowY: 'auto' }}>
            
            {/* ── HEADER MAESTRO CON PODER CANÓNICO ── */}
            <div className="inspector-master-header spread" style={{ marginBottom: 'var(--space-6)', padding: '0 4px' }}>
                <div className="shelf--tight">
                    <IndraIcon name={isTrigger ? 'PLAY' : station.type} size="12px" color="var(--indra-dynamic-accent)" />
                    <div className="stack--tight">
                        <span className="font-mono" style={{ fontSize: '9px', fontWeight: 'bold' }}>
                            {isTrigger ? 'GATILLO' : 'ÁTOMO'}
                        </span>
                        <span className="text-hint" style={{ fontSize: '8px', opacity: 0.5, letterSpacing: '0.05em' }}>MODO_ESCRUTINIO</span>
                    </div>
                </div>
                
                <div className="shelf--tight" style={{ gap: '12px' }}>
                    <IndraActionTrigger
                        variant="destructive"
                        label="BORRAR"
                        onClick={handlePurge}
                        size="10px"
                    />
                    <button className="btn--ghost opacity-50 hover-opacity-100" onClick={() => setSelectedStationId(null)}>
                        <IndraIcon name="ARROW_RIGHT" size="14px" />
                    </button>
                </div>
            </div>

            <div className="stack" style={{ paddingBottom: '32px', gap: 'var(--space-4)' }}>
                
                {/* ── MÓDULO 01: IDENTIDAD ── */}
                <section className="inspector-module stack--tight">
                    <header className="module-header" style={{ marginBottom: 'var(--space-3)' }}>
                        <div className="indra-field-label">01 // IDENTIDAD {isTrigger ? 'DEL_GATILLO' : 'DEL_PASO'}</div>
                    </header>
                    
                    <div className="module-content">
                        {isTrigger ? (
                            <div className="stack--tight">
                                <div className="glass-light" style={{ padding: '2px 12px', borderRadius: '8px', border: '1px solid rgba(0,0,0,0.05)', marginBottom: '8px' }}>
                                    <input
                                        className="input-base font-mono"
                                        type="text"
                                        value={trigger.label || ''}
                                        onChange={(e) => updateTrigger({ ...trigger, label: e.target.value })}
                                        style={{ fontSize: '11px', width: '100%', height: '32px', border: 'none', background: 'transparent' }}
                                        placeholder="ALIAS_DEL_GATILLO..."
                                    />
                                </div>
                                <div className="stack--tight glass-light" style={{ padding: '10px', borderRadius: '8px', border: '1px solid rgba(0,0,0,0.05)' }}>
                                    <div className="indra-field-label" style={{ border: 'none', fontSize: '7px', opacity: 0.3, marginBottom: '6px' }}>TIPO_DE_IGNICIÓN</div>
                                    <div className="shelf--tight" style={{ gap: '4px' }}>
                                        {['MANUAL', 'TIME_TICK', 'WEBHOOK'].map(m => (
                                            <button 
                                                key={m}
                                                className={`btn--mini ${trigger.type === m ? 'btn--accent' : 'btn--ghost'}`}
                                                onClick={() => updateTrigger({ ...trigger, type: m })}
                                                style={{ flex: 1, fontSize: '8px', padding: '6px' }}
                                            >
                                                {m === 'TIME_TICK' ? 'RELOJ' : m === 'WEBHOOK' ? 'PULSO' : m}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="glass-light" style={{ padding: '2px 12px', borderRadius: '8px', border: '1px solid rgba(0,0,0,0.05)' }}>
                                <input
                                    className="input-base font-mono"
                                    type="text"
                                    value={station.config?.label || ''}
                                    onChange={(e) => updateStation(station.id, { config: { ...station.config, label: e.target.value } })}
                                    style={{ fontSize: '11px', width: '100%', height: '32px', border: 'none', background: 'transparent' }}
                                    placeholder="ALIAS_DEL_ÁTOMO..."
                                />
                            </div>
                        )}
                    </div>
                </section>

                {/* ── MÓDULOS ESPECÍFICOS DE GATILLO ── */}
                {isTrigger && (
                    <>
                        <section className="inspector-module stack--tight">
                            <header className="module-header" style={{ marginBottom: 'var(--space-3)' }}>
                                <div className="indra-field-label">02 // CONFIGURACIÓN_TÉCNICA</div>
                            </header>
                            
                            <div className="module-content glass-light" style={{ padding: '12px', borderRadius: '8px', border: '1px solid rgba(0,0,0,0.05)' }}>
                                {trigger.type === 'MANUAL' && (
                                    <p className="text-hint" style={{ fontSize: '9px' }}>
                                        Este flujo se iniciará manualmente mediante el botón de ejecución en el dashboard.
                                    </p>
                                )}
                                {trigger.type === 'TIME_TICK' && (
                                    <div className="stack--tight">
                                        <label className="indra-field-label" style={{ border: 'none', fontSize: '7px' }}>FRECUENCIA_DE_PULSO</label>
                                        <select 
                                            className="input-base" 
                                            value={trigger.config?.schedule || 'EVERY_HOUR'}
                                            onChange={(e) => updateTrigger({ ...trigger, config: { ...trigger.config, schedule: e.target.value } })}
                                            style={{ width: '100%', fontSize: '10px', padding: '6px' }}
                                        >
                                            <option value="EVERY_MINUTE">CADA MINUTO</option>
                                            <option value="EVERY_HOUR">CADA HORA</option>
                                            <option value="EVERY_DAY">CADA DÍA</option>
                                        </select>
                                    </div>
                                )}
                                {trigger.type === 'WEBHOOK' && (
                                    <div className="stack--tight">
                                        <label className="indra-field-label" style={{ border: 'none', fontSize: '7px' }}>URL_DE_RECEPCIÓN_(PULSO)</label>
                                        <div className="webhook-box" style={{ background: 'rgba(0,0,0,0.03)', padding: '8px', borderRadius: '4px', fontSize: '9px', wordBreak: 'break-all' }}>
                                            {`https://script.google.com/.../exec?protocol=PULSE&id=${trigger.id || 'undefined'}`}
                                        </div>
                                        <p className="text-hint" style={{ fontSize: '8px', marginTop: '8px', opacity: 0.6 }}>
                                            Usa esta URL para conectar formularios AEE o servicios externos.
                                        </p>
                                    </div>
                                )}
                            </div>
                        </section>

                        <section className="inspector-module stack--tight">
                            <header className="module-header" style={{ marginBottom: 'var(--space-3)' }}>
                                <div className="indra-field-label">03 // CONTRATO_DE_DATOS</div>
                            </header>
                            <div className="module-content stack--tight glass-light" style={{ padding: '12px', borderRadius: '8px', border: '1px solid rgba(0,0,0,0.05)' }}>
                                <p className="text-hint" style={{ fontSize: '9px', marginBottom: '8px' }}>
                                    Vincula un Esquema para habilitar el autocompletado de campos en todo el flujo.
                                </p>
                                
                                <div className="stack--tight">
                                    <label className="indra-field-label" style={{ border: 'none', fontSize: '7px', opacity: 0.5 }}>IDENTIDAD_DEL_CONTRATO</label>
                                    
                                    {/* SELECTOR PREMIUM DE ESQUEMAS */}
                                    <div className="schema-selector-trigger glass-light" 
                                        onClick={() => setShowSchemaPicker(!showSchemaPicker)}
                                        style={{ 
                                            padding: '8px 12px', borderRadius: '8px', cursor: 'pointer', 
                                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                            border: '1px solid rgba(0,0,0,0.05)',
                                            transition: 'all 0.2s ease',
                                            backgroundColor: showSchemaPicker ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)'
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)'}
                                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = showSchemaPicker ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)'}
                                    >
                                        <div className="shelf--tight" style={{ flex: 1, overflow: 'hidden' }}>
                                            <IndraIcon 
                                                name={trigger.source_id ? "FINGERPRINT" : "SEARCH"} 
                                                size="14px" 
                                                color={trigger.source_id ? 'var(--color-accent)' : '#888'} 
                                            />
                                            <div className="stack--nano" style={{ overflow: 'hidden' }}>
                                                <span style={{ 
                                                    fontSize: '11px', 
                                                    fontWeight: 'bold', 
                                                    whiteSpace: 'nowrap', 
                                                    overflow: 'hidden', 
                                                    textOverflow: 'ellipsis',
                                                    color: trigger.source_id ? 'white' : 'rgba(255,255,255,0.4)'
                                                }}>
                                                    {availableSchemas.find(s => s.id === trigger.source_id)?.handle?.label || 
                                                     (trigger.source_id ? 'RESOLVIENDO_IDENTIDAD...' : 'VINCULAR_CONTRATO_DE_DATOS')}
                                                </span>
                                                {trigger.source_id && !availableSchemas.find(s => s.id === trigger.source_id) && (
                                                     <span style={{ fontSize: '7px', opacity: 0.3 }}>UID: {trigger.source_id.substring(0,8)}...</span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="shelf--tight" style={{ opacity: 0.5 }}>
                                            <div style={{ fontSize: '8px', fontWeight: 'bold' }}>{showSchemaPicker ? 'CERRAR' : 'CAMBIAR'}</div>
                                            <IndraIcon name={showSchemaPicker ? 'CLOSE' : 'CHEVRON_DOWN'} size="10px" />
                                        </div>
                                    </div>

                                    {showSchemaPicker && (
                                        <ArtifactSelector 
                                            title="VINCULAR_CONTRATO_DE_DATOS"
                                            filter={{ class: 'DATA_SCHEMA' }}
                                            onCancel={() => setShowSchemaPicker(false)}
                                            onSelect={(item) => {
                                                updateTrigger({ ...trigger, source_id: item.id, fields: null });
                                                setShowSchemaPicker(false);
                                            }}
                                        />
                                    )}

                                    <div className="shelf--tight" style={{ opacity: 0.4, margin: '12px 0 4px 0' }}>
                                        <div style={{ height: '1px', flex: 1, background: 'currentColor' }}></div>
                                        <span style={{ fontSize: '7px' }}>VINCULO_MANUAL_AVANZADO</span>
                                        <div style={{ height: '1px', flex: 1, background: 'currentColor' }}></div>
                                    </div>

                                    <input 
                                        className="input-base font-mono"
                                        style={{ fontSize: '10px', width: '100%', padding: '8px' }}
                                        placeholder="ID_DE_OTRO_WORKSPACE..."
                                        value={trigger.source_id || ''}
                                        onChange={(e) => updateTrigger({ ...trigger, source_id: e.target.value, fields: null })}
                                    />
                                    {trigger.source_id && (
                                        <div className="shelf--tight" style={{ marginTop: '8px', color: 'var(--color-accent)', gap: '4px' }}>
                                            <IndraIcon name="VALID" size="10px" />
                                            <span style={{ fontSize: '8px', fontWeight: 'bold' }}>CONTRATO_SINCERADO</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </section>
                    </>
                )}

                {/* ── MÓDULOS DE ESTACIÓN (PROTOCOL) ── */}
                {!isTrigger && station.type === 'PROTOCOL' && (
                    <>
                        {/* ── MÓDULO 02: CONFIGURACIÓN_DE_OPERACIÓN ── */}
                        <section className="inspector-module stack--tight">
                            <header className="module-header" style={{ marginBottom: 'var(--space-3)' }} title="Selecciona el sistema y la operación específica que este paso ejecutará.">
                                <div className="indra-field-label">02 // CONFIGURACIÓN_DE_OPERACIÓN</div>
                            </header>
                            <div className="module-content stack--tight glass-light" style={{ padding: '12px', borderRadius: '8px', border: '1px solid rgba(0,0,0,0.05)' }}>
                                <div className="stack--tight">
                                    <label style={{ fontSize: '8px', opacity: 0.5 }} className="font-mono">SERVICIO_ORIGEN</label>
                                    <select 
                                        className="input-base font-mono"
                                        style={{ fontSize: '10px', width: '100%', padding: '6px' }}
                                        value={station.config?.provider || ''}
                                        onChange={(e) => updateStation(station.id, { config: { ...station.config, provider: e.target.value, protocol: '' }, mapping: {} })}
                                    >
                                        <option value="" disabled>SELECCIONAR...</option>
                                        {PROVIDER_DICT.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                                    </select>
                                </div>
                                
                                {station.config?.provider && (
                                    <div className="stack--tight" style={{ marginTop: '8px' }}>
                                        <label style={{ fontSize: '8px', opacity: 0.5 }} className="font-mono">COMANDO_A_EJECUTAR</label>
                                        <select 
                                            className="input-base font-mono"
                                            style={{ fontSize: '10px', width: '100%', padding: '6px' }}
                                            value={station.config?.protocol || ''}
                                            onChange={(e) => updateStation(station.id, { config: { ...station.config, protocol: e.target.value }, mapping: {} })}
                                        >
                                            <option value="" disabled>SELECCIONAR COMANDO...</option>
                                            {(PROTOCOL_DICT[station.config.provider] || []).map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                                        </select>
                                    </div>
                                )}
                            </div>
                        </section>

                        {/* ── MÓDULO 03: ASIGNACIÓN DE DATOS ── */}
                        {station.config?.protocol && (
                            <section className="inspector-module stack--tight">
                                <header className="module-header" style={{ marginBottom: 'var(--space-3)' }} title="Conecta información proveniente de pasos anteriores o escribe valores estáticos.">
                                    <div className="indra-field-label">03 // ASIGNACIÓN_DE_DATOS</div>
                                </header>
                                <div className="module-content stack--tight">
                                    {getFieldsForProtocol(station.config.protocol).map(fieldInput => {
                                        const fieldId = typeof fieldInput === 'string' ? fieldInput : fieldInput.id;
                                        const fieldLabel = (typeof fieldInput === 'string' ? fieldInput : (fieldInput.label || fieldInput.id)).toUpperCase();
                                        const fieldType = typeof fieldInput === 'object' ? fieldInput.type : 'string';

                                        const mappedData = station.mapping?.[fieldId];
                                        const isReference = mappedData?.type === 'REFERENCE';
                                        const isMap = mappedData?.type === 'MAP' || fieldType === 'object';

                                        return (
                                            <div key={fieldId} className="stack--tight glass-light" style={{ padding: '8px 10px', borderRadius: '6px', border: '1px solid rgba(0,0,0,0.03)' }}>
                                                <div className="spread">
                                                    <label style={{ fontSize: '9px', fontWeight: 'bold' }} className="font-mono">{fieldLabel}</label>
                                                    {!isMap && (
                                                        <button 
                                                            className="btn--ghost opacity-40 hover-opacity-100" 
                                                            title="Vincular Variable Dinámica"
                                                            onClick={() => { setActiveParam(fieldId); setShowSlotSelector(true); }}
                                                        >
                                                            <IndraIcon name="LINK" size="10px" />
                                                        </button>
                                                    )}
                                                </div>
                                                
                                                {/* Representación Dinámica (Mapas vs Simples) */}
                                                {isMap ? (
                                                    <div className="stack--nano" style={{ marginTop: '6px' }}>
                                                        <div className="stack--nano">
                                                            {Object.entries(mappedData?.value || {}).map(([key, value]) => {
                                                                const isWired = typeof value === 'string' && value.startsWith('{{$steps');
                                                                return (
                                                                    <div key={key} className="shelf--tight glass-strong" style={{ padding: '4px 6px', borderRadius: '4px', gap: '8px' }}>
                                                                        <span className="font-mono" style={{ fontSize: '9px', opacity: 0.6, minWidth: '60px' }}>{key}:</span>
                                                                        
                                                                        {isWired ? (
                                                                            <div className="shelf--tight fill" style={{ background: 'var(--color-bg-elevated)', color: 'var(--indra-dynamic-accent)', padding: '2px 6px', borderRadius: '3px', fontSize: '8px' }}>
                                                                                <span className="truncate">{value.replace('{{', '').replace('}}', '')}</span>
                                                                                <button className="btn--ghost" onClick={() => handleStaticMappingUpdate(fieldId, '', key)}>
                                                                                    <IndraIcon name="CLOSE" size="8px" />
                                                                                </button>
                                                                            </div>
                                                                        ) : (
                                                                            <input 
                                                                                className="input-base fill font-mono"
                                                                                style={{ fontSize: '9px', padding: '2px', background: 'transparent' }}
                                                                                value={value || ''}
                                                                                onChange={(e) => handleStaticMappingUpdate(fieldId, e.target.value, key)}
                                                                            />
                                                                        )}

                                                                        <div className="shelf--nano">
                                                                            <button 
                                                                                className="btn--ghost opacity-30 hover-opacity-100"
                                                                                onClick={() => { setActiveParam(`${fieldId}.${key}`); setShowSlotSelector(true); }}
                                                                            >
                                                                                <IndraIcon name="LINK" size="9px" />
                                                                            </button>
                                                                            <button 
                                                                                className="btn--ghost opacity-30 hover-opacity-100"
                                                                                onClick={() => removeMapKey(fieldId, key)}
                                                                            >
                                                                                <IndraIcon name="DELETE" size="9px" />
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                        
                                                        {/* Gatillo de Inyección Dinámica (Lógica Infinita de Indra) */}
                                                        <button 
                                                            className="btn--mini btn--ghost opacity-50 hover-opacity-100" 
                                                            style={{ 
                                                                width: '100%', padding: '8px', 
                                                                border: '1px dashed rgba(255,255,255,0.1)', 
                                                                background: 'rgba(255,255,255,0.02)',
                                                                marginTop: '8px', borderRadius: '4px'
                                                            }}
                                                            onClick={() => { setActiveParam(`${fieldId}.NEW_VAR_INJECTION`); setShowSlotSelector(true); }}
                                                        >
                                                            <div className="shelf--tight" style={{ justifyContent: 'center', gap: '8px' }}>
                                                                <IndraIcon name="PLUS" size="10px" />
                                                                <span className="font-mono" style={{ fontSize: '8px', letterSpacing: '0.05em' }}>INYECTAR_DATO_DE_CONTEXTO</span>
                                                            </div>
                                                        </button>
                                                    </div>
                                                ) : isReference ? (
                                                    <div className="shelf--tight" style={{ background: 'var(--color-bg-elevated)', color: 'var(--indra-dynamic-accent)', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--indra-dynamic-border)', fontSize: '10px' }}>
                                                        <IndraIcon name="LINK" size="10px" />
                                                        <span className="font-mono truncate" style={{ flex: 1, padding: '0 4px' }}>{mappedData.path}</span>
                                                        <button 
                                                            className="btn--ghost" 
                                                            onClick={() => removeMapping(fieldId)} 
                                                            style={{ padding: '2px', opacity: 0.6, display: 'flex' }}
                                                            title="Eliminar Enlace"
                                                        >
                                                            <IndraIcon name="DELETE" size="10px" />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    fieldInput.options && fieldInput.options.length > 0 ? (
                                                        <select 
                                                            className="input-base font-mono"
                                                            style={{ fontSize: '10px', width: '100%', padding: '4px 6px', marginTop: '4px' }}
                                                            value={mappedData?.value || ''}
                                                            onChange={(e) => handleStaticMappingUpdate(fieldId, e.target.value)}
                                                        >
                                                            <option value="">SELECCIONAR...</option>
                                                            {fieldInput.options.map(opt => (
                                                                <option key={opt} value={opt}>{opt}</option>
                                                            ))}
                                                        </select>
                                                    ) : (
                                                        <input 
                                                            className="input-base"
                                                            type="text"
                                                            placeholder={fieldId === 'context_id' ? "Seleccionar carpeta..." : "Valor estático..."}
                                                            style={{ fontSize: '10px', width: '100%', padding: '4px 6px', marginTop: '4px' }}
                                                            value={mappedData?.value || ''}
                                                            onChange={(e) => handleStaticMappingUpdate(fieldId, e.target.value)}
                                                        />
                                                    )
                                                )}
                                            </div>
                                        );
                                    })}

                                </div>
                            </section>
                        )}
                    </>
                )}

                {/* ── MÓDULOS DE ESTACIÓN (ROUTER) ── */}
                {!isTrigger && station.type === 'ROUTER' && (
                    <>
                        <section className="inspector-module stack--tight">
                            <header className="module-header" style={{ marginBottom: 'var(--space-3)' }}>
                                <div className="indra-field-label">02 // LÓGICA_DE_BIFURCACIÓN</div>
                            </header>
                            <div className="module-content stack--tight glass-light" style={{ padding: '12px', borderRadius: '8px', border: '1px solid rgba(0,0,0,0.05)' }}>
                                <div className="stack--tight">
                                    <label style={{ fontSize: '8px', opacity: 0.5 }} className="font-mono">VARIABLE_A_EVALUAR</label>
                                    <div className="shelf--tight" style={{ background: 'rgba(0,0,0,0.02)', padding: '6px', borderRadius: '4px' }}>
                                        <input 
                                            className="input-base font-mono" 
                                            style={{ fontSize: '10px', flex: 1, border: 'none', background: 'transparent' }}
                                            value={station.config?.route?.leftPath || ''}
                                            readOnly
                                            placeholder="Seleccionar variable..."
                                        />
                                        <button 
                                            className="btn--mini btn--accent" 
                                            onClick={() => { setActiveParam('leftPath'); setShowSlotSelector(true); }}
                                        >
                                            <IndraIcon name="LINK" size="10px" />
                                        </button>
                                    </div>
                                </div>

                                <div className="stack--tight" style={{ marginTop: '12px' }}>
                                    <label style={{ fontSize: '8px', opacity: 0.5 }} className="font-mono">OPERADOR_LÓGICO</label>
                                    <select 
                                        className="input-base font-mono"
                                        style={{ fontSize: '10px', width: '100%', padding: '6px' }}
                                        value={station.config?.route?.operator || '=='}
                                        onChange={(e) => updateStation(station.id, { config: { ...station.config, route: { ...station.config?.route, operator: e.target.value } } })}
                                    >
                                        <option value="==">ES_IGUAL_A (==)</option>
                                        <option value="!=">ES_DIFERENTE_A (!=)</option>
                                        <option value=">">MAYOR_QUE (&gt;)</option>
                                        <option value="<">MENOR_QUE (&lt;)</option>
                                        <option value="CONTAINS">CONTIENE</option>
                                    </select>
                                </div>

                                <div className="stack--tight" style={{ marginTop: '12px' }}>
                                    <label style={{ fontSize: '8px', opacity: 0.5 }} className="font-mono">VALOR_DE_COMPARACIÓN</label>
                                    <input 
                                        className="input-base font-mono"
                                        style={{ fontSize: '10px', width: '100%', padding: '6px' }}
                                        value={station.config?.route?.rightValue || ''}
                                        onChange={(e) => updateStation(station.id, { config: { ...station.config, route: { ...station.config?.route, rightValue: e.target.value } } })}
                                        placeholder="Valor..."
                                    />
                                </div>
                            </div>
                        </section>

                        <section className="inspector-module stack--tight">
                            <header className="module-header" style={{ marginBottom: 'var(--space-3)' }}>
                                <div className="indra-field-label">03 // RUTAS_DE_SALIDA</div>
                            </header>
                            <div className="module-content stack--tight">
                                <div className="glass-light" style={{ padding: '8px', borderRadius: '8px', borderLeft: '3px solid var(--indra-dynamic-accent)' }}>
                                    <label style={{ fontSize: '8px', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>SI_CUMPLE (TRUE)</label>
                                    <select 
                                        className="input-base font-mono"
                                        style={{ fontSize: '10px', width: '100%' }}
                                        value={station.config?.route?.on_true || ''}
                                        onChange={(e) => updateStation(station.id, { config: { ...station.config, route: { ...station.config?.route, on_true: e.target.value } } })}
                                    >
                                        <option value="">DETENER_FLUJO</option>
                                        {(workflow.payload?.stations || []).filter(s => s.id !== station.id).map(s => (
                                            <option key={s.id} value={s.id}>{s.config?.label || s.id}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="glass-light" style={{ padding: '8px', borderRadius: '8px', borderLeft: '3px solid #f87171', marginTop: '8px' }}>
                                    <label style={{ fontSize: '8px', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>SI_NO_CUMPLE (FALSE)</label>
                                    <select 
                                        className="input-base font-mono"
                                        style={{ fontSize: '10px', width: '100%' }}
                                        value={station.config?.route?.on_false || ''}
                                        onChange={(e) => updateStation(station.id, { config: { ...station.config, route: { ...station.config?.route, on_false: e.target.value } } })}
                                    >
                                        <option value="">DETENER_FLUJO</option>
                                        {(workflow.payload?.stations || []).filter(s => s.id !== station.id).map(s => (
                                            <option key={s.id} value={s.id}>{s.config?.label || s.id}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </section>
                    </>
                )}

                {/* ── MÓDULOS DE ESTACIÓN (MAP) ── */}
                {!isTrigger && station.type === 'MAP' && (
                    <>
                        <section className="inspector-module stack--tight">
                            <header className="module-header" style={{ marginBottom: 'var(--space-3)' }}>
                                <div className="indra-field-label">02 // PODA_DE_CONTEXTO (AXIOMA A2)</div>
                            </header>
                            <div className="module-content stack--tight glass-light" style={{ padding: '12px', borderRadius: '8px', border: '1px solid rgba(0,0,0,0.05)' }}>
                                <p className="text-hint" style={{ fontSize: '9px', marginBottom: '8px' }}>
                                    Define qué claves del contexto actual sobreviven para el siguiente paso.
                                </p>
                                <div className="stack--tight">
                                    <input 
                                        className="input-base font-mono"
                                        style={{ fontSize: '10px', width: '100%', padding: '6px' }}
                                        placeholder="Clave a preservar (ej: user_id)..."
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && e.target.value) {
                                                const currentPruning = station.config?.pruning || [];
                                                if (!currentPruning.includes(e.target.value)) {
                                                    updateStation(station.id, { config: { ...station.config, pruning: [...currentPruning, e.target.value] } });
                                                }
                                                e.target.value = '';
                                            }
                                        }}
                                    />
                                    <div className="shelf--tight" style={{ flexWrap: 'wrap', marginTop: '8px', gap: '4px' }}>
                                        {(station.config?.pruning || []).map(key => (
                                            <div key={key} className="badge--mini shelf--tight" style={{ background: 'var(--indra-dynamic-accent)', color: 'white', padding: '2px 6px', borderRadius: '4px', fontSize: '8px' }}>
                                                {key}
                                                <button 
                                                    onClick={() => updateStation(station.id, { config: { ...station.config, pruning: station.config.pruning.filter(k => k !== key) } })}
                                                    style={{ marginLeft: '4px', border: 'none', background: 'transparent', color: 'white', cursor: 'pointer' }}
                                                >
                                                    ×
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </section>
                    </>
                )}

                {/* ── MÓDULOS COMUNES (ALMACENAMIENTO) ── */}
                {!isTrigger && (
                    <section className="inspector-module stack--tight">
                        <header className="module-header" style={{ marginBottom: 'var(--space-3)' }}>
                            <div className="indra-field-label">
                                {station.type === 'PROTOCOL' ? '04 // EXPORTACIÓN_DE_RESULTADO (SALIDA)' : '04 // IDENTIFICADOR_DE_PASO'}
                            </div>
                        </header>
                        <div className="module-content glass-light shelf--tight" style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid rgba(0,0,0,0.05)' }}>
                            <span className="font-mono" style={{ fontSize: '9px', opacity: 0.5 }}>IDENTIFICADOR_EXPORTACIÓN // </span>
                            <input
                                className="input-base font-mono"
                                type="text"
                                value={station.export_as || station.id}
                                onChange={(e) => updateStation(station.id, { export_as: e.target.value.replace(/\s+/g, '_').toLowerCase() })}
                                style={{ fontSize: '11px', flex: 1, height: '28px', border: 'none', background: 'transparent' }}
                                placeholder="nombre_variable"
                            />
                        </div>
                    </section>
                )}
            </div>

            {showSlotSelector && (
                <SlotSelector
                    contextStack={buildContextStack()}
                    onSelect={(slot) => {
                        if (activeParam === 'leftPath') {
                            updateStation(station.id, { config: { ...station.config, route: { ...station.config?.route, leftPath: slot.path } } });
                            setShowSlotSelector(false);
                            setActiveParam(null);
                        } else {
                            handleMappingSelect(slot);
                        }
                    }}
                    onCancel={() => setShowSlotSelector(false)}
                />
            )}
        </div>
    );
}

