/**
 * =============================================================================
 * ARTEFACTO: 2_providers/provider_drive.gs
 * CAPA: 2 — Providers (Materia Física)
 * RESPONSABILIDAD: Soberano de la Materia Física (Archivos y Carpetas en Drive).
 * DOCTRINA: v21.0 — Soberanía Declarativa
 *
 * LEYES INQUEBRANTABLES:
 *   1. declare() retorna DATA PURA CONGELADA. Cero llamadas a GAS services.
 *   2. Este soberano nunca invoca a otro soberano ni al Orquestador.
 *      Si necesita delegar carga excesiva, retorna status: 'DELEGATE' en metadata.
 *   3. Solo gestiona Materia Física: DriveApp y Drive API v3.
 *      Sheets, JSON y Ledger tienen sus propios soberanos.
 * =============================================================================
 */

const DriveSovereign = (function() {

  // ── CONSTITUCIÓN DEL SOBERANO (Ley de Independencia Funcional) ──────────────
  // DATA PURA. Sin ejecución de código GAS. Sin llamadas a servicios externos.
  // Este objeto es la única fuente de verdad sobre la jurisdicción de este soberano.
  const JURISDICTION = Object.freeze({
    id:        'drive',
    label:     'Google Drive',
    class:     'SILO_PHYSICAL',
    version:   '3.2 (Declarative)',
    protocols: Object.freeze([
      'ATOM_READ',
      'ATOM_CREATE',
      'ATOM_UPDATE',
      'ATOM_DELETE',
      'ATOM_MOVE',
      'ATOM_SCAN_ROOT',
      'HEALTH_CHECK'
    ])
  });

  // ── PUNTO DE ENTRADA PÚBLICO ─────────────────────────────────────────────────
  function handle(uqo) {
    const protocol = (uqo.protocol || '').toUpperCase();
    try {
      switch (protocol) {
        case 'ATOM_READ':       return _handleRead(uqo);
        case 'ATOM_CREATE':     return _handleCreate(uqo);
        case 'ATOM_UPDATE':     return _handleUpdate(uqo);
        case 'ATOM_DELETE':     return _handleDelete(uqo);
        case 'ATOM_MOVE':       return _handleMove(uqo);
        case 'ATOM_SCAN_ROOT':  return _handleScanRoot(uqo);
        case 'HEALTH_CHECK':    return _handleHealthCheck();
        default:
          throw new Error(`Protocolo no soportado por DriveSovereign: ${protocol}`);
      }
    } catch (err) {
      logError(`[drive:fatal] ❌ ${err.message}`);
      return createIndraResponse([], err, 'DRIVE_FAILURE');
    }
  }

  // ── DECLARACIÓN DE JURISDICCIÓN ──────────────────────────────────────────────
  // Pura. Sin efectos secundarios. Segura de llamar desde cualquier contexto.
  function declare() {
    return JURISDICTION;
  }

  // ── HANDLERS PRIVADOS ────────────────────────────────────────────────────────

  function _handleHealthCheck() {
    return {
      items: [{ status: 'ALIVE', latency: 'MINIMAL', api_version: 'v3', limits: { max_file_size_sync: '20MB' } }],
      metadata: { status: 'OK' }
    };
  }

  function _handleRead(uqo) {
    const id = (uqo.context_id || '').trim();
    if (!id) return createIndraResponse([], new Error('ID faltante'), 'INVALID_ID');

    try {
      const file = Drive.Files.get(id, { fields: 'id,name,mimeType,size,webViewLink' });

      // AXIOMA v20.19: AUTOCONSCIENCIA DE CARGA BINARIA
      // Archivo demasiado grande → devolvemos el testigo al Orquestador para delegación peristáltica.
      const fileSize = Number(file.size || 0);
      const MAX_SYNC_SIZE = 20 * 1024 * 1024; // 20MB

      if (fileSize > MAX_SYNC_SIZE && uqo.data?.include_content && !uqo.is_peristaltic_pulse) {
        logWarn(`[drive:read] ⚖️ Archivo masivo (${(fileSize / 1e6).toFixed(2)}MB). Delegando.`);
        return {
          items: [],
          metadata: { status: 'DELEGATE', reason: 'FILE_SIZE_EXCEEDED_LIMIT', stats: { size: fileSize, limit: MAX_SYNC_SIZE } }
        };
      }

      if (file.mimeType === 'application/vnd.google-apps.folder') {
        const children = [];
        let pageToken = null;
        do {
          const res = Drive.Files.list({
            q: `'${id}' in parents and trashed = false`,
            fields: 'nextPageToken, files(id, name, mimeType)',
            pageToken: pageToken,
            supportsAllDrives: true,
            includeItemsFromAllDrives: true
          });
          (res.files || []).forEach(f => {
            children.push({ id: f.id, name: f.name, class: f.mimeType.includes('folder') ? 'FOLDER' : 'FILE', mime_type: f.mimeType });
          });
          pageToken = res.nextPageToken;
        } while (pageToken);

        return { items: children, metadata: { status: 'OK', count: children.length } };
      }

      const metadata = { id: file.id, name: file.name, mime_type: file.mimeType, size: fileSize };
      if (uqo.data?.include_content) {
        metadata.content = DriveApp.getFileById(id).getBlob().getDataAsString();
      }

      return createIndraResponse([metadata], null, 'READ_SUCCESS');
    } catch (err) {
      logError(`[drive:read_fatal] ❌ ID: ${id} | Error: ${err.message}`);
      return createIndraResponse([], err, 'DRIVE_READ_FAILURE');
    }
  }

  function _handleCreate(uqo) {
    const data = uqo.data || {};
    const parentId = uqo.context_id || 'root';
    const resource = { name: data.name, mimeType: data.mime_type || 'text/plain', parents: [parentId] };

    if (data.source_chunks) {
      logInfo(`[drive:assemble] Ensamblando desde ${data.source_chunks.length} fragmentos.`);
      const blobs = data.source_chunks.map(cid => DriveApp.getFileById(cid).getBlob());
      const file = DriveApp.getFolderById(parentId).createFile(blobs[0]);
      return createIndraResponse([{ id: file.id }], null, 'CREATE_SUCCESS');
    }

    const file = Drive.Files.create(resource);
    if (data.content) _handleUpdate({ context_id: file.id, data: { content: data.content } });
    return createIndraResponse([{ id: file.id }], null, 'CREATE_SUCCESS');
  }

  function _handleUpdate(uqo) {
    const id = uqo.context_id;
    const data = uqo.data || {};
    if (data.name) Drive.Files.update({ name: data.name }, id);
    if (data.content !== undefined) {
      Drive.Files.update({}, id, Utilities.newBlob(data.content, 'text/plain'));
    }
    return createIndraResponse([{ id: id }], null, 'UPDATE_SUCCESS');
  }

  function _handleDelete(uqo) {
    const id = uqo.context_id;
    Drive.Files.update({ trashed: true }, id);
    return createIndraResponse([{ id: id }], null, 'DELETE_SUCCESS');
  }

  function _handleMove(uqo) {
    const id = uqo.context_id;
    const targetFolderId = uqo.data?.target_id;
    const file = Drive.Files.get(id, { fields: 'parents' });
    const previousParents = (file.parents || []).join(',');
    Drive.Files.update({}, id, null, { addParents: targetFolderId, removeParents: previousParents });
    return createIndraResponse([{ id: id, target_id: targetFolderId }], null, 'MOVE_SUCCESS');
  }

  function _handleScanRoot(uqo) {
    // Descubre carpetas de primer nivel en la raíz del Drive para mapear territorios.
    // Solo devuelve carpetas: archivos sueltos en raíz no son átomos de la malla.
    // MAX_FOLDERS previene exceder cuotas de GAS en un solo despacho síncrono.
    const MAX_FOLDERS = 200;
    try {
      const folders = [];
      let pageToken = null;

      do {
        const res = Drive.Files.list({
          q: "'root' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
          fields: 'nextPageToken, files(id, name, mimeType, webViewLink)',
          pageSize: 100,
          pageToken: pageToken,
          supportsAllDrives: false,
          orderBy: 'name'
        });

        (res.files || []).forEach(f => {
          if (folders.length < MAX_FOLDERS) {
            folders.push({ id: f.id, name: f.name, class: 'FOLDER', mime_type: f.mimeType, url: f.webViewLink });
          }
        });

        pageToken = res.nextPageToken;
      } while (pageToken && folders.length < MAX_FOLDERS);

      return {
        items: folders,
        metadata: { status: 'OK', code: 'SCAN_SUCCESS', count: folders.length, truncated: folders.length >= MAX_FOLDERS }
      };
    } catch (err) {
      logError(`[drive:scan_root_fatal] ❌ ${err.message}`);
      return createIndraResponse([], err, 'SCAN_FAILURE');
    }
  }

  // ── INTERFAZ PÚBLICA ─────────────────────────────────────────────────────────
  return { handle, declare };

})();
