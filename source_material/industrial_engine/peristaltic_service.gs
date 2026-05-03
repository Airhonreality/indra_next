/**
 * =============================================================================
 * ARTEFACTO: 3_services/peristaltic_service.gs
 * RESPONSABILIDAD: Implementación del Protocolo de Ingesta Peristáltica (ADR-036).
 * Mantiene el estado de subidas fragmentadas y ensambla binarios en Drive.
 * =============================================================================
 */

const PeristalticService = (function() {

  const PERISTALTIC_TEMP_FOLDER_ = '_indra_ingest_temp';

  function handle(uqo) {
    const protocol = (uqo.protocol || '').toUpperCase();
    switch (protocol) {
      case 'PERISTALTIC_INIT':   return _init(uqo);
      case 'PERISTALTIC_CHUNK':  return _chunk(uqo);
      case 'PERISTALTIC_FINALIZE': return _finalize(uqo);
      case 'PERISTALTIC_PULSE':    return _handlePulse(uqo);
      default:
        throw new Error(`Protocolo Peristáltico no reconocido: ${protocol}`);
    }
  }

  function _init(uqo) {
    const { uploader, contact, files_manifest, session_id } = uqo.data;
    const sessionId = session_id || `sess_${Date.now()}`;
    const sessionMeta = {
      uploader, contact,
      start_at: new Date().toISOString(),
      files: files_manifest.map(f => ({ ...f, status: 'PENDING' }))
    };
    CacheService.getScriptCache().put(`ingest_sess_${sessionId}`, JSON.stringify(sessionMeta), 21600);
    return { items: [{ id: sessionId }], metadata: { status: 'OK' } };
  }

  function _chunk(uqo) {
    const { session_id, file_name, chunk_index, data_b64, mime_type } = uqo.data;
    const tempFolderId = _getTempFolderId();
    const tempFileName = `chunk_${session_id}_${file_name}_${String(chunk_index).padStart(4, '0')}`;
    
    handleDrive({
        protocol: 'ATOM_CREATE',
        context_id: tempFolderId,
        data: {
            name: tempFileName,
            content: data_b64,
            mime_type: mime_type || 'application/octet-stream',
            is_base64: true
        }
    });
    return { metadata: { status: 'OK', chunk_received: chunk_index } };
  }

  function _finalize(uqo) {
    const { session_id, file_name, target_folder_id, mime_type } = uqo.data;
    const tempFolderId = _getTempFolderId();
    const searchRes = handleDrive({ protocol: 'ATOM_READ', context_id: tempFolderId });
    const chunks = (searchRes.items || []).filter(f => f.name.startsWith(`chunk_${session_id}_${file_name}_`));
    
    chunks.sort((a, b) => a.name.localeCompare(b.name));
    
    const createRes = handleDrive({
        protocol: 'ATOM_CREATE',
        context_id: target_folder_id || 'root',
        data: {
            name: file_name,
            mime_type: mime_type || 'application/octet-stream',
            source_chunks: chunks.map(c => c.id)
        }
    });
    
    chunks.forEach(chunk => handleDrive({ protocol: 'ATOM_DELETE', context_id: chunk.id }));
    return { items: [createRes.items[0]], metadata: { status: 'OK' } };
  }

  function initiateDelegation(uqo, stats) {
    logInfo(`[peristaltic:delegate] 🎫 Creando ticket para delegación de ${uqo.protocol}`);
    const ticketId = `deleg_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const ticketAtom = {
        id: ticketId,
        class: 'SYSTEM_TICKET',
        handle: { ns: 'com.indra.system.peristalsis', alias: ticketId, label: `Delegación: ${uqo.protocol} (${uqo.provider})` },
        payload: {
            status: 'INITIALIZING',
            original_uqo: uqo,
            stats: stats,
            cursor: 0, chunk_size: 50, progress: 0,
            start_at: new Date().toISOString()
        }
    };
    handleLedger({ protocol: 'LEDGER_SYNC', context_id: ticketId, data: ticketAtom });
    return { 
        items: [ticketAtom], 
        metadata: { status: 'DELEGATED', ticket_id: ticketId } 
    };
  }

  function _handlePulse(uqo) {
    const ticketId = uqo.data?.ticket_id;
    const ticketRes = handleLedger({ protocol: 'ATOM_READ', context_id: ticketId });
    const ticket = ticketRes.items[0];
    if (!ticket || ticket.payload.status === 'COMPLETED') return { items: [ticket], metadata: { status: 'OK' } };

    const { original_uqo, cursor, chunk_size } = ticket.payload;

    // Ejecutar pulso de datos (Redirigiendo al Soberano original con el cursor)
    const pulseUqo = { ...original_uqo, is_peristaltic_pulse: true, data: { ...original_uqo.data, limit: chunk_size, offset: cursor } };
    const pulseRes = SystemOrchestrator.dispatch(pulseUqo);

    const items = pulseRes.items || [];
    if (items.length > 0) {
        ticket.payload.cursor += items.length;
        ticket.payload.status = items.length < chunk_size ? 'COMPLETED' : 'IN_PROGRESS';
    } else {
        ticket.payload.status = 'COMPLETED';
    }

    handleLedger({ protocol: 'LEDGER_SYNC', context_id: ticketId, data: { payload: ticket.payload } });
    return { items: [ticket], metadata: { status: 'OK', progress: ticket.payload.cursor } };
  }

  function _getTempFolderId() {
    const rootId = PropertiesService.getScriptProperties().getProperty('SYS_MOUNT_DRIVE_ROOT_ID');
    const findRes = handleDrive({ protocol: 'ATOM_READ', context_id: rootId });
    const temp = (findRes.items || []).find(f => f.name === PERISTALTIC_TEMP_FOLDER_);
    if (temp) return temp.id;
    const createRes = handleDrive({ protocol: 'ATOM_CREATE', context_id: rootId, data: { name: PERISTALTIC_TEMP_FOLDER_, mime_type: 'application/vnd.google-apps.folder' } });
    return createRes.items[0].id;
  }

  return { handle, initiateDelegation };

})();
