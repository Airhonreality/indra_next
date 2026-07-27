import { promises as fs } from 'node:fs';
import { dirname, extname, isAbsolute, relative, resolve } from 'node:path';
import { BaseAdapter } from '@/integrations/shared/base-adapter';
import type { CapabilityManifest } from '@/core/types/capabilities';
import type { FieldSchema, OperationResult } from '@/core/types/integration';
import type { Record as IndraRecord } from '@/core/types/integration';
import type { AgnosticQuery } from '@/core/inventory/types';

/**
 * Local filesystem adapter for storage volumes mounted in Indra.
 */
export class StorageAdapter extends BaseAdapter {
  static readonly meta = {
    color: 'text-amber-600 dark:text-amber-400',
    icon: 'database',
    label: 'Storage',
    accentCss: 'bg-amber-500',
  };

  readonly capabilities: CapabilityManifest = {
    canListInventory: true,
    canDownload: false,
    canStream: false,
    canUpload: true,
    canResumableUpload: false,
    canDelete: false,
    canRename: false,
    canMove: false,
    canThumbnail: false,
    canQuota: false,
    canPublish: false,
  };

  readonly id = 'storage';
  readonly label = 'Storage';
  private readonly basePathAbs: string;

  constructor(basePath: string) {
    super();
    this.basePathAbs = resolve(basePath);
  }

  async testConnection(): Promise<OperationResult<boolean>> {
    try {
      await fs.access(this.basePathAbs);
      return this.result(true);
    } catch {
      return this.error(`Storage path not accessible: ${this.basePathAbs}`);
    }
  }

  async listSources(): Promise<OperationResult<{ id: string; label: string; type: 'database' | 'spreadsheet' | 'file' | 'folder' }[]>> {
    try {
      const entries = await fs.readdir(this.basePathAbs, { withFileTypes: true });
      const sources = entries
        .filter((entry) => entry.isFile() || entry.isDirectory())
        .map((entry) => ({
          id: entry.name,
          label: entry.name,
          type: entry.isDirectory() ? ('folder' as const) : ('file' as const),
        }))
        .sort((left, right) => {
          if (left.type !== right.type) return left.type === 'folder' ? -1 : 1;
          return left.label.localeCompare(right.label);
        });

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
      const fields: FieldSchema[] = Object.keys(sample).map((key) => ({
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
      const rows = this.normalizeToArray(data);
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

  async listInventory(query?: AgnosticQuery): Promise<OperationResult<any[]>> {
    try {
      const parentId = query?.parentId || 'root';
      const folderRel = parentId === 'root' ? '' : this.normalizeRelativeId(parentId);
      const folderPath = folderRel ? this.resolveDirectoryPath(folderRel) : this.basePathAbs;
      const entries = await fs.readdir(folderPath, { withFileTypes: true });

      const items = await Promise.all(entries.map(async (entry) => {
        const relativeId = folderRel ? `${folderRel}/${entry.name}` : entry.name;
        const normalizedId = this.normalizeRelativeId(relativeId);
        const item: any = {
          id: normalizedId,
          name: entry.name,
          type: entry.isDirectory() ? 'folder' : 'file',
          parentId: parentId === 'root' ? 'root' : folderRel,
          provider: 'storage',
          metadata: {
            path: normalizedId,
          },
        };

        if (entry.isFile()) {
          item.rawMimeType = this.mimeFromExtension(extname(entry.name));
          item.size = await this.statSize(relativeId);
        }

        return item;
      }));

      const search = query?.search?.trim().toLowerCase();
      const filtered = items
        .filter((item) => query?.type === 'all' || item.type === query?.type)
        .filter((item) => !search || item.name.toLowerCase().includes(search))
        .sort((left, right) => {
          if (left.type !== right.type) return left.type === 'folder' ? -1 : 1;
          return left.name.localeCompare(right.name);
        });

      const limited = typeof query?.limit === 'number' ? filtered.slice(0, query.limit) : filtered;
      return this.result(limited, { count: limited.length });
    } catch (e) {
      return this.error(`listInventory failed: ${(e as Error).message}`);
    }
  }

  async resolvePath(sourceId: string): Promise<OperationResult<string[]>> {
    try {
      const normalized = this.normalizeRelativeId(sourceId);
      if (!normalized) {
        return this.result(['root']);
      }

      const target = this.resolveFileOrDirectoryPath(normalized);
      const stat = await fs.stat(target);
      const segments = normalized.split('/');
      const pathSegments = stat.isDirectory() ? segments : segments.slice(0, -1);
      return this.result(['root', ...pathSegments]);
    } catch (e) {
      return this.error(`resolvePath failed: ${(e as Error).message}`);
    }
  }

  async pushRecords(targetId: string, records: IndraRecord[]): Promise<OperationResult<{ created: number; updated: number; failed: number }>> {
    try {
      const filePath = this.resolveFilePath(targetId);
      let existing: any[] = [];
      try {
        const raw = await fs.readFile(filePath, 'utf-8');
        existing = this.normalizeToArray(JSON.parse(raw));
      } catch {
        existing = [];
      }

      const existingMap = new Map(existing.map((row) => [row.id, row]));
      let created = 0;
      let updated = 0;

      for (const record of records) {
        const row = { id: record.id, ...record.fields };
        if (existingMap.has(record.id)) {
          updated++;
        } else {
          created++;
        }
        existingMap.set(record.id, row);
      }

      const merged = [...existingMap.values()];
      await fs.mkdir(dirname(filePath), { recursive: true }).catch(() => {});
      await fs.writeFile(filePath, JSON.stringify(merged, null, 2), 'utf-8');

      return this.result({ created, updated, failed: 0 });
    } catch (e) {
      return this.error(`pushRecords failed: ${(e as Error).message}`);
    }
  }

  private async readFile(relPath: string): Promise<any> {
    const filePath = this.resolveFilePath(relPath);
    const raw = await fs.readFile(filePath, 'utf-8');
    const ext = extname(relPath).toLowerCase();
    if (ext === '.json') return JSON.parse(raw);
    if (ext === '.csv') return this.parseCSV(raw);
    throw new Error(`Unsupported file type: ${ext}. Supported: .json, .csv`);
  }

  private resolveDirectoryPath(relPath: string): string {
    const target = resolve(this.basePathAbs, ...this.splitRelativeId(relPath));
    this.assertInsideBase(target);
    return target;
  }

  private resolveFilePath(relPath: string): string {
    const normalized = this.normalizeRelativeId(relPath);
    if (!normalized) {
      throw new Error('Empty file path is not allowed');
    }

    const target = resolve(this.basePathAbs, ...this.splitRelativeId(normalized));
    this.assertInsideBase(target);
    return target;
  }

  private resolveFileOrDirectoryPath(relPath: string): string {
    const target = resolve(this.basePathAbs, ...this.splitRelativeId(relPath));
    this.assertInsideBase(target);
    return target;
  }

  private normalizeRelativeId(relPath: string): string {
    const cleaned = relPath
      .replace(/\\/g, '/')
      .trim()
      .replace(/^\/+/, '')
      .replace(/\/+/g, '/');

    if (!cleaned || cleaned === 'root') return '';
    return cleaned.replace(/^root\//, '');
  }

  private splitRelativeId(relPath: string): string[] {
    const normalized = this.normalizeRelativeId(relPath);
    if (!normalized) return [];
    return normalized.split('/').filter(Boolean);
  }

  private assertInsideBase(target: string) {
    const rel = relative(this.basePathAbs, target);
    if (rel.startsWith('..') || isAbsolute(rel)) {
      throw new Error('Path traversal blocked');
    }
  }

  private async statSize(relPath: string): Promise<number | undefined> {
    try {
      const stat = await fs.stat(this.resolveFilePath(relPath));
      return stat.size;
    } catch {
      return undefined;
    }
  }

  private mimeFromExtension(ext: string): string | undefined {
    switch (ext.toLowerCase()) {
      case '.json':
        return 'application/json';
      case '.csv':
        return 'text/csv';
      case '.txt':
        return 'text/plain';
      case '.md':
        return 'text/markdown';
      default:
        return undefined;
    }
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
    const lines = text.split('\n').filter((line) => line.trim());
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map((header) => header.trim().replace(/^"|"$/g, ''));
    return lines.slice(1).map((line) => {
      const values = line.split(',').map((value) => value.trim().replace(/^"|"$/g, ''));
      const row: Record<string, any> = {};
      headers.forEach((header, index) => {
        row[header] = values[index] ?? '';
      });
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
