import { NangoAuthorizedClient as AuthorizedClient } from '@/lib/authorized-client';
import { nango } from '@/lib/nango';
import { BaseIntegrationAdapter } from '../shared/base-adapter';
import type { 
  IntegrationRecord, 
  OperationResult, 
  FieldSchema,
  SiloMetadata 
} from '@/core/types/integration';

export class GoogleDriveAdapter extends BaseIntegrationAdapter {
  private client: AuthorizedClient;

  constructor(connectionId: string) {
    super('google-drive', connectionId);
    this.client = new AuthorizedClient('google-drive', connectionId);
  }

  async getMetadata(path?: string): Promise<SiloMetadata> {
    const folderId = path || 'root';
    // En una implementación real, aquí llamaríamos a la API de Drive vía Nango
    // para obtener el nombre de la carpeta y sus metadatos.
    return {
      id: folderId,
      name: path === 'root' ? 'My Drive' : `Folder ${folderId}`,
      integration: 'google-drive',
      canRead: true,
      canWrite: true,
    };
  }

  async listRecords(path?: string): Promise<IntegrationRecord[]> {
    const folderId = path || 'root';
    const response = await this.client.request({
      endpoint: '/files',
      params: {
        q: `'${folderId}' in parents and trashed = false`,
        fields: 'files(id, name, mimeType, size, webViewLink, iconLink)',
      },
    });

    return response.files.map((file: any) => ({
      id: file.id,
      data: file,
      metadata: {
        mimeType: file.mimeType,
        size: file.size,
      },
    }));
  }

  /**
   * RECURSIVE FOLDER ENGINE
   * Ensures a path like "Project A/2026/May" exists in Drive.
   * Returns the final folder ID.
   */
  async getOrCreateFolderByPath(path: string, parentId: string = 'root'): Promise<string> {
    const segments = path.split('/').filter(Boolean);
    let currentParentId = parentId;

    for (const segment of segments) {
      // 1. Search if segment exists under current parent
      const searchRes = await this.client.request({
        endpoint: '/files',
        params: {
          q: `name = '${segment.replace(/'/g, "\\'")}' and '${currentParentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
          fields: 'files(id)',
        },
      });

      if (searchRes.files && searchRes.files.length > 0) {
        currentParentId = searchRes.files[0].id;
      } else {
        // 2. Create it
        const tokenResponse = await nango.getLatestToken('google-drive', this.connectionId);
        const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${tokenResponse.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: segment,
            parents: [currentParentId],
            mimeType: 'application/vnd.google-apps.folder',
          }),
        });
        const folder = await createRes.json();
        if (!folder.id) throw new Error(`Failed to create folder segment: ${segment}`);
        currentParentId = folder.id;
      }
    }

    return currentParentId;
  }

  async upsertRecord(record: Partial<IntegrationRecord>): Promise<OperationResult> {
    // Para subir un archivo, Nango suele usar un endpoint de Proxy o 
    // podemos usar la API de Drive directamente con el token de Nango.
    try {
      // Lógica de subida...
      return { success: true, id: record.id || 'new-file' };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  getSchema(): FieldSchema[] {
    return [
      { key: 'name', type: 'string', label: 'File Name', required: true },
      { key: 'mimeType', type: 'string', label: 'MIME Type', required: false },
    ];
  }

  /**
   * IMPLEMENTACIÓN AXIOMÁTICA: Sesión Resumible de Google Drive.
   * Permite que Indra negocie la subida y el cliente envíe chunks directamente.
   */
  async createResumableSession(
    targetId: string,
    fileName: string,
    mimeType: string,
    totalSize: number
  ): Promise<OperationResult<{ resumableUri: string; sessionId: string }>> {
    try {
      // 1. Obtener token fresco de Nango
      const tokenResponse = await nango.getLatestToken('google-drive', this.connectionId);
      const token = tokenResponse.access_token;

      // 2. Iniciar sesión resumible en Google Drive
      // POST https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable
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
          parents: [targetId],
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        return { ok: false, error: `Drive Session Error: ${error}`, data: [] as any };
      }

      // El URI de la sesión está en el header Location
      const resumableUri = response.headers.get('Location');
      if (!resumableUri) {
        return { ok: false, error: 'Drive did not return a Resumable URI', data: [] as any };
      }

      return {
        ok: true,
        data: {
          resumableUri,
          sessionId: `gd-${Date.now()}`, // ID temporal para rastreo
        }
      };
    } catch (error) {
      return { ok: false, error: (error as Error).message, data: [] as any };
    }
  }
}
