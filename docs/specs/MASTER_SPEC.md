# INDRA NEXT — Especificación Maestra de Construcción
## Contrato Técnico y Filosófico para la Evolución Soberana

---

## 0. MANIFIESTO: LA VISIÓN TELEOLÓGICA
*Este apartado es el contexto vital para cualquier IA o Desarrollador que inicie en este proyecto.*

### ¿Qué es Indra NEXT?
Indra NEXT es el sucesor de Indra OS. Hemos abandonado el paradigma de "Sistema Operativo Monolítico" (lento, acoplado y burocrático) en favor de una **Infraestructura de Capacidades Agnósticas**. 

Indra no es una aplicación estilo Notion; es un **Hub de Inteligencia** que reside en el medio de las plataformas (Notion, Google, WhatsApp, etc.) para orquestar acciones que estas no pueden hacer por sí solas.

### Los 3 Pilares del Código:
1.  **Agnosticidad Radical:** El sistema no sabe qué datos está moviendo. Los trata como `Records` universales. No asume nombres de campos, no infiere intenciones. Se limita a proyectar la materia según el esquema definido.
2.  **Pragmatismo de Facto:** Preferimos una herramienta que migre 10,000 filas en 1 segundo que una arquitectura perfecta que no se mueve. El éxito se mide en **Acciones Ejecutadas**.
3.  **Sinceridad Componencial:** Ninguna pieza de código debe intentar ser una "navaja suiza". Si un módulo es un `Adapter`, solo habla con su API. Si es una `Action`, solo orquesta adapters.

---

## 1. IDENTIDAD DEL PROYECTO

| Campo | Valor |
|---|---|
| **Nombre** | `indra-next-sovereign` |
| **Stack** | Next.js 14+ (App Router) · TypeScript · Tailwind CSS |
| **Arquitectura** | Hexagonal (Ports & Adapters) |
| **Mantra** | "El código es el proyector, la materia es la luz." |

---

## 2. NOMENCLATURA ESTÁNDAR (Reglas de Naming)

> **Regla de oro:** No uses nombres poéticos o de ciencia ficción. Usa estándares de la industria.

| Concepto | Nombre en código | ❌ NO usar |
|---|---|---|
| Conexión externa | `integration` | ~~provider~~, ~~sovereign~~ |
| Lógica de traducción | `adapter` | ~~transductor~~, ~~transmuter~~ |
| Micro-tarea | `action` | ~~capability~~, ~~protocol~~ |
| Dato normalizado | `record` | ~~atom~~, ~~materia~~ |
| Componente visual | `component` | ~~actor~~, ~~proyector~~ |
| Widget interactivo | `widget` | ~~card de élite~~ |

---

## 3. ESTRUCTURA DEL REPOSITORIO (Escalabilidad 100+)

```
src/
├── app/                # Rutas de Next.js (API y UI)
├── core/               # El Corazón: Acciones (Mover data) y Tipos (Contratos)
├── integrations/       # Los Músculos: Adapters de Notion, Sheets, etc.
├── components/         # La Piel: Widgets de UI (Migrador, Visor)
└── lib/                # Los Nervios: Clientes de APIs y Auth
```

---

## 4. CONTRATOS TÉCNICOS (Las Interfaces Sagradas)

### 4.1 El Record (Átomo Universal NEXT)
El dato se mueve siempre en este formato plano, separando la data de la metadata.
```typescript
export interface Record {
  id: string;
  fields: { [key: string]: any };
  metadata?: { source: string; sourceId: string; };
}
```

### 4.2 IntegrationAdapter (El Enchufe Universal)
Toda integración DEBE cumplir esta interfaz para existir.
```typescript
export interface IntegrationAdapter {
  testConnection(): Promise<OperationResult<boolean>>;
  getSchema(sourceId: string): Promise<OperationResult<FieldSchema[]>>;
  getRecords(sourceId: string, options?: any): Promise<OperationResult<Record[]>>;
  pushRecords(targetId: string, records: Record[]): Promise<OperationResult<any>>;
}
```

---

## 5. PLAN DE CONSTRUCCIÓN (Roadmap)

### Fase 1: El Chasis (COMPLETADA ✅)
- Estructura de carpetas creada.
- Tipos core definidos.
- Next.js inicializado.

### Fase 2: El Trasplante (En curso 🛠️)
- Portar inteligencia de `provider_notion.gs` al nuevo `notion-adapter.ts`.
- Implementar `google-sheets-adapter.ts` usando la SDK oficial.
- Configurar Auth.js para usar el OAuth existente de Indra.

---

## 6. REGLA PARA EL AGENTE DE IA (Contexto Rápido)
Cuando este chat sea nuevo, lee este archivo. No inventes estructuras. Si necesitas crear una nueva conexión (ej. WhatsApp), crea una carpeta en `src/integrations/` que implemente la interfaz `IntegrationAdapter`. No mezcles lógica de UI con lógica de negocio.
