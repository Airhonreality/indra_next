// =============================================================================
// ARTEFACTO: 2_providers/provider_pipeline.gs
// CAPA: 2 — Providers (Virtual / Internal)
// RESPONSABILIDAD: Operador de transformaciones en memoria. No llama a APIs externas.
//         Recibe ítems del Step anterior (via uqo.data.items) y los procesa
//         según el protocolo de transformación solicitado (ADR 004).
//
// AXIOMAS:
//   - Autonomía del Backend: El cómputo pesado y de negocio vive aquí.
//   - Motor V8: Usa Function() dinámico para TRANSFORM_COMPUTE.
//   - Es un tubo determinista: Mismo input + misma query = mismo output.
// =============================================================================

/**
 * =============================================================================
 * SOBERANO: PipelineSovereign (v21.0 — Soberanía Declarativa)
 * =============================================================================
 */
const PipelineSovereign = (function() {

  const JURISDICTION = Object.freeze({
    id:       'pipeline',
    label:    'Transformador',
    class:    'LOGIC_ENGINE',
    exposure: 'internal',
    version:  '21.0',
    protocols: Object.freeze([
      'TRANSFORM_FILTER',
      'TRANSFORM_MAP',
      'TRANSFORM_COMPUTE',
      'TRANSFORM_AGGREGATE',
      'TRANSFORM_SORT',
      'TRANSFORM_TEMPLATE'
    ])
  });

  function handle(uqo) { return handlePipeline(uqo); }
  function declare()   { return JURISDICTION; }

  return { handle, declare };
})();

/**
 * Punto de entrada único para el pipeline.
 * El ejecutor de workflows inyecta los ítems en uqo.data.items.
 */
function handlePipeline(uqo) {
  const protocol = (uqo.protocol || '').toUpperCase();
  const items = (uqo.data && uqo.data.items) || [];

  logInfo(`[provider_pipeline] Ejecutando: ${protocol} sobre ${items.length} ítems.`);

  if (protocol === 'TRANSFORM_FILTER') return _pipe_handleFilter(items, uqo.query);
  if (protocol === 'TRANSFORM_MAP') return _pipe_handleMap(items, uqo.query);
  if (protocol === 'TRANSFORM_COMPUTE') return _pipe_handleCompute(items, uqo.query);
  if (protocol === 'TRANSFORM_SORT') return _pipe_handleSort(items, uqo.query);
  if (protocol === 'TRANSFORM_AGGREGATE') return _pipe_handleAggregate(items, uqo.query);
  if (protocol === 'TRANSFORM_TEMPLATE') return _pipe_handleTemplate(items, uqo.query);

  return { items: [], metadata: { status: 'ERROR', error: `Protocolo ${protocol} no implementado.` } };
}

// ─── HANDLERS DE TRANSFORMACIÓN ───────────────────────────────────────────────

/**
 * TRANSFORM_FILTER: Filtra una colección de átomos basado en condiciones.
 * uqo.query.filters = [{ field, operator, value }]
 */
function _pipe_handleFilter(items, query) {
  const filters = query.filters || [];
  if (filters.length === 0) return { items, metadata: { status: 'OK' } };

  const filtered = items.filter(item => {
    return filters.every(f => {
      const val = item[f.field] !== undefined ? item[f.field] : (item.raw && item.raw[f.field]);

      switch (f.operator) {
        case 'EQUALS': return String(val) === String(f.value);
        case 'NOT_EQUALS': return String(val) !== String(f.value);
        case 'CONTAINS': return String(val).toLowerCase().includes(String(f.value).toLowerCase());
        case 'GREATER_THAN': return Number(val) > Number(f.value);
        case 'LESS_THAN': return Number(val) < Number(f.value);
        default: return true;
      }
    });
  });

  return { items: filtered, metadata: { status: 'OK', total_objects: filtered.length } };
}

/**
 * TRANSFORM_MAP: Renombra o selecciona campos de cada átomo.
 * uqo.query.fields = { "original_key": "new_key" }
 */
function _pipe_handleMap(items, query) {
  const fieldMap = query.fields || {};
  const mapKeys = Object.keys(fieldMap);

  const mapped = items.map(item => {
    const newItem = { ...item };
    mapKeys.forEach(oldKey => {
      const newKey = fieldMap[oldKey];
      const val = item[oldKey] !== undefined ? item[oldKey] : (item.raw && item.raw[oldKey]);
      newItem[newKey] = val;
    });
    return newItem;
  });

  return { items: mapped, metadata: { status: 'OK' } };
}

/**
 * TRANSFORM_COMPUTE: Ejecuta una fórmula JavaScript (V8) sobre cada átomo.
 * uqo.query.formula = "a * b"
 * uqo.query.target_field = "total"
 */
function _pipe_handleCompute(items, query) {
  const formula = query.formula;
  const target = query.target_field || 'computed_value';

  if (!formula) return { items, metadata: { status: 'ERROR', error: 'Faltan parámetros: formula' } };

  const computed = items.map(item => {
    try {
      // Inyectar contexto: propiedades del átomo + propiedades del raw
      const context = { ...item, ...(item.raw || {}) };
      const keys = Object.keys(context).filter(k => k !== 'raw'); // evitar recursión circular
      const values = keys.map(k => context[k]);

      // Crear función dinámica en V8
      const fn = new Function(...keys, `try { return (${formula}); } catch(e) { return null; }`);
      const result = fn(...values);

      return { ...item, [target]: result };
    } catch (e) {
      logWarn(`[provider_pipeline] Error evaluando fórmula "${formula}" en ítem ${item.id}: ${e.message}`);
      return { ...item, [target]: null };
    }
  });

  return { items: computed, metadata: { status: 'OK' } };
}

/**
 * TRANSFORM_SORT: Ordena los ítems por uno o varios campos.
 * uqo.query.sort = [{ field, direction: 'ASC'|'DESC' }]
 */
function _pipe_handleSort(items, query) {
  const sortDefs = query.sort || [];
  if (sortDefs.length === 0) return { items, metadata: { status: 'OK' } };

  const sorted = [...items].sort((a, b) => {
    for (const s of sortDefs) {
      const valA = a[s.field] ?? (a.raw && a.raw[s.field]);
      const valB = b[s.field] ?? (b.raw && b.raw[s.field]);

      if (valA === valB) continue;

      const factor = s.direction === 'DESC' ? -1 : 1;
      return valA > valB ? factor : -factor;
    }
    return 0;
  });

  return { items: sorted, metadata: { status: 'OK' } };
}

/**
 * TRANSFORM_AGGREGATE: Agrupa y calcula totales (SUM, COUNT).
 * uqo.query.group_by = "field"
 * uqo.query.operations = [{ field, op: "SUM"|"COUNT"|"AVG", name: "resultado" }]
 */
function _pipe_handleAggregate(items, query) {
  const groupBy = query.group_by;
  const ops = query.operations || [];

  if (!groupBy) return { items, metadata: { status: 'ERROR', error: 'TRANSFORM_AGGREGATE requiere group_by.' } };

  const groups = {};
  items.forEach(item => {
    const key = item[groupBy] ?? (item.raw && item.raw[groupBy]) ?? 'Sin grupo';
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  });

  const results = Object.keys(groups).map(groupKey => {
    const groupItems = groups[groupKey];
    const resultItem = {
      id: `agg_${groupKey}`,
      handle: {
        ns: 'com.indra.pipeline.aggregate',
        alias: _system_slugify_(groupKey),
        label: groupKey
      },
      class: 'DATA_ROW',
      [groupBy]: groupKey,
      count: groupItems.length,
      protocols: []
    };

    ops.forEach(opDef => {
      const field = opDef.field;
      const op = opDef.op;
      const name = opDef.name || `${op}_${field}`;

      if (op === 'COUNT') {
        resultItem[name] = groupItems.length;
      } else if (op === 'SUM' || op === 'AVG') {
        const sum = groupItems.reduce((acc, it) => {
          const val = Number(it[field] ?? (it.raw && it.raw[field]) ?? 0);
          return acc + (isNaN(val) ? 0 : val);
        }, 0);
        resultItem[name] = op === 'AVG' ? sum / groupItems.length : sum;
      }
    });

    return resultItem;
  });

  return { items: results, metadata: { status: 'OK', total_objects: results.length } };
}

/**
 * TRANSFORM_TEMPLATE: Llenar un template textual por cada ítem.
 * uqo.query.template = "Hola {{name}}, tu saldo es {{balance}}"
 * uqo.query.target_field = "message"
 */
function _pipe_handleTemplate(items, query) {
  const template = query.template;
  const target = query.target_field || 'rendered_text';

  if (!template) return { items, metadata: { status: 'ERROR', error: 'Falta parámetro template.' } };

  const rendered = items.map(item => {
    let result = template;
    const context = { ...item, ...(item.raw || {}) };

    // Buscar todas las ocurrencias de {{campo}}
    const regex = /\{\{(.+?)\}\}/g;
    result = result.replace(regex, (match, fieldName) => {
      const field = fieldName.trim();
      return context[field] !== undefined ? context[field] : '';
    });

    return { ...item, [target]: result };
  });

  return { items: rendered, metadata: { status: 'OK' } };
}
