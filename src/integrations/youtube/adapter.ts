import { BaseAdapter } from '../shared/base-adapter';
import { AuthorizedClient, NangoAuthorizedClient } from '@/lib/authorized-client';
import { AgnosticQuery, AgnosticInventoryItem } from '@/core/inventory/types';
import type { OperationResult, FieldSchema } from '@/core/types/integration';

export class YouTubeAdapter extends BaseAdapter {
  static readonly meta = {
    color: 'text-red-600 dark:text-red-400',
    icon: 'youtube',
    label: 'YouTube Ingest',
    accentCss: 'bg-red-500',
  };

  private client: AuthorizedClient;
  readonly id = 'youtube';
  readonly label = 'YouTube';

  constructor(connectionId: string) {
    super();
    // Reuses the Google Drive Nango provider configuration key to share the OAuth connection identity
    this.client = new NangoAuthorizedClient('google-drive', connectionId);
  }

  async testConnection(): Promise<OperationResult<boolean>> {
    try {
      // Simple fetch to see if we can talk to Google APIs
      await this.client.request({
        endpoint: 'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
        bypassProxy: true,
        baseUrl: 'https://www.googleapis.com',
      });
      return this.result(true);
    } catch (err) {
      return this.error('CONN_ERR: YouTube API unreachable or insufficient OAuth scopes');
    }
  }

  async listSources(): Promise<OperationResult<any>> {
    return this.result([]);
  }

  async getSchema(sourceId: string): Promise<OperationResult<FieldSchema[]>> {
    return this.result([]);
  }

  async getRecords(sourceId: string, options?: any): Promise<OperationResult<any[]>> {
    return this.result([]);
  }

  async pushRecords(targetId: string, records: any[]): Promise<OperationResult<any>> {
    return this.error('YouTube is read-only in this context.');
  }

  async listInventory(query?: AgnosticQuery): Promise<OperationResult<AgnosticInventoryItem[]>> {
    try {
      const parentId = query?.parentId || 'root';
      
      // If parentId is not root, YouTube has no nested folders in this flat virtual ingestion context
      if (parentId !== 'root') {
        return this.result([]);
      }

      const searchParam = query?.search || '';

      // Query YouTube API to discover user's videos or perform search
      const response = await this.client.request({
        method: 'GET',
        endpoint: '/youtube/v3/search',
        baseUrl: 'https://www.googleapis.com',
        bypassProxy: true,
        params: {
          part: 'snippet',
          type: 'video',
          maxResults: query?.limit?.toString() || '25',
          ...(searchParam ? { q: searchParam } : { forMine: 'true' }),
          ...(query?.cursor && { pageToken: query.cursor }),
        },
      });

      const items: AgnosticInventoryItem[] = (response.data.items || []).map((item: any) => ({
        id: item.id?.videoId || 'unknown',
        name: item.snippet?.title || 'Untitled Video',
        type: 'file',
        rawMimeType: 'video/mp4', // Emulated mime type for media recognition
        updatedAt: item.snippet?.publishedAt,
        provider: 'youtube',
        parentId: 'root',
        thumbnailUrl: item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.default?.url,
        streamUrl: `https://www.youtube.com/embed/${item.id?.videoId}`,
      }));

      return {
        ok: true,
        data: items,
        meta: {
          hasMore: !!response.data.nextPageToken,
          cursor: response.data.nextPageToken || undefined,
        },
      };
    } catch (err: any) {
      console.error('[YouTubeAdapter] listInventory failed:', err);
      return this.error(`INVENTORY_ERR: ${err.message || 'Unknown error'}`);
    }
  }
}
