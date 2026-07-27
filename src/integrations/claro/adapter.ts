import { Buffer } from 'node:buffer';
import { posix as pathPosix } from 'node:path';
import { BaseAdapter } from '@/integrations/shared/base-adapter';
import type { CapabilityManifest } from '@/core/types/capabilities';
import type { FieldSchema, OperationResult, Record as IndraRecord } from '@/core/types/integration';
import type { AgnosticQuery, AgnosticInventoryItem } from '@/core/inventory/types';

export interface ClaroCredentials {
  baseUrl: string;
  username: string;
  password: string;
}

type WebDavEntry = {
  id: string;
  href: string;
  name: string;
  type: 'file' | 'folder';
  parentId: string;
  provider: 'claro';
  rawMimeType?: string;
  size?: number;
  updatedAt?: string;
};

export class ClaroAdapter extends BaseAdapter {
  static readonly meta = {
    color: 'text-sky-600 dark:text-sky-400',
    icon: 'cloud',
    label: 'Claro Drive',
    accentCss: 'bg-sky-500',
  };

  readonly capabilities: CapabilityManifest = {
    canListInventory: true,
    canDownload: true,
    canStream: true,
    canUpload: true,
    canResumableUpload: false,
    canDelete: true,
    canRename: true,
    canMove: true,
    canThumbnail: false,
    canQuota: false,
    canPublish: false,
  };

  readonly id = 'claro';
  readonly label = 'Claro Drive';

  private readonly baseUrl: string;
  private readonly username: string;
  private readonly password: string;
  private readonly davRootPath: string;

  constructor(credentials: ClaroCredentials) {
    super();
    this.baseUrl = this.normalizeBaseUrl(credentials.baseUrl || 'https://www.clarodrive.com');
    this.username = credentials.username.trim();
    this.password = credentials.password.trim();
    this.davRootPath = this.buildDavRootPath();
  }

  async testConnection(): Promise<OperationResult<boolean>> {
    try {
      const response = await this.requestDav('', {
        method: 'PROPFIND',
        headers: {
          Depth: '0',
        },
      });
      return response.ok ? this.result(true) : this.error(`Claro Drive auth failed: ${response.status}`);
    } catch (error) {
      return this.error(`Claro Drive unreachable: ${(error as Error).message}`);
    }
  }

  async listSources(): Promise<OperationResult<{ id: string; label: string; type: 'database' | 'spreadsheet' | 'file' | 'folder' }[]>> {
    const inventory = await this.listInventory({
      parentId: 'root',
      limit: 100,
      type: 'all',
      depth: 0,
    });
    if (!inventory.ok) {
      return this.error(inventory.error || 'Unable to list Claro sources');
    }

    return this.result(
      inventory.data.map((item) => ({
        id: item.id,
        label: item.name,
        type: item.type,
      })),
      { count: inventory.data.length }
    );
  }

  async getSchema(sourceId: string): Promise<OperationResult<FieldSchema[]>> {
    try {
      const { text, mimeType } = await this.fetchTextFile(sourceId);
      const rows = this.parseStructuredContent(text, mimeType, sourceId);
      if (!rows.length) {
        return this.result([]);
      }

      const sample = rows[0] as Record<string, unknown>;
      const fields: FieldSchema[] = Object.keys(sample).map((key) => ({
        key,
        label: key,
        type: this.inferType(sample[key]),
      }));

      return this.result(fields);
    } catch (error) {
      return this.error(`getSchema failed: ${(error as Error).message}`);
    }
  }

  async getRecords(sourceId: string, options?: { cursor?: string; limit?: number }): Promise<OperationResult<IndraRecord[]>> {
    try {
      const { text, mimeType } = await this.fetchTextFile(sourceId);
      const rows = this.parseStructuredContent(text, mimeType, sourceId);
      let records: IndraRecord[] = rows.map((row: Record<string, unknown>, index: number) => ({
        id: String(row.id ?? row.uuid ?? `row_${index}`),
        fields: { ...row },
        metadata: { source: 'claro', sourceId },
      }));

      if (options?.limit) {
        records = records.slice(0, options.limit);
      }

      return this.result(records, { count: records.length });
    } catch (error) {
      return this.error(`getRecords failed: ${(error as Error).message}`);
    }
  }

  async listInventory(query?: AgnosticQuery): Promise<OperationResult<AgnosticInventoryItem[]>> {
    try {
      const parentId = query?.parentId || 'root';
      const folderPath = parentId === 'root' ? '' : this.normalizeRelativePath(parentId);
      const xml = await this.requestDav(folderPath, {
        method: 'PROPFIND',
        headers: {
          Depth: '1',
          Accept: 'application/xml, text/xml',
        },
      });

      const body = await xml.text();
      const entries = this.parsePropfind(body, folderPath);
      const filtered = entries
        .filter((item) => query?.type === 'all' || item.type === query?.type)
        .filter((item) => !query?.search || item.name.toLowerCase().includes(query.search.trim().toLowerCase()))
        .sort((left, right) => {
          if (left.type !== right.type) return left.type === 'folder' ? -1 : 1;
          return left.name.localeCompare(right.name);
        });

      const limited = typeof query?.limit === 'number' ? filtered.slice(0, query.limit) : filtered;
      return this.result(limited, { count: limited.length });
    } catch (error) {
      return this.error(`listInventory failed: ${(error as Error).message}`);
    }
  }

  async resolvePath(sourceId: string): Promise<OperationResult<string[]>> {
    try {
      const normalized = this.normalizeRelativePath(sourceId);
      if (!normalized) return this.result(['root']);
      return this.result(['root', ...normalized.split('/')]);
    } catch (error) {
      return this.error(`resolvePath failed: ${(error as Error).message}`);
    }
  }

  async pushRecords(targetId: string, records: IndraRecord[]): Promise<OperationResult<{ created: number; updated: number; failed: number }>> {
    try {
      const ext = this.getExtension(targetId);
      if (!ext || (ext !== '.json' && ext !== '.csv')) {
        return this.error('Claro Drive only supports .json or .csv targets for record writes.');
      }

      const existing = await this.readStructuredRecords(targetId, ext);
      const existingMap = new Map(
        existing.map((row: Record<string, unknown>) => [String(row.id ?? ''), row])
      );
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
      const payload = ext === '.csv' ? this.toCSV(merged) : JSON.stringify(merged, null, 2);
      await this.writeTextFile(targetId, payload, ext === '.csv' ? 'text/csv' : 'application/json');
      return this.result({ created, updated, failed: 0 });
    } catch (error) {
      return this.error(`pushRecords failed: ${(error as Error).message}`);
    }
  }

  async downloadBlob(fileId: string, rangeHeader?: string): Promise<OperationResult<ReadableStream>> {
    try {
      const response = await this.requestDav(fileId, {
        method: 'GET',
        headers: {
          ...(rangeHeader ? { Range: rangeHeader } : {}),
        },
      });

      if (!response.ok || !response.body) {
        return this.error(`downloadBlob failed: HTTP ${response.status}`);
      }

      return this.result(response.body as ReadableStream, {
        headers: this.captureHeaders(response),
      });
    } catch (error) {
      return this.error(`downloadBlob failed: ${(error as Error).message}`);
    }
  }

  async deleteItem(itemId: string): Promise<OperationResult<boolean>> {
    try {
      const response = await this.requestDav(itemId, { method: 'DELETE' });
      return response.ok ? this.result(true) : this.error(`DELETE failed: HTTP ${response.status}`);
    } catch (error) {
      return this.error(`deleteItem failed: ${(error as Error).message}`);
    }
  }

  async renameItem(itemId: string, newName: string): Promise<OperationResult<{ newId: string }>> {
    try {
      const parent = this.normalizeRelativePath(pathPosix.dirname(itemId));
      const targetId = parent && parent !== '.' ? `${parent}/${newName}` : newName;
      const destination = this.buildDavPath(targetId).toString();
      const response = await this.requestDav(itemId, {
        method: 'MOVE',
        headers: {
          Destination: destination,
        },
      });
      return response.ok ? this.result({ newId: targetId }) : this.error(`MOVE failed: HTTP ${response.status}`);
    } catch (error) {
      return this.error(`renameItem failed: ${(error as Error).message}`);
    }
  }

  async moveItem(itemId: string, targetFolderId: string): Promise<OperationResult<{ newId: string }>> {
    try {
      const fileName = pathPosix.basename(itemId);
      const folder = targetFolderId === 'root' ? '' : this.normalizeRelativePath(targetFolderId);
      const targetId = folder ? `${folder}/${fileName}` : fileName;
      const destination = this.buildDavPath(targetId).toString();
      const response = await this.requestDav(itemId, {
        method: 'MOVE',
        headers: {
          Destination: destination,
        },
      });
      return response.ok ? this.result({ newId: targetId }) : this.error(`MOVE failed: HTTP ${response.status}`);
    } catch (error) {
      return this.error(`moveItem failed: ${(error as Error).message}`);
    }
  }

  private async readStructuredRecords(targetId: string, ext: string): Promise<Record<string, unknown>[]> {
    try {
      const { text } = await this.fetchTextFile(targetId);
      if (ext === '.csv') {
        return this.parseCsv(text);
      }
      return this.normalizeToArray(JSON.parse(text));
    } catch {
      return [];
    }
  }

  private async fetchTextFile(fileId: string): Promise<{ text: string; mimeType: string }> {
    const response = await this.requestDav(fileId, { method: 'GET' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return {
      text: await response.text(),
      mimeType: response.headers.get('content-type') || this.getMimeType(fileId),
    };
  }

  private async writeTextFile(fileId: string, content: string, contentType: string) {
    const response = await this.requestDav(fileId, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
      },
      body: content,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
  }

  private async requestDav(relativePath: string, init: RequestInit): Promise<Response> {
    const url = this.buildDavPath(relativePath);
    const headers = new Headers(init.headers || {});
    headers.set('Authorization', this.buildAuthHeader());
    return fetch(url, {
      ...init,
      headers,
    });
  }

  private buildDavRootPath(): string {
    return new URL(`remote.php/dav/files/${encodeURIComponent(this.username)}/`, `${this.baseUrl}/`).pathname;
  }

  private buildDavPath(relativePath: string): URL {
    const normalized = this.normalizeRelativePath(relativePath);
    const suffix = normalized ? `${normalized.split('/').map(encodeURIComponent).join('/')}` : '';
    return new URL(`remote.php/dav/files/${encodeURIComponent(this.username)}/${suffix}`, `${this.baseUrl}/`);
  }

  private buildAuthHeader(): string {
    return `Basic ${Buffer.from(`${this.username}:${this.password}`, 'utf8').toString('base64')}`;
  }

  private normalizeBaseUrl(baseUrl: string): string {
    const parsed = new URL(baseUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('Claro baseUrl must use http or https');
    }
    return parsed.toString().replace(/\/+$/, '');
  }

  private normalizeRelativePath(value: string): string {
    const cleaned = value.replace(/\\/g, '/').trim().replace(/^\/+/, '').replace(/\/+/g, '/');
    if (!cleaned || cleaned === 'root' || cleaned === '.') return '';
    const normalized = pathPosix.normalize(cleaned).replace(/^(\.\.\/)+/, '');
    if (normalized === '.' || normalized === '/') return '';
    if (normalized.startsWith('..')) {
      throw new Error('Path traversal blocked');
    }
    return normalized.replace(/^\/+/, '').replace(/\/+$/, '');
  }

  private parsePropfind(xml: string, parentPath: string): WebDavEntry[] {
    const blocks = xml.match(/<[^:>]*:?response[\s\S]*?<\/[^:>]*:?response>/g) || [];
    const entries: WebDavEntry[] = [];
    const rootPath = parentPath ? `${parentPath.replace(/\/+$/, '')}/` : '';

    for (const block of blocks) {
      const href = this.extractXml(block, 'href');
      if (!href) continue;

      const pathname = decodeURIComponent(new URL(href, `${this.baseUrl}/`).pathname);
      const relativePath = pathname.replace(this.davRootPath, '').replace(/^\/+/, '').replace(/\/+$/, '');
      if (relativePath === '') continue;
      if (rootPath && relativePath === parentPath) continue;

      const name = this.extractXml(block, 'displayname') || pathPosix.basename(relativePath);
      const isFolder = /<(?:[a-z]+:)?collection\s*\/?>/i.test(block) || /<[^>]*collection[^>]*>/.test(block);
      entries.push({
        id: relativePath,
        href: pathname,
        name,
        type: isFolder ? 'folder' : 'file',
        parentId: parentPath || 'root',
        provider: 'claro',
        rawMimeType: isFolder ? undefined : this.extractXml(block, 'getcontenttype') || undefined,
        size: this.toNumber(this.extractXml(block, 'getcontentlength')),
        updatedAt: this.extractXml(block, 'getlastmodified') || undefined,
      });
    }

    return entries;
  }

  private extractXml(block: string, tagName: string): string {
    const match = block.match(new RegExp(`<(?:[a-z]+:)?${tagName}[^>]*>([\\s\\S]*?)<\\/(?:[a-z]+:)?${tagName}>`, 'i'));
    return match?.[1]?.trim() ?? '';
  }

  private captureHeaders(response: Response): Record<string, string> {
    const headers: Record<string, string> = {};
    ['content-type', 'content-length', 'content-range', 'accept-ranges'].forEach((name) => {
      const value = response.headers.get(name);
      if (value) headers[name] = value;
    });
    return headers;
  }

  private getExtension(fileId: string): string {
    const match = fileId.match(/(\.[a-z0-9]+)$/i);
    return match?.[1]?.toLowerCase() || '';
  }

  private getMimeType(fileId: string): string {
    const ext = this.getExtension(fileId);
    switch (ext) {
      case '.json':
        return 'application/json';
      case '.csv':
        return 'text/csv';
      case '.txt':
        return 'text/plain';
      case '.md':
        return 'text/markdown';
      default:
        return 'application/octet-stream';
    }
  }

  private parseStructuredContent(text: string, mimeType: string, sourceId: string): Record<string, unknown>[] {
    if (mimeType.includes('csv') || this.getExtension(sourceId) === '.csv') {
      return this.parseCsv(text);
    }

    try {
      return this.normalizeToArray(JSON.parse(text));
    } catch {
      return [];
    }
  }

  private normalizeToArray(data: unknown): Record<string, unknown>[] {
    if (Array.isArray(data)) {
      return data as Record<string, unknown>[];
    }
    if (data && typeof data === 'object') {
      const values = Object.values(data as Record<string, unknown>);
      const firstArray = values.find(Array.isArray);
      if (firstArray) return firstArray as Record<string, unknown>[];
      return [data as Record<string, unknown>];
    }
    return [];
  }

  private parseCsv(text: string): Record<string, unknown>[] {
    const lines = text.split('\n').filter((line) => line.trim());
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map((header) => header.trim().replace(/^"|"$/g, ''));
    return lines.slice(1).map((line) => {
      const values = line.split(',').map((value) => value.trim().replace(/^"|"$/g, ''));
      const row: Record<string, unknown> = {};
      headers.forEach((header, index) => {
        row[header] = values[index] ?? '';
      });
      return row;
    });
  }

  private toCSV(rows: Record<string, unknown>[]): string {
    if (!rows.length) return '';
    const headers = Object.keys(rows[0]);
    const escape = (value: unknown) => {
      const stringValue = value == null ? '' : String(value);
      return /[",\n]/.test(stringValue) ? `"${stringValue.replace(/"/g, '""')}"` : stringValue;
    };
    const lines = [headers.join(',')];
    for (const row of rows) {
      lines.push(headers.map((header) => escape(row[header])).join(','));
    }
    return lines.join('\n');
  }

  private inferType(value: unknown): FieldSchema['type'] {
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return 'date';
    if (Array.isArray(value)) return 'multi-select';
    return 'string';
  }

  private toNumber(value: string): number | undefined {
    if (!value) return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
}
