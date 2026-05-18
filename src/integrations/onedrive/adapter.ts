import { BaseAdapter } from '../shared/base-adapter';
import { AuthorizedClient, NangoAuthorizedClient } from '@/lib/authorized-client';
import { nango } from '@/lib/nango';
import { AgnosticQuery, AgnosticInventoryItem } from '@/core/inventory/types';
import type { OperationResult, FieldSchema, IBlobCapable } from '@/core/types/integration';

export class OneDriveAdapter extends BaseAdapter implements IBlobCapable {
  static readonly meta = {
    color: 'text-blue-600 dark:text-blue-400',
    icon: 'cloud',
    label: 'OneDrive',
    accentCss: 'bg-blue-500',
  };

  private client: AuthorizedClient;
  private connectionId: string;
  readonly id = 'onedrive';
  readonly label = 'OneDrive';

  constructor(connectionId: string) {
    super();
    this.connectionId = connectionId;
    this.client = new NangoAuthorizedClient('onedrive', connectionId);
  }

  async testConnection(): Promise<OperationResult<boolean>> {
    try {
      await this.client.request({
        endpoint: '/v1.0/me/drive',
        baseUrl: 'https://graph.microsoft.com',
        bypassProxy: true,
      });
      return this.result(true);
    } catch (err) {
      return this.error('CONN_ERR: MS Graph API unreachable or OneDrive connection inactive');
    }
  }

  async listSources(): Promise<OperationResult<any>> {
    return this.result([{ id: 'root', label: 'OneDrive Root', type: 'folder' }]);
  }

  async getSchema(sourceId: string): Promise<OperationResult<FieldSchema[]>> {
    return this.result([]);
  }

  async getRecords(sourceId: string, options?: any): Promise<OperationResult<any[]>> {
    return this.result([]);
  }

  async pushRecords(targetId: string, records: any[]): Promise<OperationResult<any>> {
    return this.error('OneDrive write operations are not active in this context.');
  }

  async listInventory(query?: AgnosticQuery): Promise<OperationResult<AgnosticInventoryItem[]>> {
    try {
      const parentId = query?.parentId || 'root';
      const searchParam = query?.search || '';
      
      let endpoint = '';
      const params: Record<string, string> = {};

      if (searchParam) {
        // Search items in OneDrive
        endpoint = '/v1.0/me/drive/root/search';
        params['q'] = searchParam;
        params['$expand'] = 'thumbnails';
      } else {
        // Fetch children from drive folder
        if (parentId === 'root' || parentId === 'storage-union') {
          endpoint = '/v1.0/me/drive/root/children';
        } else {
          endpoint = `/v1.0/me/drive/items/${parentId}/children`;
        }
        params['$expand'] = 'thumbnails';
      }

      const response = await this.client.request({
        method: 'GET',
        endpoint,
        baseUrl: 'https://graph.microsoft.com',
        bypassProxy: true,
        params,
      });

      const items: AgnosticInventoryItem[] = (response.data.value || []).map((item: any) => {
        const isFolder = !!item.folder;
        const mime = item.file?.mimeType || (isFolder ? 'application/vnd.google-apps.folder' : 'application/octet-stream');
        
        // Grab MS Graph thumbnail url if present
        const thumb = item.thumbnails?.[0]?.medium?.url || item.thumbnails?.[0]?.large?.url || undefined;

        return {
          id: item.id,
          name: item.name,
          type: isFolder ? 'folder' : 'file',
          rawMimeType: mime,
          size: item.size ? parseInt(item.size, 10) : undefined,
          updatedAt: item.lastModifiedDateTime,
          provider: 'onedrive',
          parentId: parentId,
          thumbnailUrl: thumb,
        };
      });

      return this.result(items);
    } catch (err: any) {
      console.error('[OneDriveAdapter] listInventory failed:', err);
      return this.error(`INVENTORY_ERR: ${err.message || 'Unknown error'}`);
    }
  }

  async downloadBlob(fileId: string, rangeHeader?: string): Promise<OperationResult<ReadableStream>> {
    try {
      const token = await nango.getToken('onedrive', this.connectionId);
      const url = `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/content`;

      const res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          ...(rangeHeader && { 'Range': rangeHeader }),
        }
      });

      if (!res.ok) {
        return this.error(`DOWNLOAD_ERR: HTTP ${res.status} ${res.statusText}`);
      }

      if (!res.body) {
        return this.error('DOWNLOAD_ERR: Response body is null');
      }

      // Collect redirect and stream response headers to pass back to the proxy route
      const headers: Record<string, string> = {};
      res.headers.forEach((val, key) => {
        headers[key.toLowerCase()] = val;
      });

      return {
        ok: true,
        data: res.body as any,
        meta: {
          headers
        } as any
      };
    } catch (err) {
      return this.error(`DOWNLOAD_ERR: ${(err as Error).message}`);
    }
  }

  async getSpace(): Promise<OperationResult<{ used: number; total: number; free: number }>> {
    try {
      const response = await this.client.request({
        endpoint: '/v1.0/me/drive',
        baseUrl: 'https://graph.microsoft.com',
        bypassProxy: true,
      });

      const quota = response.data.quota || {};
      const used = quota.used || 0;
      const total = quota.total || 0;
      const free = quota.remaining || (total - used);

      return this.result({ used, total, free });
    } catch (err) {
      return this.error(`SPACE_ERR: ${(err as Error).message}`);
    }
  }
}
