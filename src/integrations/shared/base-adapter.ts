import { IntegrationAdapter, OperationResult, Record, FieldSchema } from '@/core/types/integration';

/**
 * BASE ADAPTER
 * Abstract class providing common utility for all integrations.
 * Every new integration (WhatsApp, Slack, etc.) should extend this.
 */
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
}
