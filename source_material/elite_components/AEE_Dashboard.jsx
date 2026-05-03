/**
 * =============================================================================
 * ARTEFACTO: AEE_Dashboard.jsx
 * RESPONSABILIDAD: Orquestador del AEE (Agnostic Execution Engine).
 *
 * AXIOMA DE GESTACIÓN REACTIVA (30/70):
 *   - Izquierda (30%): Configuración en tiempo real.
 *   - Derecha (70%): Preview de manifestación pura.
 * =============================================================================
 */

import React from 'react';
import { useAEESession } from './useAEESession';
import { FormRunner } from './FormRunner';
import { ResultPanel } from './ResultPanel';
import { AEEConfigPanel } from './AEEConfigPanel';
import { IndraMacroHeader } from '../../utilities/IndraMacroHeader';
import { IndraIcon } from '../../utilities/IndraIcons';
import { useAppState } from '../../../state/app_state';
import './AEEFormRunner.css';

export function AEEDashboard({ atom, bridge }) {
    const [liveConfig, setLiveConfig] = React.useState({});

    // Mimetismo: Creamos un átomo fantasma (preview) que fusiona la DB con los cambios en vivo del inspector
    const previewAtom = React.useMemo(() => {
        if (!atom) return atom;
        return {
            ...atom,
            payload: {
                ...atom.payload,
                ...liveConfig,
                schema_id: liveConfig.schema_id || atom.payload?.schema_id,
                executor_id: liveConfig.executor_id || atom.payload?.executor_id || atom.payload?.bridge_id,
                bridge_id: liveConfig.executor_type === 'BRIDGE' ? liveConfig.executor_id : null
            }
        };
    }, [atom, liveConfig]);

    const {
        effectiveSchema,
        isLoadingSchema,
        formData,
        updateField,
        result,
        status,
        error,
        executeLogic,
        reset
    } = useAEESession(previewAtom, bridge);

    const isConfigured = !!previewAtom?.payload?.schema_id;
    const isDirty = (
        previewAtom.payload?.schema_id !== atom?.payload?.schema_id ||
        previewAtom.payload?.executor_id !== (atom?.payload?.executor_id || atom?.payload?.bridge_id) ||
        previewAtom.payload?.button_label !== atom?.payload?.button_label ||
        previewAtom.payload?.button_variant !== atom?.payload?.button_variant
    );

    const [isSaving, setIsSaving] = React.useState(false);
    const [isPublishing, setIsPublishing] = React.useState(false);
    
    const { updateAxiomaticIdentity } = useAppState();
    const [localTitle, setLocalTitle] = React.useState(atom?.handle?.label || atom?.label || 'AEE Runner');

    // Sincronizar título local si el átomo cambia externamente
    React.useEffect(() => {
        setLocalTitle(atom?.handle?.label || atom?.label || 'AEE Runner');
    }, [atom?.handle?.label, atom?.label]);

    // Función Canónica: GUARDAR
    const handleSave = async () => {
        if (!isDirty || !isConfigured || !bridge) return;
        
        try {
            await bridge.save(previewAtom);
        } catch (err) {
            console.error('[AEE] Fallo de persistencia axiomática:', err);
        }
    };

    // Función Canónica: PUBLICAR
    const handlePublish = async () => {
        if (!isConfigured || !bridge) return;
        setIsPublishing(true);
        try {
            const res = await bridge.execute({
                provider: 'system',
                protocol: 'SYSTEM_SHARE_CREATE',
                data: {
                    artifact_id: atom.id,
                    artifact_class: atom.class,
                    auth_mode: 'public'
                }
            });

            if (res.metadata?.status === 'OK' && res.items?.[0]) {
                const ticketId = res.items[0].ticket_id;
                // Obtenemos coreUrl del bridge si es necesario para el link
                const url = `${window.location.origin}${window.location.pathname}?u=${encodeURIComponent(bridge.coreUrl)}&id=${ticketId}`;
                await navigator.clipboard.writeText(url);
                alert("Enlace público copiado: " + url);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setIsPublishing(false);
        }
    };

    const [driftState, setDriftState] = React.useState({ status: 'IDLE', message: null, details: null });
    
    // Estados de Maquetación Profesional (Micro-Apps)
    const [viewMode, setViewMode] = React.useState('FORM'); // 'FORM' | 'SUCCESS'
    const [previewDevice, setPreviewDevice] = React.useState('DESKTOP'); // 'DESKTOP' | 'MOBILE'

    React.useEffect(() => {
        const checkDrift = async () => {
            if (!previewAtom?.id || !bridge) return;
            setDriftState({ status: 'CHECKING', message: 'Verificando evolución del origen...', details: null });
            try {
                const result = await bridge.execute({
                    provider: 'system',
                    protocol: 'INDUCTION_DRIFT_CHECK',
                    context_id: previewAtom.id
                });

                if (result.metadata?.status !== 'OK') throw new Error(result.metadata?.error || 'DRIFT_CHECK_FAILED');
                if (result.metadata?.drift_detected) {
                    setDriftState({ status: 'DRIFT', message: 'Detectada evolución en el origen. Revisa el esquema.', details: result.metadata });
                    return;
                }
                setDriftState({ status: 'OK', message: null, details: result.metadata });
            } catch (err) {
                setDriftState({ status: 'ERROR', message: `No se pudo verificar deriva: ${err.message}`, details: null });
            }
        };
        checkDrift();
    }, [previewAtom?.id, coreUrl, sessionSecret]);

    React.useEffect(() => {
        const handleInsert = (e) => {
            const { field, schema } = e.detail;
            const targetProp = viewMode === 'SUCCESS' ? 'success_view' : 'custom_fields';
            const currentFields = previewAtom.payload?.[targetProp] || [];
            
            let newFields = [];
            if (field.alias === 'all' && field.children) {
                newFields = field.children.map(c => ({...c, __origin_schema: schema.id}));
            } else {
                newFields = [{...field, __origin_schema: schema.id}];
            }

            const uniqueIds = new Set(currentFields.map(f => f.id));
            const toAdd = newFields.filter(f => !uniqueIds.has(f.id));
            
            if (toAdd.length > 0) {
                setLiveConfig(prev => ({
                    ...prev,
                    [targetProp]: [...currentFields, ...toAdd]
                }));
            }
        };

        const handleInsertStatic = (e) => {
            const { type } = e.detail;
            const targetProp = viewMode === 'SUCCESS' ? 'success_view' : 'custom_fields';
            const currentFields = previewAtom.payload?.[targetProp] || [];
            
            const staticBlock = {
                id: `${type}_${Date.now()}`,
                alias: `${type}_${Date.now()}`,
                type: type,
                label: type === 'STATIC_TEXT' ? '# Nuevo Bloque\nEscribe tu contenido aquí...' : 'https://tu-imagen.com/logo.png',
            };

            setLiveConfig(prev => ({
                ...prev,
                [targetProp]: [...currentFields, staticBlock]
            }));
        };

        const handleRemoveField = (e) => {
            const { id } = e.detail;
            const targetProp = viewMode === 'SUCCESS' ? 'success_view' : 'custom_fields';
            setLiveConfig(prev => ({
                ...prev,
                [targetProp]: (previewAtom.payload?.[targetProp] || []).filter(f => f.id !== id)
            }));
        };

        const handleUpdateField = (e) => {
            const { id, ...updates } = e.detail;
            const targetProp = viewMode === 'SUCCESS' ? 'success_view' : 'custom_fields';
            const currentFields = previewAtom.payload?.[targetProp] || [];
            
            setLiveConfig(prev => ({
                ...prev,
                [targetProp]: currentFields.map(f => f.id === id ? { ...f, ...updates } : f)
            }));
        };

        window.addEventListener('AEE_INSERT_FIELD', handleInsert);
        window.addEventListener('AEE_INSERT_STATIC', handleInsertStatic);
        window.addEventListener('AEE_REMOVE_FIELD', handleRemoveField);
        window.addEventListener('AEE_UPDATE_FIELD', handleUpdateField);
        return () => {
            window.removeEventListener('AEE_INSERT_FIELD', handleInsert);
            window.removeEventListener('AEE_INSERT_STATIC', handleInsertStatic);
            window.removeEventListener('AEE_REMOVE_FIELD', handleRemoveField);
            window.removeEventListener('AEE_UPDATE_FIELD', handleUpdateField);
        };
    }, [previewAtom, viewMode]);

    // Aplicar estilos agnósticos persistentes (Módulo B)
    const graphics = previewAtom?.payload?.graphics || null;
    const accentColor = graphics?.colors?.primary || previewAtom?.color || '#00f5d4';
    
    // Variables mapeadas para el scope local
    const dynamicStyles = {
        '--indra-dynamic-accent': accentColor,
        '--indra-dynamic-border': `${accentColor}26`,
        '--indra-dynamic-bg': `${accentColor}08`,
        '--color-bg-base': graphics?.colors?.bg_surface || 'var(--color-bg-void)',
        '--color-text-primary': graphics?.colors?.text || 'inherit',
        '--font-system': graphics?.typography?.fontFamily || 'inherit',
        '--font-mono': graphics?.typography?.fontFamily || 'inherit',
        '--radius-md': graphics?.typography?.radius || '8px',
    };

    // Resolutión del Schema Efectivo según el modo actual
    const syntheticSchema = React.useMemo(() => {
        const targetFields = viewMode === 'SUCCESS' || status === 'SUCCESS' 
            ? (effectiveSchema?.payload?.success_view || []) 
            : (effectiveSchema?.payload?.custom_fields || effectiveSchema?.payload?.fields || []);
            
        return {
            ...effectiveSchema,
            payload: {
                ...effectiveSchema?.payload,
                custom_fields: targetFields, // Interceptado por FormRunner
                __view_mode: viewMode === 'SUCCESS' || status === 'SUCCESS' ? 'SUCCESS' : 'FORM'
            }
        };
    }, [effectiveSchema, viewMode, status]);

    return (
        <div className="macro-designer-wrapper fill stack" style={dynamicStyles}>
            <IndraMacroHeader
                atom={previewAtom}
                bridge={bridge}
                title={localTitle}
                defaultTitle="AEE Runner"
                onClose={() => bridge?.close?.() || window.parent.postMessage({ type: 'CLOSE_MACRO' }, '*')}
                isSaving={status === 'EXECUTING' || isSaving}
                rightSlot={
                    <div className="shelf--tight">
                        {status !== 'IDLE' && (
                            <button
                                className="btn btn--ghost btn--xs"
                                onClick={reset}
                                style={{ fontSize: '9px', marginRight: '8px' }}
                            >
                                <IndraIcon name="SYNC" size="12px" />
                                <span>RESET SANDBOX</span>
                            </button>
                        )}
                        <button
                            className={`btn btn--xs ${isDirty ? 'btn--accent pulse' : 'btn--ghost'}`}
                            onClick={handleSave}
                            disabled={!isConfigured || isSaving || !isDirty}
                            style={{ fontSize: '9px', fontWeight: 'bold' }}
                        >
                            {isSaving ? 'GUARDANDO…' : 'GUARDAR'}
                        </button>
                        <button
                            className="btn btn--xs btn--success"
                            onClick={handlePublish}
                            disabled={!isConfigured || isDirty || isPublishing}
                            style={{ fontSize: '9px', fontWeight: 'bold', minWidth: '85px', justifyContent: 'center' }}
                            title={isDirty ? "Guarda los cambios antes de publicar" : "Generar enlace público"}
                        >
                            {isPublishing ? 'EMITIENDO…' : 'PUBLICAR'}
                            <IndraIcon name="LINK" size="10px" style={{ marginLeft: '4px' }} />
                        </button>
                    </div>
                }
            />

            {/* ── ALINEACIÓN AÚREA (30/70) ── */}
            <div className="designer-body fill spread relative overflow-hidden" style={{ flexDirection: 'row', alignItems: 'stretch' }}>
                
                {/* PANEL DE ESCRUTINIO (30%) */}
                <AEEConfigPanel
                    atom={previewAtom}
                    onConfigChange={setLiveConfig}
                    bridge={bridge}
                />

                {/* LIENZO DE MANIFESTACIÓN (70%) */}
                <div className="aee-projection-panel fill relative overflow-auto center" style={{ background: 'var(--color-bg-deep)', alignItems: 'center', justifyContent: 'center', padding: '40px' }}>
                    
                    {/* Toolbar de Maquetación Profesional */}
                    <div className="shelf--tight shadow-glow" style={{ 
                        position: 'absolute', top: '24px', left: '50%', transform: 'translateX(-50%)', 
                        padding: '6px', borderRadius: '24px', border: '1px solid var(--color-border)', zIndex: 10,
                        gap: '8px', background: 'var(--glass-bg)', backdropFilter: 'var(--blur-glass)'
                    }}>
                        <div className="shelf--tight" style={{ background: 'var(--color-bg-base)', borderRadius: '16px', padding: '2px' }}>
                            <button 
                                onClick={() => setViewMode('FORM')}
                                style={{
                                    height: '24px', padding: '0 16px', fontSize: '10px', fontWeight: 'bold', fontFamily: 'var(--font-mono)',
                                    background: viewMode === 'FORM' ? 'var(--color-text-primary)' : 'transparent',
                                    color: viewMode === 'FORM' ? 'var(--color-bg-base)' : 'var(--color-text-secondary)',
                                    borderRadius: '14px', transition: 'all 0.2s ease', border: 'none', cursor: 'pointer'
                                }}
                            >
                                /FORMULARIO
                            </button>
                            <button 
                                onClick={() => setViewMode('SUCCESS')}
                                style={{
                                    height: '24px', padding: '0 16px', fontSize: '10px', fontWeight: 'bold', fontFamily: 'var(--font-mono)',
                                    background: viewMode === 'SUCCESS' ? 'var(--color-text-primary)' : 'transparent',
                                    color: viewMode === 'SUCCESS' ? 'var(--color-bg-base)' : 'var(--color-text-secondary)',
                                    borderRadius: '14px', transition: 'all 0.2s ease', border: 'none', cursor: 'pointer'
                                }}
                            >
                                /ÉXITO_VISUAL
                            </button>
                        </div>
                        <div style={{ width: '1px', height: '14px', background: 'var(--color-border)' }} />
                        <div className="shelf--tight">
                            <button 
                                className="center hover-accent"
                                onClick={() => setPreviewDevice('DESKTOP')}
                                style={{ 
                                    opacity: previewDevice === 'DESKTOP' ? 1 : 0.4, 
                                    width: '28px', height: '28px', borderRadius: '50%', border: 'none', background: 'transparent', cursor: 'pointer',
                                    color: previewDevice === 'DESKTOP' ? 'var(--color-accent)' : 'var(--color-text-primary)'
                                }}
                                title="Vista de Escritorio"
                            >
                                <IndraIcon name="LAYOUT" size="14px" />
                            </button>
                            <button 
                                className="center hover-accent"
                                onClick={() => setPreviewDevice('MOBILE')}
                                style={{ 
                                    opacity: previewDevice === 'MOBILE' ? 1 : 0.4, 
                                    width: '28px', height: '28px', borderRadius: '50%', border: 'none', background: 'transparent', cursor: 'pointer',
                                    color: previewDevice === 'MOBILE' ? 'var(--color-accent)' : 'var(--color-text-primary)'
                                }}
                                title="Vista Móvil"
                            >
                                <IndraIcon name="VAULT" size="14px" />
                            </button>
                        </div>
                    </div>

                    {/* Simulación del Dispositivo / Lienzo */}
                    <div className="aee-device-simulator" style={{ 
                        width: '100%',
                        maxWidth: previewDevice === 'MOBILE' ? '375px' : '700px',
                        height: previewDevice === 'MOBILE' ? '700px' : 'auto',
                        minHeight: '300px',
                        background: 'var(--color-bg-base)',
                        border: previewDevice === 'MOBILE' ? '8px solid var(--color-bg-void)' : '1px solid var(--color-border)',
                        borderRadius: previewDevice === 'MOBILE' ? '32px' : 'var(--radius-lg)',
                        boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
                        overflowY: 'auto',
                        transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
                        display: 'flex',
                        flexDirection: 'column'
                    }}>

                        {/* Estado: Proyección Activa */}
                        {isConfigured && !isLoadingSchema && (
                            <main className="fill" style={{ padding: previewDevice === 'MOBILE' ? '24px 16px' : 'var(--space-8)' }}>
                                {status !== 'SUCCESS' || (status === 'SUCCESS' && (syntheticSchema.payload.custom_fields||[]).length > 0) ? (
                                    <FormRunner
                                        schema={syntheticSchema}
                                        formData={formData}
                                        onFieldChange={updateField}
                                        onExecute={executeLogic}
                                        status={status}
                                        bridge={bridge}
                                        customButtonLabel={previewAtom.payload?.button_label}
                                        customButtonVariant={previewAtom.payload?.button_variant}
                                        isDesignMode={true}
                                    />
                                ) : (
                                    <ResultPanel
                                        result={result}
                                        status={status}
                                        error={error}
                                        onReset={reset}
                                    />
                                )}
                            </main>
                        )}
                        
                        {/* Estado: Sin Configurar / Alerta Drift */}
                        {(!isConfigured || driftState.status === 'DRIFT') && (
                            <div className="fill center stack--tight" style={{ padding: 'var(--space-12)', opacity: 0.5 }}>
                                <IndraIcon name="SCHEMA" size="32px" />
                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px' }}>
                                    {isConfigured ? driftState.message : 'ESPERANDO_CONFIGURACIÓN...'}
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

