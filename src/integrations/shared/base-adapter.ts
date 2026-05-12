/**
 * 🏛️ ARTEFACTO: base-adapter.ts
 * ────────────
 * CAPA: Integrations / Shared (Base Contract)
 * VERSIÓN: 1.5.0
 * COMMIT: P3-M4.2-BASE-ADAPTER-CONTRACT-UPGRADE
 * 
 * 🎯 FUNCTIONAL_SCOPE:
 * - Clase abstracta que define el contrato maestro para todos los adaptadores de infraestructura.
 * - Provee utilidades de normalización de resultados y reporte de errores.
 * - Centraliza la firma de los métodos operativos (Discovery, CRUD, Inventory).
 * 
 * 🛡️ AXIOMATIC_CONTRACT:
 * - MUST: Obligar a los descendientes a implementar 'listInventory' bajo el esquema AgnosticQuery.
 * - NEVER: Manejar lógica específica de proveedor; el contrato debe permanecer ciego a la tecnología subyacente.
 * - ALWAYS: Devolver resultados envueltos en el envoltorio 'OperationResult' para manejo de errores uniforme.
 * 
 * 📜 ARCH_DECISION: Se transiciona a un modelo de 'Strict Querying' donde el descubrimiento de inventario ya no es un método sin parámetros, sino un motor de búsqueda parametrizado por contrato.
 * 
 * 🔑 KEYWORDS: #BaseAdapter #IntegrationContract #AgnosticInterface #IndraKernel
 * 🔗 RELATIONSHIPS: [IntegrationAdapter, AgnosticQuery, GoogleDriveAdapter]
 */

import { IntegrationAdapter, OperationResult, Record, FieldSchema } from '@/core/types/integration';
import { AgnosticQuery } from '@/core/inventory/types';

export abstract class BaseAdapter implements IntegrationAdapter {
  abstract readonly id: string;
  abstract readonly label: string;

  /**
   * Helper to wrap results in the standard OperationResult format.
   */
  protected result<T>(data: T, meta?: any): OperationResult<T> {
    return {
      ok: true,
      data,
      meta
    };
  }

  /**
   * Helper for error reporting.
   */
  protected error(message: string): OperationResult<any> {
    return {
      ok: false,
      data: null,
      error: message
    };
  }

  // Abstract methods from the interface that MUST be implemented by children
  abstract testConnection(): Promise<OperationResult<boolean>>;
  abstract getSchema(sourceId: string): Promise<OperationResult<FieldSchema[]>>;
  abstract getRecords(sourceId: string, options?: any): Promise<OperationResult<Record[]>>;
  abstract pushRecords(targetId: string, records: Record[]): Promise<OperationResult<any>>;
  abstract listSources(): Promise<OperationResult<any>>;
  
  /**
   * 🔍 METODO CANÓNICO: listInventory
   * Proyecta la estructura jerárquica del silo bajo demanda.
   */
  abstract listInventory(query?: AgnosticQuery): Promise<OperationResult<any[]>>;
}
