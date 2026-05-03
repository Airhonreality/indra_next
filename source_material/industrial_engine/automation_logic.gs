/**
 * =============================================================================
 * ARTEFACTO: 2_providers/provider_automation.gs
 * RESPONSABILIDAD: Capa de Automatización e Inducción Industrial.
 * DHARMA: 
 *   - Génesis: Manifestación de materia a partir de ADN (Schemas).
 *   - Orquestación: Ejecución de procesos de inducción y blueprints.
 * =============================================================================
 */

/**
 * =============================================================================
 * SOBERANO: AutomationSovereign (v21.0 — Soberanía Declarativa)
 * =============================================================================
 */
const AutomationSovereign = (function() {

  const JURISDICTION = Object.freeze({
    id:       'automation',
    label:    'Indra Automation',
    class:    'AUTOMATION_SERVICE',
    exposure: 'internal',
    version:  '21.0',
    protocols: Object.freeze([
      'INDUSTRIAL_SYNC', 'INDUSTRIAL_IGNITE',
      'INDUCTION_START', 'INDUCTION_PULSE',
      'INDUCTION_STATUS', 'INDUCTION_CANCEL',
      'MEDIA_INGEST_START', 'MEDIA_INGEST_PULSE', 'MEDIA_INGEST_FINALIZE',
      'SYSTEM_SCHEMA_IGNITE'
    ])
  });

  function handle(uqo) { return handleAutomation(uqo); }
  function declare()   { return JURISDICTION; }

  return { handle, declare };
})();

/**
 * Manejador Industrial de Automatización.
 * Implementa el Axioma de Falla Ruidosa (Fail-Fast).
 */
function handleAutomation(uqo) {
  const protocol = (uqo.protocol || '').toUpperCase();
  logInfo(`[automation:pine] Entrante: ${protocol}`);

  // ─── VALIDACIÓN DE CONTRATO BASE ──────────────────────────────────────────
  if (!uqo.data) {
    throw createError('CONTRACT_VIOLATION', `Protocolo ${protocol} requiere bloque "data" de intención.`);
  }

  // ─── DESPACHO INDUSTRIAL ──────────────────────────────────────────────────
  switch (protocol) {
    case 'INDUSTRIAL_IGNITE':
      return _automation_handleIndustrialIgnite(uqo);
    
    case 'INDUCTION_START':
      return _system_induction_start(uqo);
      
    case 'INDUCTION_STATUS':
      return _system_induction_status(uqo);

    case 'INDUSTRIAL_SYNC':
      return _automation_handleIndustrialSync_(uqo);

    case 'SYSTEM_SCHEMA_IGNITE':
      // Redireccionamos el legacy al nuevo motor industrial para unificar
      return _automation_handleIndustrialIgnite(uqo);

    default:
      throw createError('PROTOCOL_NOT_SUPPORTED', `Automation no soporta: ${protocol}`);
  }
}

/**
 * Orquestación de Resonancia Industrial (v1.0)
 */
function _automation_handleIndustrialSync_(uqo) {
  const { 
    bridge_id, bridge_atom, silo_id, target_provider, 
    sat_payload: provided_sat, silo_payload, dry_run, 
    source_id, source_provider 
  } = uqo.data || {};

  logInfo(`[automation:sync] 🔄 Iniciando Sincronización Industrial. Bridge: ${bridge_id || 'AD-HOC'}`);

  let sat_payload = provided_sat;
  
  if (!sat_payload && source_id) {
    logInfo(`[automation:sync] 📡 Extrayendo payload fresco desde source: ${source_id}...`);
    const readSource = SystemOrchestrator.dispatch({
       provider: source_provider || 'notion',
       protocol: 'TABULAR_STREAM',
       context_id: source_id
    });
    if (readSource.metadata?.status !== 'OK' && readSource.metadata?.status !== 'SUCCESS') {
       throw createError('SOURCE_READ_FAILED', `Fallo al extraer registros del source ${source_id}. Error: ${readSource.metadata?.error}`);
    }
    sat_payload = { items: readSource.items || [] };
    logInfo(`[automation:sync] 🧬 Extraídos ${sat_payload.items.length} items soberanos del origen.`);
  }

  // 1. ANÁLISIS PURO (Inteligencia)
  const analysis = SystemOrchestrator.dispatch({
    provider: 'compute',
    protocol: 'RESONANCE_ANALYZE',
    context_id: bridge_id,
    data: { sat_payload, silo_payload, bridge_atom }
  });

  if (analysis.metadata.status !== 'OK') return analysis;
  const resonanceReport = analysis.metadata.resonance;

  // 2. DECISIÓN DE MATERIALIZACIÓN (Acción)
  if (resonanceReport.actions.length > 0 && !dry_run) {
    logInfo(`[automation:sync] 🧱 Materializando ${resonanceReport.actions.length} acciones en ${target_provider}...`);
    const updateRes = SystemOrchestrator.dispatch({
      provider: target_provider || 'sheets',
      protocol: 'TABULAR_UPDATE',
      data: {
        silo_id: silo_id,
        actions: resonanceReport.actions
      }
    });
    if (updateRes.metadata.status !== 'OK') {
       throw createError('RETURN_LAW_VIOLATION', `Provider ${target_provider} falló en TABULAR_UPDATE.`);
    }
  } else if (dry_run) {
    logInfo(`[automation:diagnostic] Modo Laboratorio activo. Solo análisis.`);
  }

  return {
    items: [],
    metadata: {
      status: 'OK',
      resonance: resonanceReport,
      dry_run: !!dry_run
    }
  };
}

/**
 * INDUSTRIAL_IGNITE: Transforma un ADN (Blueprint) en Materia (Silo).
 * @private
 */
function _automation_handleIndustrialIgnite(uqo) {
  const data = uqo.data || {};
  
  // --- FASE DE RESOLUCIÓN SOBERANA (Axioma de Suh) ---
  // Si la UI solo envía IDs, el Provider es responsable de la hidratación.
  
  // 1. Resolución de ADN (Source)
  if (data.source_id && !data.source_artifact && !data.blueprint) {
    logInfo(`[automation:resolver] Hidratando ADN desde ID: ${data.source_id}`);
    const res = SystemOrchestrator.dispatch({ provider: 'system', protocol: 'ATOM_READ', context_id: data.source_id });
    if (res.items && res.items[0]) {
      uqo.data.source_artifact = res.items[0];
    } else {
      throw createError('NOT_FOUND', `No se pudo resolver el ADN de origen: ${data.source_id}`);
    }
  }

  const blueprint = uqo.data.blueprint || uqo.data.source_artifact;

  if (!uqo.data.target_provider) throw createError('INVALID_INTENTION', 'INDUSTRIAL_IGNITE requiere target_provider.');
  if (!blueprint)               throw createError('INVALID_INTENTION', 'INDUSTRIAL_IGNITE requiere blueprint (DNA) o source_id válido.');

  logInfo(`[automation:pine] Ignición Industrial orquestada con éxito. ADN Resuelto.`);

  // AXIOMA: Ignición Industrial es un alias del Motor de Cristalización Universal
  return induction_orchestrateCrystallization_(uqo);
}
