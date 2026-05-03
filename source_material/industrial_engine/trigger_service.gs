/**
 * =============================================================================
 * ARTEFACTO: 3_services/trigger_service.gs
 * RESPONSABILIDAD: Gestión de Triggers de Google Apps Script.
 * DHARMA (ADR-018):
 *   - Automatización Invisible: El Core instala triggers según el TRIGGER_DNA.
 *   - Limpieza: Elimina triggers huérfanos si el workflow cambia o se borra.
 * =============================================================================
 */

const TRIGGER_FUNCTION_NAME = 'pulse_service_maintenance_trigger';

/**
 * Sincroniza los triggers de GAS con la configuración de un Workflow.
 * @param {Object} workflowAtom - El átomo del workflow guardado.
 */
function trigger_service_sync(workflowAtom) {
  const payload = workflowAtom.payload || {};
  const trigger = payload.trigger || {};
  
  logInfo(`[trigger_service] Sincronizando triggers para workflow: ${workflowAtom.id}`);

  // 1. Limpiar triggers antiguos vinculados a este workflow (basado en ID en metadata)
  _trigger_deleteByWorkflowId(workflowAtom.id);

  // 2. Instalar nuevo trigger según el tipo
  if (trigger.type === 'TIME_TICK' && trigger.config?.interval_minutes) {
    _trigger_installTimeTrigger(workflowAtom.id, trigger.config.interval_minutes);
  }
  
  if (trigger.type === 'WEBHOOK') {
    // Los webhooks no requieren trigger de GAS permanente, se manejan vía api_gateway.
    logInfo(`[trigger_service] Workflow ${workflowAtom.id} configurado como WEBHOOK.`);
  }
}

/**
 * Instala un trigger de tiempo en GAS.
 * @private
 */
function _trigger_installTimeTrigger(workflowId, interval) {
  try {
    // Nota: GAS permite triggers de minutos (1, 5, 10, 15, 30) o horas.
    let trigger;
    if (interval < 60) {
      trigger = ScriptApp.newTrigger(TRIGGER_FUNCTION_NAME)
        .timeBased()
        .everyMinutes(_trigger_validateMinutes(interval))
        .create();
    } else {
      trigger = ScriptApp.newTrigger(TRIGGER_FUNCTION_NAME)
        .timeBased()
        .everyHours(Math.floor(interval / 60))
        .create();
    }
    
    // Sincronización Sincera con el Ledger de Procesos (v4.42)
    ledger_process_sync(trigger.getUniqueId(), workflowId, 'ACTIVE');
    logInfo(`[trigger_service] Proceso ${trigger.getUniqueId()} registrado para workflow ${workflowId}.`);
  } catch (err) {
    logError(`[trigger_service] Error al instalar trigger para ${workflowId}`, err);
  }
}

/**
 * Elimina todos los triggers vinculados a un workflow específico.
 * @private
 */
function _trigger_deleteByWorkflowId(workflowId) {
  try {
    const triggers = ScriptApp.getProjectTriggers();
    triggers.forEach(trigger => {
        // Consultar el Ledger de Procesos (v4.42)
        const proc = ledger_process_get(trigger.getUniqueId());
        if (proc && proc.workflow_id === workflowId) {
          ScriptApp.deleteTrigger(trigger);
          logInfo(`[trigger_service] Trigger eliminado físicamente: ${trigger.getUniqueId()}`);
        }
    });

    // Limpieza lógica en el Ledger
    ledger_process_delete_by_workflow(workflowId);
  } catch (err) {
    logWarn(`[trigger_service] No se pudieron limpiar triggers (posible falta de permisos): ${err.message}`);
  }
}

/**
 * Ajusta los minutos a los valores permitidos por GAS API.
 * @private
 */
function _trigger_validateMinutes(min) {
  if (min <= 1) return 1;
  if (min <= 5) return 5;
  if (min <= 10) return 10;
  if (min <= 15) return 15;
  return 30;
}
