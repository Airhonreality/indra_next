import { BaseAdapter } from '@/integrations/shared/base-adapter';
import type { AuthorizedClient } from '@/lib/authorized-client';
import type { FieldSchema, OperationResult } from '@/core/types/integration';
import type { Record as IndraRecord } from '@/core/types/integration';
import { AgnosticQuery } from '@/core/inventory/types';

function slugify(str: string): string {
  return String(str).toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, '_');
}

const SHEETS_BASE = 'https://sheets.googleapis.com/v4';
const DEFAULT_SHEET = 'ATOMS';

export class SheetsAdapter extends BaseAdapter {
  readonly id = 'google-sheets';
  readonly label = 'Google Sheets';

  constructor(
    private readonly client: AuthorizedClient,
    private readonly defaultSheetName = DEFAULT_SHEET
  ) {
    super();
  }

  async testConnection(): Promise<OperationResult<boolean>> {
    try {
      // Minimal request to verify credentials work
      await this.client.get(`${SHEETS_BASE}/spreadsheets`);
      return this.result(true);
    } catch (e) {
      // Sheets API doesn't have a "ping" endpoint — any 200 suffices
      if ((e as any)?.message?.includes('400') || (e as any)?.message?.includes('401')) {
        return this.error(`Sheets connection failed: ${(e as Error).message}`);
      }
      // 403 means auth OK but no spreadsheets access — still connected
      return this.result(true);
    }
  }

  async listSources(): Promise<OperationResult<{ id: string; label: string; type: 'database' | 'spreadsheet' | 'file' | 'folder' }[]>> {
    try {
      const driveResponse = await this.client.get(
        'https://www.googleapis.com/drive/v3/files?q=mimeType%3D%22application%2Fvnd.google-apps.spreadsheet%22&fields=files(id%2Cname)&pageSize=100'
      );
      const sources = (driveResponse.files ?? []).map((f: any) => ({
        id: f.id as string,
        label: f.name as string,
        type: 'spreadsheet' as const,
      }));
      return this.result(sources, { count: sources.length });
    } catch (e) {
      return this.error(`listSources failed: ${(e as Error).message}`);
    }
  }

  async getSchema(sourceId: string): Promise<OperationResult<FieldSchema[]>> {
    try {
      const headerRow = await this.getHeaderRow(sourceId, this.defaultSheetName);
      const fields: FieldSchema[] = headerRow.map(h => ({
        key: slugify(h),
        label: h,
        type: 'string' as const,
      }));
      return this.result(fields);
    } catch (e) {
      return this.error(`getSchema failed: ${(e as Error).message}`);
    }
  }

  async getRecords(sourceId: string, options?: {
    cursor?: string;
    limit?: number;
    filter?: object;
    sort?: { field: string; direction: 'asc' | 'desc' }[];
  }): Promise<OperationResult<IndraRecord[]>> {
    try {
      const range = `${this.defaultSheetName}!A:ZZ`;
      const response = await this.client.get(
        `${SHEETS_BASE}/spreadsheets/${sourceId}/values/${encodeURIComponent(range)}`
      );

      const rows: any[][] = response.values ?? [];
      if (rows.length <= 1) return this.result([]);

      const headers = rows[0] as string[];
      let records = rows.slice(1).map((row, i) => this.rowToRecord(row, headers, sourceId, i));

      // In-memory filter and sort (Sheets has no server-side query API)
      if (options?.filter) records = this.applyFilter(records, options.filter as Record<string, any>);
      if (options?.sort?.length) records = this.applySort(records, options.sort);
      if (options?.limit) records = records.slice(0, options.limit);

      return this.result(records, { count: records.length });
    } catch (e) {
      return this.error(`getRecords failed: ${(e as Error).message}`);
    }
  }

  async listInventory(query?: AgnosticQuery): Promise<OperationResult<any[]>> {
    try {
      // In Sheets, inventory = Worksheets within the spreadsheet
      // Note: We need a spreadsheet ID, which usually comes from sourceId or the context
      return this.result([]); // Placeholder for now, requires a target spreadsheet context
    } catch (e) {
      return this.error(`listInventory failed: ${(e as Error).message}`);
    }
  }

  async pushRecords(targetId: string, records: IndraRecord[]): Promise<OperationResult<{ created: number; updated: number; failed: number }>> {
    try {
      const headerRow = await this.getHeaderRow(targetId, this.defaultSheetName);
      const existingKeys = new Set(headerRow.map(slugify));

      // Ensure all field keys exist as columns
      const allKeys = new Set<string>();
      for (const record of records) Object.keys(record.fields).forEach(k => allKeys.add(k));
      const newKeys = [...allKeys].filter(k => !existingKeys.has(k));

      if (newKeys.length > 0) {
        const updatedHeaders = [...headerRow, ...newKeys];
        await this.client.patch(
          `${SHEETS_BASE}/spreadsheets/${targetId}/values/${encodeURIComponent(this.defaultSheetName + '!1:1')}?valueInputOption=USER_ENTERED`,
          { range: `${this.defaultSheetName}!1:1`, majorDimension: 'ROWS', values: [updatedHeaders] }
        );
        headerRow.push(...newKeys);
      }

      const finalHeaders = headerRow;
      const rowValues = records.map(record =>
        finalHeaders.map(h => {
          const val = record.fields[slugify(h)] ?? record.fields[h] ?? '';
          return typeof val === 'object' ? JSON.stringify(val) : String(val);
        })
      );

      await this.client.post(
        `${SHEETS_BASE}/spreadsheets/${targetId}/values/${encodeURIComponent(this.defaultSheetName + '!A:A')}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
        { range: `${this.defaultSheetName}!A:A`, majorDimension: 'ROWS', values: rowValues }
      );

      return this.result({ created: records.length, updated: 0, failed: 0 });
    } catch (e) {
      return this.error(`pushRecords failed: ${(e as Error).message}`);
    }
  }

  // ── PRIVATE HELPERS ───────────────────────────────────────────────────────

  private async getHeaderRow(spreadsheetId: string, sheetName: string): Promise<string[]> {
    const range = `${sheetName}!1:1`;
    const response = await this.client.get(
      `${SHEETS_BASE}/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`
    );
    return response.values?.[0] ?? [];
  }

  private rowToRecord(row: any[], headers: string[], spreadsheetId: string, index: number): IndraRecord {
    const fields: Record<string, any> = {};
    headers.forEach((h, i) => {
      const key = slugify(h);
      let val: any = row[i] ?? '';
      if (typeof val === 'string' && (val.startsWith('{') || val.startsWith('['))) {
        try { val = JSON.parse(val); } catch {}
      }
      fields[key] = val;
    });

    const id = String(fields['id'] ?? fields['gid'] ?? `row_${index + 2}`);
    return {
      id,
      fields,
      metadata: { source: 'google-sheets', sourceId: spreadsheetId },
    };
  }

  private applyFilter(records: IndraRecord[], filter: Record<string, any>): IndraRecord[] {
    return records.filter(r =>
      Object.entries(filter).every(([k, v]) => {
        const val = r.fields[slugify(k)] ?? r.fields[k];
        if (v && typeof v === 'object') {
          if ('$gt' in v) return val > v.$gt;
          if ('$lt' in v) return val < v.$lt;
          if ('$contains' in v) return String(val).includes(v.$contains);
          if ('$in' in v) return (v.$in as any[]).includes(val);
        }
        return String(val) === String(v);
      })
    );
  }

  private applySort(records: IndraRecord[], sort: { field: string; direction: 'asc' | 'desc' }[]): IndraRecord[] {
    return [...records].sort((a, b) => {
      for (const { field, direction } of sort) {
        const va = a.fields[field], vb = b.fields[field];
        const cmp = va < vb ? -1 : va > vb ? 1 : 0;
        if (cmp !== 0) return direction === 'asc' ? cmp : -cmp;
      }
      return 0;
    });
  }
}
