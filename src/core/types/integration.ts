/**
 * SACRED CONTRACT: INTEGRATION & RECORDS
 * This file defines the universal interface for all adapters and data.
 * AGNOSTICISM RULE: The system does not care about the origin of the data.
 */

/**
 * Canonical format for a data record.
 * Regardless of its origin (Notion, Sheets, JSON), 
 * data is ALWAYS presented in this format to the rest of the system.
 */
export interface Record {
  id: string;
  fields: { [key: string]: any };
  metadata?: {
    source: string;        // 'notion' | 'google-sheets' | 'json-file'
    sourceId: string;      // Original ID in the external platform
    createdAt?: string;
    updatedAt?: string;
  };
}

/**
 * Definition of a field in a schema.
 */
export interface FieldSchema {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'select'
      | 'multi-select' | 'relation' | 'url' | 'email' | 'file'
      | 'computed' | 'unknown';
  options?: string[];       // For select/multi-select
  required?: boolean;
}

/**
 * Standard result for any operation.
 */
export interface OperationResult<T = Record[]> {
  ok: boolean;
  data: T;
  error?: string;
  meta?: {
    count?: number;
    hasMore?: boolean;
    cursor?: string;
    elapsedMs?: number;
  };
}

/**
 * Optional field-mapping transform applied to each Record as it flows through the pipeline.
 * Return null to drop a record.
 */
export interface Transformer {
  transform(record: Record): Record | null;
}

/** Build a Transformer from a flat field-name mapping. */
export function makeFieldMapTransformer(fieldMap: { [src: string]: string }): Transformer {
  return {
    transform(record) {
      const newFields: { [key: string]: unknown } = {};
      for (const src in fieldMap) {
        const dst = fieldMap[src];
        if (src in record.fields) newFields[dst] = record.fields[src];
      }
      return { ...record, fields: newFields };
    }
  };
}

/**
 * THE UNIVERSAL ADAPTER CONTRACT.
 * Every adapter (Notion, Sheets, JSON) MUST implement this interface.
 */
export interface IntegrationAdapter {
  /** Unique identifier for the adapter type */
  readonly id: string;

  /** Human-readable label for the UI */
  readonly label: string;

  /** Verify that the connection is working */
  testConnection(): Promise<OperationResult<boolean>>;

  /** Get the field schema for a given source */
  getSchema(sourceId: string): Promise<OperationResult<FieldSchema[]>>;

  /** Read records from a source */
  getRecords(sourceId: string, options?: {
    cursor?: string;
    limit?: number;
    filter?: object;
    sort?: { field: string; direction: 'asc' | 'desc' }[];
  }): Promise<OperationResult<Record[]>>;

  /** Write records to a target */
  pushRecords(targetId: string, records: Record[]): Promise<OperationResult<{
    created: number;
    updated: number;
    failed: number;
  }>>;

  /** List available sources (databases, spreadsheets, files) */
  listSources(): Promise<OperationResult<{
    id: string;
    label: string;
    type: 'database' | 'spreadsheet' | 'file' | 'folder';
  }[]>>;

  /** List objects/inventory within the silo (real-time projection) */
  listInventory(): Promise<OperationResult<{
    id: string;
    name: string;
    type: 'folder' | 'file' | 'page' | 'table';
    rawMimeType?: string;
  }[]>>;

  /** 
   * NEW: Support for native resumable uploads (Sovereign Ingestion).
   * If implemented, allows direct-to-vault streaming bypass.
   */
  createResumableSession?(
    targetId: string, 
    fileName: string, 
    mimeType: string, 
    totalSize: number
  ): Promise<OperationResult<{ resumableUri: string; sessionId: string }>>;
}
