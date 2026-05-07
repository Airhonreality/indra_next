import { promises as fs } from 'node:fs';
import { join, extname, basename } from 'node:path';
import { BaseAdapter } from '@/integrations/shared/base-adapter';
import type { FieldSchema, OperationResult } from '@/core/types/integration';
import type { Record as IndraRecord } from '@/core/types/integration';

/**
 * StorageAdapter: treats the local filesystem (or any byte store) as a data silo.
 * sourceId = relative path from basePath to the file (e.g., "export.json", "data/users.json").
 */
export class StorageAdapter extends BaseAdapter {
  readonly id = 'storage';
  readonly label = 'Storage';

  constructor(private readonly basePath: string) {
    super();
  }

  async testConnection(): Promise<OperationResult<boolean>> {
    try {
      await fs.access(this.basePath);
      return this.result(true);
    } catch (e) {
      return this.error(`Storage path not accessible: ${this.basePath}`);
    }
  }

  async listSources(): Promise<OperationResult<{ id: string; label: string; type: 'database' | 'spreadsheet' | 'file' | 'folder' }[]>> {
    try {
      const entries = await fs.readdir(this.basePath, { withFileTypes: true });
      const sources = entries
        .filter(e => e.isFile() && ['.json', '.csv'].includes(extname(e.name)))
        .map(e => ({
          id: e.name,
          label: basename(e.name, extname(e.name)),
          type: 'file' as const,
        }));
      return this.result(sources, { count: sources.length });
    } catch (e) {
      return this.error(`listSources failed: ${(e as Error).message}`);
    }
  }

  async getSchema(sourceId: string): Promise<OperationResult<FieldSchema[]>> {
    try {
      const data = await this.readFile(sourceId);
      const rows = this.normalizeToArray(data);
      if (!rows.length) return this.result([]);

      const sample = rows[0] as Record<string, any>;
      const fields: FieldSchema[] = Object.keys(sample).map(key => ({
        key,
        label: key,
        type: this.inferType(sample[key]),
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
      const data = await this.readFile(sourceId);
      let rows = this.normalizeToArray(data);

      let records: IndraRecord[] = rows.map((row: any, i) => ({
        id: String(row.id ?? row.gid ?? `row_${i}`),
        fields: { ...row },
        metadata: { source: 'storage', sourceId },
      }));

      if (options?.limit) records = records.slice(0, options.limit);
      return this.result(records, { count: records.length });
    } catch (e) {
      return this.error(`getRecords failed: ${(e as Error).message}`);
    }
  }

  async listInventory(): Promise<OperationResult<any[]>> {
    try {
      // In local storage, inventory = Files in the directory
      const sources = await this.listSources();
      if (!sources.ok) return sources;
      
      const items = sources.data.map(s => ({
        id: s.id,
        name: s.label,
        type: 'file' as const,
        provider: 'storage'
      }));
      
      return this.result(items);
    } catch (e) {
      return this.error(`listInventory failed: ${(e as Error).message}`);
    }
  }

  async pushRecords(targetId: string, records: IndraRecord[]): Promise<OperationResult<{ created: number; updated: number; failed: number }>> {
    try {
      const filePath = join(this.basePath, targetId);
      let existing: any[] = [];
      try {
        const raw = await fs.readFile(filePath, 'utf-8');
        existing = this.normalizeToArray(JSON.parse(raw));
      } catch {} // file doesn't exist yet — start fresh

      const existingMap = new Map(existing.map(r => [r.id, r]));
      let created = 0, updated = 0;

      for (const record of records) {
        const row = { id: record.id, ...record.fields };
        if (existingMap.has(record.id)) { updated++; } else { created++; }
        existingMap.set(record.id, row);
      }

      const merged = [...existingMap.values()];
      await fs.mkdir(join(this.basePath, '..'), { recursive: true }).catch(() => {});
      await fs.writeFile(filePath, JSON.stringify(merged, null, 2), 'utf-8');

      return this.result({ created, updated, failed: 0 });
    } catch (e) {
      return this.error(`pushRecords failed: ${(e as Error).message}`);
    }
  }

  // ── PRIVATE HELPERS ───────────────────────────────────────────────────────

  private async readFile(relPath: string): Promise<any> {
    const filePath = join(this.basePath, relPath);
    const raw = await fs.readFile(filePath, 'utf-8');
    const ext = extname(relPath).toLowerCase();
    if (ext === '.json') return JSON.parse(raw);
    if (ext === '.csv') return this.parseCSV(raw);
    throw new Error(`Unsupported file type: ${ext}. Supported: .json, .csv`);
  }

  private normalizeToArray(data: any): any[] {
    if (Array.isArray(data)) return data;
    if (data && typeof data === 'object') {
      const firstArray = Object.values(data).find(Array.isArray);
      if (firstArray) return firstArray as any[];
      return [data];
    }
    return [];
  }

  private parseCSV(text: string): Record<string, any>[] {
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    return lines.slice(1).map(line => {
      const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
      const row: Record<string, any> = {};
      headers.forEach((h, i) => { row[h] = values[i] ?? ''; });
      return row;
    });
  }

  private inferType(val: any): FieldSchema['type'] {
    if (typeof val === 'boolean') return 'boolean';
    if (typeof val === 'number') return 'number';
    if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val)) return 'date';
    if (Array.isArray(val)) return 'multi-select';
    return 'string';
  }
}
