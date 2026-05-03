/**
 * =============================================================================
 * HOOK: useAEESession.js
 * RESPONSABILIDAD: Gestión del ciclo de vida de una sesión de ejecución AEE.
 *
 * AXIOMA DE LECTURA:
 *   El AEE es un atlas que referencia a un Schema y un Bridge.
 *   - atom.payload.schema_id → ID del Schema que proyecta los campos.
 *   - atom.payload.bridge_id → ID del Bridge que ejecuta la lógica.
 *   Si no están presentes, el AEE queda en modo CONFIG hasta que se configuren.
 * =============================================================================
 */

import { useState, useEffect } from 'react';
import { useAppState } from '../../../state/app_state';
import { DataProjector } from '../../../services/DataProjector';

export function useAEESession(atom, bridge) {
    const pins = useAppState(s => s.pins);

    const [resolvedSchema, setResolvedSchema] = useState(() => {
        // T=0: Intentar resonancia del Vault
        const schemaId = atom?.payload?.schema_id;
        if (bridge?.vault && schemaId) {
            return bridge.vault.read(`schema_resolved_${schemaId}`);
        }
        return null;
    });
    const [isLoadingSchema, setIsLoadingSchema] = useState(false);

    const [formData, setFormData] = useState({});
    const [result, setResult] = useState(null);
    const [status, setStatus] = useState('IDLE'); // IDLE, LOADING_SCHEMA, EXECUTING, SUCCESS, ERROR
    const [error, setError] = useState(null);

    const schemaId = atom?.payload?.schema_id;
    const executorId = atom?.payload?.executor_id || atom?.payload?.bridge_id;
    const executorType = atom?.payload?.executor_type || 'BRIDGE';

    // ── RESOLUCIÓN DEL SCHEMA VINCULADO ──
    useEffect(() => {
        if (!schemaId || !bridge) {
            setResolvedSchema(null);
            return;
        }

        const cachedPin = pins.find(p => p.id === schemaId);

        const hydrateSchema = async () => {
            setIsLoadingSchema(true);
            try {
                const result = await bridge.execute({
                    provider: 'system',
                    protocol: 'ATOM_READ',
                    context_id: schemaId
                }, { vaultKey: `schema_resolved_${schemaId}` });

                const fullSchema = result.items?.[0];
                if (fullSchema) {
                    setResolvedSchema(fullSchema);
                } else {
                    setError('SCHEMA_NOT_FOUND: El Schema configurado no existe en el Core.');
                }
            } catch (err) {
                setError(`SCHEMA_LOAD_FAILED: ${err.message}`);
            } finally {
                setIsLoadingSchema(false);
            }
        };

        if (cachedPin?.payload?.fields) {
            setResolvedSchema(cachedPin);
        } else {
            hydrateSchema();
        }
    }, [schemaId, bridge]);

    const updateField = (key, value) => {
        setFormData(prev => ({ ...prev, [key]: value }));
    };

    const executeLogic = async () => {
        if (status === 'EXECUTING' || !bridge) return;
        if (!executorId) {
            setError('NO_EXECUTOR_CONFIGURED: Este ejecutor no tiene un Bridge ni Workflow vinculado.');
            setStatus('ERROR');
            return;
        }

        setStatus('EXECUTING');
        setError(null);

        try {
            const protocol = executorType === 'WORKFLOW' ? 'WORKFLOW_EXECUTE' : 'LOGIC_EXECUTE';
            const provider = executorType === 'WORKFLOW' ? 'system' : 'pipeline';

            const response = await bridge.execute({
                provider,
                protocol,
                context_id: executorId,
                payload: formData
            });

            if (response.metadata?.status === 'OK' || response.metadata?.result === 'OK') {
                setResult(response.payload || response.items || response.metadata?.result);
                setStatus('SUCCESS');
            } else {
                throw new Error(response.metadata?.error || 'EXECUTOR_REJECTION: El ejecutor ha rechazado la operación.');
            }
        } catch (err) {
            console.error('[AEE_SESSION_ERROR]', err);
            setError(err.message);
            setStatus('ERROR');
        }
    };

    const reset = () => {
        setResult(null);
        setStatus('IDLE');
        setError(null);
        setFormData({});
    };

    // El schema que proyecta el formulario: usa el schema resuelto si existe,
    // si no, usa el atom mismo (compatibilidad legacy con AEE que apuntaban a DATA_SCHEMA directamente).
    const effectiveSchema = resolvedSchema || (atom?.class === 'DATA_SCHEMA' ? atom : null);

    return {
        effectiveSchema,
        isLoadingSchema,
        formData,
        updateField,
        result,
        status,
        error,
        executeLogic,
        reset
    };
}
