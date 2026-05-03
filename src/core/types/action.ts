/**
 * SACRED CONTRACT: ACTIONS
 * Defines how the system requests and reports on high-level tasks.
 */

export interface ActionRequest {
  action: 'migrate' | 'sync' | 'preview' | 'schema';
  source: {
    integration: string;  // 'notion' | 'google-sheets' | 'json-file'
    id: string;           // ID of the DB, Sheet, or file
  };
  target?: {
    integration: string;
    id: string;
  };
  options?: {
    fieldMap?: { [sourceField: string]: string };  // Manual field mapping
    limit?: number;
    dryRun?: boolean;     // true = simulate only, do not write
  };
}

export interface ActionResult {
  ok: boolean;
  summary: string;        // e.g., "342 records migrated in 1.2s"
  details?: {
    recordsRead: number;
    recordsWritten: number;
    recordsFailed: number;
    elapsedMs: number;
    errors?: string[];
  };
}
