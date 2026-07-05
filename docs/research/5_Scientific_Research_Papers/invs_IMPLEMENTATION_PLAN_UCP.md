# Plan de Implementación: Universal Calendar Provider (UCP)

Este documento detalla la hoja de ruta técnica, los axiomas operativos y los patrones de diseño para el despliegue del proveedor de calendario universal en el ecosistema Indra.

---

## 1. AXIOMAS Y RESTRICCIONES CLAVE

### A1 — Axioma de la Fuente Única (Single Source of Truth)
El provider **no persiste** eventos en una base de datos interna de Indra. Actúa como un **Tubo Sincero** hacia los silos originales (Google, Outlook, etc.). La "Realidad" reside en el proveedor externo; Indra solo proyecta y manipula.

### A2 — Axioma de la Identidad Híbrida
Para permitir el modo "Multi-reality", la identidad del átomo debe ser resoluble de vuelta a su origen.
**ID Canon:** `{silo_id}:{account_alias}|{native_event_id}`.

### R1 — Restricción de Estética (No Branded UI)
Está estrictamente prohibido usar colores corporativos (azul Outlook, amarillo Trello) para el cuerpo del átomo. El átomo debe ser estéticamente neutro según el Design System de Indra. La procedencia se indica solo por icono y label de cuenta en el header.

### R2 — Restricción de Paginación
Las consultas masivas deben ser "Windowed". No se descarga el calendario histórico. Se opera en ventanas temporales (ej. T-30 días a T+90 días) para evitar timeouts en GAS y saturación en React.

---

## 2. PATRONES DE CÓDIGO (LEY DE ADUANA)

### C1 — Normalización de Payload (Ingreso)
Toda respuesta de un adaptador externo (Google/Outlook) debe pasar por un `_ucp_sanitize_()` que fuerce el esquema ADR-001. Si falta el campo `start` o `end`, el átomo se reclasifica automáticamente a `ERROR_REPORT` y se bloquea su entrada al core.

### C2 — Shadow Metadata Pattern
Para estados que Indra requiere pero el silo no soporta (ej. "Prioridad Cognitiva" en un evento de Outlook), se utilizará el patrón de **Metadata Shadow**:
- El provider intenta guardar la nota en un campo oculto del recurso nativo (ej. el campo 'Private Notes' o 'Extended Properties').
- Si no es posible, se marca el átomo con un tag `[VIRTUAL_DATA]` en el payload.

---

## 3. ANTIPATRONES A EVITAR (SHITLIST)

- ❌ **Sync-Polling:** No implementar funciones que "scaneen" calendarios en background sin interacción del usuario. Indra es un sistema reactivo y orientado a la intención.
- ❌ **UI-Logic in GAS:** El provider no decide cómo se ve un evento. Solo entrega datos. Si un evento es "Urgente", el provider entrega el dato, el `CalendarEngine` de React decide el renderizado.
- ❌ **Hardcoded Silos:** No usar `if (provider === 'google')` en el router principal. Usar el patrón de registro de adaptadores dinámicos.

---

## 4. FASES DE DESARROLLO

| Fase | Tarea | Artefacto Clave | Status |
| :--- | :--- | :--- | :--- |
| **F1** | Estructura Core & Registry | `provider_calendar_universal.js` | 🏗️ |
| **F2** | Adaptador Base (Tabular) | `adapter_tabular.gs` | 📅 |
| **F3** | Protocolo BATCH | `logic_calendar_batch.gs` | 📅 |
| **F4** | UI React: Multi-Reality View | `CalendarEngine.jsx` | 📅 |

---

## 5. DEPENDENCIAS CLAVE

1.  **`system_config.gs`**: Para la gestión de secretos (API Keys de Google/MS).
2.  **`protocol_router.gs`**: Para el despacho de directivas `CALENDAR_BATCH`.
3.  **`MCEP_Bridge`**: Para las sugerencias cogno-agentivas del sistema.

---

> **Nota Final:** El éxito de este provider radica en su capacidad de hacer que 10 cuentas de calendario se sientan como una única línea de tiempo inteligente y fluida.
