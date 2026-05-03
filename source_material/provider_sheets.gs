/**
 * =============================================================================
 * ARTEFACTO: 2_providers/provider_sheets.gs
 * RESPONSABILIDAD: Motor de Base de Datos Tabular Agnóstico (ERP-Grade).
 * DOCTRINA: v21.0 — Soberanía Declarativa
 *
 * LEYES INQUEBRANTABLES:
 *   1. declare() retorna DATA PURA CONGELADA. Cero GAS calls.
 *   2. I/O de bajo nivel se delega a infra_tabular.gs — sin duplicación.
 *   3. Nunca lanza excepciones que maten el proceso. Devuelve envelope de error.
 * =============================================================================
 */

const SheetsSovereign = (function() {

  // ── CONSTITUCIÓN DEL SOBERANO ────────────────────────────────────────────────
  const JURISDICTION = Object.freeze({
    id:        'sheets',
    label:     'Google Sheets',
    class:     'SILO_TABULAR',
    version:   '2.0 (Declarative)',
    protocols: Object.freeze([
      'TABULAR_STREAM',
      'TABULAR_UPDATE',
      'TABULAR_CREATE',
      'TABULAR_PURGE',
      'SCHEMA_MUTATE',
      'HEALTH_CHECK'
    ])
  });

  // ── PUNTO DE ENTRADA PÚBLICO ─────────────────────────────────────────────────
  function handle(uqo) {
    const protocol = (uqo.protocol || '').toUpperCase();

    if (protocol === 'TABULAR_STREAM') {
      const stack = new Error().stack.split('\n').slice(1, 6).join(' -> ');
      logInfo(`[sheets:probe] 🕵️ STREAM | Context: ${uqo.context_id} | Stack: ${stack}`);
    }

    try {
      switch (protocol) {
        case 'TABULAR_STREAM':  return _sheets_handleStream(uqo);
        case 'TABULAR_UPDATE':  return _sheets_handleUpdate(uqo);
        case 'TABULAR_CREATE':  return _sheets_handleCreate(uqo);
        case 'TABULAR_PURGE':   return _sheets_handlePurge(uqo);
        case 'SCHEMA_MUTATE':   return _sheets_handleSchemaMutate(uqo);
        case 'HEALTH_CHECK':    return _sheets_handleHealthCheck();
        default:
          return createIndraResponse([], new Error(`Protocolo desconocido por SheetsSovereign: ${protocol}`), 'SHEETS_PROTOCOL_UNKNOWN');
      }
    } catch (err) {
      logError(`[sheets:fatal] ❌ ${err.message}`);
      return createIndraResponse([], err, 'SHEETS_FAILURE');
    }
  }

  // ── DECLARACIÓN DE JURISDICCIÓN ──────────────────────────────────────────────
  function declare() {
    return JURISDICTION;
  }

  // ── INTERFAZ PÚBLICA ─────────────────────────────────────────────────────────
  return { handle, declare };

})();

// Alias de compatibilidad — el Orquestador llama a handleSheets() por nombre.
function handleSheets(uqo) { return SheetsSovereign.handle(uqo); }

// ── HANDLERS PRIVADOS ────────────────────────────────────────────────────────
// Definidos como funciones globales con convención de nombre _sheets_* para
// indicar pertenencia a este soberano. GAS no soporta módulos privados reales.

function _sheets_handleHealthCheck() {
  return {
    items: [{ status: 'ALIVE', limits: { max_cells_sync: 20000 }, api_version: '20.24 (Industrial)' }],
    metadata: { status: 'OK' }
  };
}

/**
 * TABULAR_CREATE: Materializa una nueva Spreadsheet vacía.
 * Delega I/O de bajo nivel en infra_tabular.gs.
 */
function _sheets_handleCreate(uqo) {
  const label = uqo.data?.handle?.label || uqo.data?.name || `Indra Sheet ${Date.now()}`;
  const ssId = _infra_tabular_create_ss_(label);
  return {
    items: [{ id: ssId }],
    metadata: { status: 'OK', code: 'CREATE_SUCCESS', physical_id: ssId, silo_url: `https://docs.google.com/spreadsheets/d/${ssId}` }
  };
}

/**
 * TABULAR_STREAM: Motor de consulta con predicados avanzados.
 * Delega apertura de Spreadsheet a infra_tabular.gs.
 */
function _sheets_handleStream(uqo) {
  const ssId = uqo.context_id || uqo.data?.silo_id;
  if (!ssId) throw new Error('Stream requiere ID de Silo (context_id).');

  const ss = _infra_tabular_open_ss_(ssId);
  const sheet = _sheets_get_target_tab_(ss, uqo);

  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  const cellCount = lastRow * lastCol;

  if (cellCount > 20000 && !uqo.is_peristaltic_pulse) {
    return { items: [], metadata: { status: 'DELEGATE', stats: { rows: lastRow, cols: lastCol } } };
  }

  const fullGrid = sheet.getDataRange().getValues();
  if (fullGrid.length <= 1) return { items: [], metadata: { status: 'OK', count: 0 } };

  const headers = fullGrid[0];
  let records = fullGrid.slice(1).map(row => _sheets_row_to_record_(row, headers));

  if (uqo.data?.filter) records = records.filter(rec => _sheets_apply_filters_(rec, uqo.data.filter));
  if (uqo.data?.sort)   records = _sheets_apply_sort_(records, uqo.data.sort);
  if (uqo.data?.limit)  records = records.slice(uqo.data.offset || 0, (uqo.data.offset || 0) + uqo.data.limit);

  return { items: records, metadata: { status: 'OK', count: records.length } };
}

/**
 * TABULAR_UPDATE: El Motor CRUD Universal.
 */
function _sheets_handleUpdate(uqo) {
  const ssId = uqo.context_id || uqo.data?.silo_id;
  const actions = uqo.data?.actions || [];
  if (!ssId) throw new Error('Update requiere ID de Silo (context_id).');

  const ss = _infra_tabular_open_ss_(ssId);
  const sheet = _sheets_get_target_tab_(ss, uqo);

  actions.forEach(action => {
    const type = (action.type || 'UPSERT').toUpperCase();

    if (type === 'DELETE_QUERY') {
      _sheets_mass_delete_(sheet, action.filter || {});
      return;
    }

    const targetId = action.id;
    if (!targetId && type !== 'CREATE') return;

    const headers = sheet.getDataRange().getValues()[0];
    const pkIdx = _sheets_discover_pk_(headers);
    const fullData = sheet.getDataRange().getValues();
    let targetRowIdx = -1;

    if (targetId) {
      for (let i = 1; i < fullData.length; i++) {
        if (String(fullData[i][pkIdx]) === String(targetId)) { targetRowIdx = i + 1; break; }
      }
    }

    if (type === 'DELETE' && targetRowIdx !== -1) {
      sheet.deleteRow(targetRowIdx);
    } else {
      const isUpdate = (targetRowIdx !== -1);
      
      // Filtro de Seguridad Axiomática
      if (type === 'CREATE' && isUpdate) return;
      if (type === 'UPDATE' && !isUpdate) return;
      // Si es UPSERT, siempre procedemos (ya sea para crear o actualizar)

      _sheets_ensure_columns_(sheet, Object.keys(action.data || {}));

      const updatedHeaders = sheet.getDataRange().getValues()[0];
      const rowArr = isUpdate ? fullData[targetRowIdx - 1] : new Array(updatedHeaders.length).fill('');

      updatedHeaders.forEach((h, idx) => {
        const slug = _system_slugify_(h);
        const key = Object.keys(action.data || {}).find(k => _system_slugify_(k) === slug);
        
        if (key) {
          let val = action.data[key];
          
          // Normalización Axiomática en el Borde
          if (val !== null && val !== undefined) {
            if (typeof val === 'object') {
              rowArr[idx] = JSON.stringify(val);
            } else {
              rowArr[idx] = String(val);
            }
          } else if (!isUpdate) {
             rowArr[idx] = ''; // Solo limpiamos si es fila nueva
          }
        }
      });

      rowArr[pkIdx] = targetId;
      if (isUpdate) {
        sheet.getRange(targetRowIdx, 1, 1, rowArr.length).setValues([rowArr]);
      } else {
        sheet.appendRow(rowArr);
      }
    }
  });

  return { metadata: { status: 'OK' } };
}

/**
 * TABULAR_PURGE: Vacía una tabla manteniendo la cabecera.
 */
function _sheets_handlePurge(uqo) {
  const ssId = uqo.context_id || uqo.data?.silo_id;
  if (!ssId) throw new Error('Purge requiere ID de Silo (context_id).');

  const ss = _infra_tabular_open_ss_(ssId);
  const sheet = _sheets_get_target_tab_(ss, uqo);

  const lastRow = sheet.getLastRow();
  if (lastRow > 1) sheet.deleteRows(2, lastRow - 1);

  logInfo(`[sheets:purge] Tabla higienizada.`);
  return { metadata: { status: 'OK' } };
}

/**
 * SCHEMA_MUTATE: Mutación de estructura de tabla (columnas).
 */
function _sheets_handleSchemaMutate(uqo) {
  const ssId = uqo.context_id;
  const fields = uqo.data?.fields || [];
  if (!ssId || fields.length === 0) throw new Error('SCHEMA_MUTATE requiere context_id y data.fields.');

  const ss = _infra_tabular_open_ss_(ssId);
  const sheet = _sheets_get_target_tab_(ss, uqo);

  _sheets_ensure_columns_(sheet, fields.map(f => f.label || f.id));

  return { metadata: { status: 'OK', code: 'SCHEMA_MUTATED' } };
}

// ── UTILIDADES DE APOYO ───────────────────────────────────────────────────────

function _sheets_mass_delete_(sheet, filter) {
  const fullGrid = sheet.getDataRange().getValues();
  if (fullGrid.length <= 1) return;
  const headers = fullGrid[0];
  const rowsToDelete = [];
  for (let i = 1; i < fullGrid.length; i++) {
    const record = _sheets_row_to_record_(fullGrid[i], headers);
    if (_sheets_apply_filters_(record, filter)) rowsToDelete.push(i + 1);
  }
  rowsToDelete.reverse().forEach(idx => sheet.deleteRow(idx));
  logInfo(`[sheets:purge] ${rowsToDelete.length} filas eliminadas.`);
}

function _sheets_ensure_columns_(sheet, keys) {
  const headers = sheet.getDataRange().getValues()[0];
  const slugs = headers.map(h => _system_slugify_(h));
  keys.forEach(key => {
    const slug = _system_slugify_(key);
    if (slugs.indexOf(slug) === -1) {
      logInfo(`[sheets:schema] Añadiendo columna: ${key}`);
      const lastCol = sheet.getLastColumn();
      sheet.getRange(1, lastCol + 1).setValue(key);
      slugs.push(slug);
    }
  });
}

function _sheets_apply_filters_(rec, filter) {
  return Object.entries(filter).every(([k, v]) => {
    const val = rec[_system_slugify_(k)];
    if (v && typeof v === 'object') {
      if (v.$gt !== undefined)       return val > v.$gt;
      if (v.$lt !== undefined)       return val < v.$lt;
      if (v.$contains !== undefined) return String(val).includes(v.$contains);
      if (v.$in !== undefined)       return v.$in.includes(val);
    }
    return String(val) === String(v);
  });
}

function _sheets_apply_sort_(records, sort) {
  if (!sort || !sort.field) return records;
  const dir = (sort.direction || 'asc').toLowerCase() === 'desc' ? -1 : 1;
  return records.slice().sort((a, b) => {
    const va = a[sort.field], vb = b[sort.field];
    return (va < vb ? -1 : va > vb ? 1 : 0) * dir;
  });
}

function _sheets_row_to_record_(row, headers) {
  const record = {};
  headers.forEach((h, i) => {
    const key = _system_slugify_(h);
    let val = row[i];
    if (typeof val === 'string' && (val.startsWith('{') || val.startsWith('['))) {
      try { val = JSON.parse(val); } catch (e) {}
    }
    record[key] = val;
  });
  return record;
}

function _sheets_discover_pk_(headers) {
  const slugs = headers.map(h => _system_slugify_(h));
  const idx = slugs.indexOf('id') !== -1 ? slugs.indexOf('id') : slugs.indexOf('gid');
  return idx !== -1 ? idx : 0;
}

function _sheets_get_target_tab_(ss, uqo) {
  const name = uqo.data?.sheet_name || 'ATOMS';
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  return sheet;
}
