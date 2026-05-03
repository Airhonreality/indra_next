/**
 * =============================================================================
 * ARTEFACTO: 2_providers/provider_json_atom.gs
 * RESPONSABILIDAD: Artesano Lógico de Átomos JSON.
 * DOCTRINA: v21.0 — Soberanía Declarativa
 *
 * LEYES INQUEBRANTABLES:
 *   1. declare() retorna DATA PURA CONGELADA. Cero GAS calls.
 *   2. Para persistencia física, delega al DriveSovereign VÍA Orquestador.
 *   3. Solo gestiona lógica JSON. No conoce Sheets ni Ledger directamente.
 *   4. Nunca lanza excepciones que maten el proceso. Devuelve envelope de error.
 * =============================================================================
 */

const JsonSovereign = (function() {

  // ── CONSTITUCIÓN DEL SOBERANO ────────────────────────────────────────────────
  const JURISDICTION = Object.freeze({
    id:        'json_atom',
    label:     'JSON Atom Store',
    class:     'SILO_LOGICAL',
    version:   '2.0 (Declarative)',
    protocols: Object.freeze([
      'JSON_ATOM_READ',
      'JSON_ATOM_CREATE',
      'JSON_ATOM_UPDATE',
      'ATOM_READ',
      'ATOM_CREATE',
      'ATOM_UPDATE',
      'HEALTH_CHECK'
    ])
  });

  // ── PUNTO DE ENTRADA PÚBLICO ─────────────────────────────────────────────────
  function handle(uqo) {
    const protocol = (uqo.protocol || '').toUpperCase();
    const contextId = uqo.context_id || 'UNKNOWN';

    logInfo(`[json:dispatch] 🧪 Protocolo: ${protocol} | Context: ${contextId}`);

    try {
      switch (protocol) {
        case 'JSON_ATOM_READ':
        case 'ATOM_READ':        return _handleRead(uqo);

        case 'JSON_ATOM_CREATE':
        case 'ATOM_CREATE':      return _handleCreate(uqo);

        case 'JSON_ATOM_UPDATE':
        case 'ATOM_UPDATE':      return _handleUpdate(uqo);

        case 'HEALTH_CHECK':
          return { items: [{ status: 'ALIVE', parser: 'JSON.parse' }], metadata: { status: 'OK' } };

        default:
          return createIndraResponse([], new Error(`Protocolo desconocido: ${protocol}`), 'JSON_PROTOCOL_UNKNOWN');
      }
    } catch (err) {
      logError(`[json:fatal] ❌ [${protocol}]: ${err.message}`, err);
      return createIndraResponse([], err, 'JSON_LOGIC_FAILURE');
    }
  }

  // ── DECLARACIÓN DE JURISDICCIÓN ──────────────────────────────────────────────
  function declare() {
    return JURISDICTION;
  }

  // ── HANDLERS PRIVADOS ────────────────────────────────────────────────────────

  function _handleRead(uqo) {
    const id = uqo.context_id;
    logInfo(`[json:read] 📖 Solicitando materia física: ${id}`);

    const driveRes = SystemOrchestrator.dispatch({
      provider: 'drive',
      protocol: 'ATOM_READ',
      context_id: id,
      data: { include_content: true }
    });

    if (driveRes.metadata.status === 'ERROR') {
      return createIndraResponse([], new Error(driveRes.metadata.error_message), 'JSON_DRIVE_READ_FAILURE');
    }

    const content = driveRes.items?.[0]?.content;
    if (!content) {
      logWarn(`[json:read] ⚠️ Átomo vacío (Sin Materia): ${id}`);
      return createIndraResponse({}, null, 'EMPTY_ATOM');
    }

    try {
      const data = JSON.parse(content);
      logInfo(`[json:read] ✨ Materia parseada (${content.length} bytes)`);
      return createIndraResponse(data, null, 'READ_SUCCESS');
    } catch (e) {
      logError(`[json:parse] ❌ Corrupción en ${id}: ${e.message}`);
      return createIndraResponse({}, e, 'JSON_PARSE_FAILURE');
    }
  }

  function _handleCreate(uqo) {
    const id = uqo.context_id;
    const data = uqo.data || {};

    data.id = id;
    data.sync_at = new Date().toISOString();

    logInfo(`[json:create] 🖋️ Proyectando Átomo Lógico: ${id}`);

    const driveRes = SystemOrchestrator.dispatch({
      provider: 'drive',
      protocol: 'ATOM_UPDATE',
      context_id: id,
      data: { content: JSON.stringify(data, null, 2) }
    });

    if (driveRes.metadata.status === 'ERROR') {
      return createIndraResponse([], new Error(driveRes.metadata.error_message), 'JSON_DRIVE_WRITE_FAILURE');
    }

    return createIndraResponse(data, null, 'CREATE_SUCCESS');
  }

  function _handleUpdate(uqo) {
    const id = uqo.context_id;
    const updates = uqo.data || {};

    logInfo(`[json:update] 🔄 Fusión (Deep Merge): ${id}`);

    const currentRes = _handleRead(uqo);
    if (currentRes.metadata.status === 'ERROR') return currentRes;

    const currentData = currentRes.items[0];
    const merged = _indra_deepMerge_(currentData, updates);
    merged.sync_at = new Date().toISOString();

    return _handleCreate({ context_id: id, data: merged });
  }

  // ── INTERFAZ PÚBLICA ─────────────────────────────────────────────────────────
  return { handle, declare };

})();

// Alias de compatibilidad — resuelto en ONDA 4 (migración de llamadores directos).
const handleJson_atom = JsonSovereign.handle;
