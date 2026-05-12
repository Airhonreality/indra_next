/**
 * 🧱 ARTEFACTO: types.ts
 * ────────────
 * CAPA: Core / Inventory (Standard Contracts)
 * VERSIÓN: 1.0.0
 * COMMIT: P3-M4.1-INVENTORY-CONTRACT-NORMALIZATION
 * 
 * 🎯 FUNCTIONAL_SCOPE:
 * - Definición de interfaces y esquemas para consultas de inventario agnósticas.
 * - Estandarización de la respuesta de descubrimiento para todos los silos.
 * 
 * 🛡️ AXIOMATIC_CONTRACT:
 * - MUST: Mantener la neutralidad tecnológica; ninguna propiedad debe ser específica de un proveedor.
 * - NEVER: Permitir parámetros de consulta sin tipado estricto o validación de esquema.
 * - ALWAYS: Proveer un mecanismo de paginación basado en cursores opacos para escalabilidad masiva.
 * 
 * 📜 ARCH_DECISION: Se implementa un modelo de 'Request-Response Symmetry' donde la consulta (AgnosticQuery) y la respuesta (AgnosticInventoryResponse) están estrictamente acopladas por contrato pero desacopladas por implementación en los adaptadores.
 * 
 * 🔑 KEYWORDS: #InventoryTypes #AgnosticQuery #StandardInterface #PaginationContract
 * 🔗 RELATIONSHIPS: [BaseAdapter, GoogleDriveAdapter, StorageAdapter]
 */

import { z } from 'zod';

/**
 * ZOD SCHEMA: AgnosticQuerySchema
 * Validación en tiempo de ejecución para parámetros de URL.
 */
export const AgnosticQuerySchema = z.object({
  parentId: z.string().default('root'),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(50),
  search: z.string().optional(),
  type: z.enum(['file', 'folder', 'all']).default('all'),
  depth: z.number().int().min(0).max(5).default(0),
});

export type AgnosticQuery = z.infer<typeof AgnosticQuerySchema>;

/**
 * INTERFACE: AgnosticInventoryItem
 * Representación atómica de un recurso en cualquier infraestructura.
 */
export interface AgnosticInventoryItem {
  id: string;
  name: string;
  type: 'file' | 'folder';
  rawMimeType?: string;
  size?: number;
  updatedAt?: string;
  isShared?: boolean;
  parentId: string;
  provider: string;
  metadata?: Record<string, any>;
}

/**
 * INTERFACE: AgnosticInventoryResponse
 * Payload canónico de respuesta del servidor.
 */
export interface AgnosticInventoryResponse {
  objects: AgnosticInventoryItem[];
  nextCursor?: string;
  provider: string;
  diagnostics: {
    latencyMs: number;
    totalCount?: number;
  };
}
