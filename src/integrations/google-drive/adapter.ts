import { AuthorizedClient, NangoAuthorizedClient } from '@/lib/authorized-client';
import { nango } from '@/lib/nango';
import { BaseAdapter } from '../shared/base-adapter';
import type { 
  OperationResult, 
  FieldSchema,
} from '@/core/types/integration';

/**
 * GOOGLE DRIVE ADAPTER (PRODUCTION READY)
 * Implements the ISiloAdapter interface for Google Drive.
 * Handles real-time resource discovery and resumable uploads.
 */
export class GoogleDriveAdapter extends BaseAdapter {
  private client: AuthorizedClient;
  private connectionId: string;
  readonly id = 'google-drive';
  readonly label = 'Google Drive';

  constructor(connectionId: string) {
    super();
    this.connectionId = connectionId;
    // The NangoAuthorizedClient handles automatic token refresh via middleware
    this.client = new NangoAuthorizedClient('google-drive', connectionId);
  }

  /**
   * Validates if the connection is alive by calling the /about endpoint.
   */
  async testConnection(): Promise<OperationResult<boolean>> {
    try {
      await this.client.request({ endpoint: '/about', params: { fields: 'user' } });
      return this.result(true);
    } catch (err) {
      return this.error('CONN_ERR: Drive API unreachable or invalid tokens');
    }
  }

  /**
   * Fetches real folders from the connected Drive account.
   */
  async listSources(): Promise<OperationResult<any>> {
    try {
      const response = await this.client.request({
        endpoint: '/files',
        params: {
          q: "mimeType = 'application/vnd.google-apps.folder' and trashed = false",
          fields: 'files(id, name)',
          pageSize: 50
        }
      });

      const folders = response.files.map((f: any) => ({
        id: f.id,
        label: f.name,
        type: 'folder'
      }));

      return this.result(folders);
    } catch (err) {
      return this.error('LIST_ERR: Failed to fetch Drive folders');
    }
  }

  /**
   * Returns the dynamic schema for Drive file uploads.
   */
  async getSchema(sourceId: string): Promise<OperationResult<FieldSchema[]>> {
    // In Drive, every "source" (folder) accepts the same file contract
    return this.result([
      { key: 'name', type: 'string', label: 'Nombre del Archivo', required: true },
      { key: 'description', type: 'string', label: 'Descripción', required: false },
      { key: 'category', type: 'select', label: 'Categoría', options: ['Media', 'Documento', 'Otro'], required: true }
    ]);
  }

  /**
   * Initiates a Google Drive Resumable Upload session.
   * This is the production way to handle ingestion.
   */
  async createResumableSession(
    targetFolderId: string,
    fileName: string,
    mimeType: string,
    totalSize: number
  ): Promise<OperationResult<{ resumableUri: string; sessionId: string }>> {
    try {
      const tokenResponse = await nango.getToken('google-drive', this.connectionId) as any;
      const token = tokenResponse.access_token;

      const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Upload-Content-Type': mimeType,
          'X-Upload-Content-Length': String(totalSize),
        },
        body: JSON.stringify({
          name: fileName,
          parents: [targetFolderId],
        }),
      });

      if (!response.ok) {
        throw new Error(`Drive Session Error: ${response.statusText}`);
      }

      const resumableUri = response.headers.get('Location');
      if (!resumableUri) throw new Error('NO_LOCATION_HEADER');

      return this.result({
        resumableUri,
        sessionId: `GD_SESSION_${Date.now()}`,
      });
    } catch (err) {
      return this.error((err as Error).message);
    }
  }
}
