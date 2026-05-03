import React from 'react';
import { useWorkflow } from './context/WorkflowContext';
import { IndraIcon } from '../../utilities/IndraIcons';

/**
 * =============================================================================
 * COMPONENTE: WorkflowTrigger (Gatillo de Manifestación)
 * DOGMA: El Gatillo es el Origen, la Calibración está en el Panel.
 * =============================================================================
 */
export function WorkflowTrigger({ isSelected, onSelect }) {
    const { workflow } = useWorkflow();
    const trigger = workflow.payload?.trigger || { type: 'MANUAL', config: {} };

    // Traducción de Modos a Terminología Sincera
    const modeMap = {
        'MANUAL': 'MANUAL',
        'TIME_TICK': 'PROGRAMADO',
        'WEBHOOK': 'RECEPCIÓN',
        'SCHEMA_SUBMIT': 'REACTIVO_DATO'
    };

    return (
        <div 
            className={`workflow-trigger-node ${isSelected ? 'selected' : ''}`}
            onClick={(e) => { e.stopPropagation(); onSelect(); }}
            style={{
                width: '400px',
                background: isSelected ? 'var(--indra-panel-glass)' : 'var(--indra-panel-bg)',
                border: isSelected ? '1px solid var(--indra-dynamic-accent)' : '1px solid var(--indra-panel-border)',
                borderRadius: 'var(--radius-lg)',
                padding: 'var(--space-6)',
                boxShadow: isSelected ? '0 12px 40px rgba(0,0,0,0.2)' : '0 4px 15px rgba(0,0,0,0.05)',
                transition: 'all 0.4s cubic-bezier(0.19, 1, 0.22, 1)',
                cursor: 'pointer',
                textAlign: 'left'
            }}
        >
            <header className="spread" style={{ marginBottom: 'var(--space-2)', opacity: 0.4 }}>
                <div className="shelf--tight">
                    <IndraIcon name="PLAY" size="12px" color="var(--indra-dynamic-accent)" />
                    <span className="font-mono" style={{ fontSize: '9px', fontWeight: 'bold', letterSpacing: '0.12em' }}>
                        {modeMap[trigger.type] || 'GATILLO_DESCONOCIDO'}
                    </span>
                </div>
                <div className="status-indicator shelf--tight" style={{ gap: '4px' }}>
                    <div className="util-dot pulse" style={{ width: '6px', height: '6px' }} />
                    <span className="font-mono" style={{ fontSize: '8px', fontWeight: 'bold' }}>IGNICIÓN_ORIGEN</span>
                </div>
            </header>

            <div className="stack--tight" style={{ padding: '4px 0' }}>
                <span className="font-mono" style={{ 
                    fontSize: '14px', 
                    fontWeight: 'bold', 
                    color: 'var(--color-text-primary)',
                    letterSpacing: '0.05em'
                }}>
                    {trigger.label || 'VINCULAR_CONTRATO_DE_DATOS'}
                </span>
                <p className="text-hint" style={{ fontSize: '10px' }}>
                    {trigger.type === 'MANUAL' ? 'Disparo manual desde el artefacto.' : 
                     trigger.type === 'TIME_TICK' ? 'Ejecución programada por el Reloj de Indra.' : 
                     'Gatillo activado por receptor de datos o webhook.'}
                </p>
            </div>
        </div>
    );
}
