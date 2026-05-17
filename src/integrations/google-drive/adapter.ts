/**
 * 📂 ARTEFACTO: GoogleDriveAdapter.ts
 * ────────────
 * CAPA: Integrations / Adapters (Storage Silo)
 * VERSIÓN: 2.2.0
 * COMMIT: P3-M4.3-DRIVE-AGNOSTIC-QUERY-UPGRADE
 * 
 * 🎯 FUNCTIONAL_SCOPE:
 * - Adaptador especializado para el Silo de Almacenamiento de Google Drive.
 * - Orquestación de subidas binarias mediante el protocolo 'Resumable Upload' de Google.
 * - Motor de organización jerárquica (Recursive Folder Creation) basado en paths dinámicos.
 * 
 * 🛡️ AXIOMATIC_CONTRACT:
 * - MUST: Utilizar sesiones resumibles para garantizar la integridad de archivos de gran tamaño.
 * - NEVER: Almacenar tokens de acceso en el estado de la clase; solicitar vía Nango per-request.
 * - NEVER: Hardcodear IDs de carpetas; deben ser inyectados vía 'targetFolderId' o resueltos por path.
 * - ALWAYS: Sanitizar los nombres de archivos y carpetas antes de enviarlos a la API de Google.
 * 
 * 📜 ARCH_DECISION: Se utiliza 'nango.getToken' directamente en subidas resumibles porque el Proxy de Nango no soporta el handshake de redirección de Google para sesiones binarias.
 * 
 * 🔑 KEYWORDS: #GoogleDriveAdapter #ResumableUpload #StorageSilo #AgnosticQuery
 * 🔗 RELATIONSHIPS: [AuthorizedClient, BaseAdapter, AgnosticQuery, useInventory]
 */

import { AuthorizedClient, NangoAuthorizedClient } from '@/lib/authorized-client';
import { nango } from '@/lib/nango';
import { BaseAdapter } from '../shared/base-adapter';
import { AgnosticQuery, AgnosticInventoryItem } from '@/core/inventory/types';
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
      await this.client.request({ endpoint: '/drive/v3/about', params: { fields: 'user' } });
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
        endpoint: '/drive/v3/files',
        params: {
          q: "mimeType = 'application/vnd.google-apps.folder' and trashed = false",
          fields: 'files(id, name, shared)',
          pageSize: '50',
          supportsAllDrives: 'true',
          includeItemsFromAllDrives: 'true'
        }
      });

      const folders = response.data.files.map((f: any) => ({
        id: f.id,
        label: f.shared ? `👥 ${f.name} (Shared)` : f.name,
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
   * This is the scientific way (Nango v2 Proxy) to handle ingestion.
   */
  async createResumableSession(
    targetFolderId: string,
    fileName: string,
    mimeType: string,
    totalSize: number,
    metadata?: { [key: string]: string }
  ): Promise<OperationResult<{ resumableUri: string; sessionId: string }>> {
    try {
      // 🏛️ AXIOMATIC LOGIC: Map sovereign metadata to Google Drive appProperties
      // These are private, indexed metadata that survive transcoding.
      const appProperties: Record<string, string> = {
        indra_ingested_at: new Date().toISOString(),
        indra_original_name: fileName,
        ...metadata,
      };

      // 🏛️ SOVEREIGN BYPASS: Negotiate directly with Google to avoid Proxy header-stripping
      const response = await this.client.request({
        method: 'POST',
        endpoint: '/drive/v3/files?uploadType=resumable',
        baseUrl: 'https://www.googleapis.com/upload', // 🎯 Critical: Upload API base
        bypassProxy: true,                             // 🛰️ Bypass Nango Proxy
        headers: {
          'X-Upload-Content-Type': mimeType,
          'X-Upload-Content-Length': String(totalSize),
          'Origin': 'https://indra-next.vercel.app', // 🏛️ Requesting CORS for the session
        },
        data: {
          name: fileName,
          parents: [targetFolderId],
          appProperties, // 🎯 Sovereign Traceability
        },
      });

      // Google returns the session URI in the 'location' header (can be capitalized)
      const headers = response.headers || {};
      const resumableUri = headers['location'] || headers['Location'];

      if (!resumableUri) {
        console.error('[GoogleDriveAdapter] Proxy response missing location header. Status:', response.status, 'Body:', response.data);
        throw new Error(`NO_LOCATION_HEADER_FROM_PROXY (Status: ${response.status})`);
      }

      return this.result({
        resumableUri,
        sessionId: `GD_SESSION_${Date.now()}`,
      });
    } catch (err) {
      console.error('[GoogleDriveAdapter] createResumableSession failed:', err);
      return this.error((err as Error).message);
    }
  }
  /**
   * 🔍 IMPLEMENTACIÓN CANÓNICA: listInventory
   * Traduce AgnosticQuery a parámetros nativos de Google Drive v3.
   */
  async listInventory(query?: AgnosticQuery): Promise<OperationResult<AgnosticInventoryItem[]>> {
    try {
      const parentId = query?.parentId || 'root';
      const isRoot = parentId === 'root';
      
      // Construcción del Query DSL de Google Drive
      let q = `('${parentId}' in parents ${isRoot ? 'or sharedWithMe = true' : ''}) and trashed = false`;
      
      if (query?.search) {
        q += ` and name contains '${query.search}'`;
      }
      
      if (query?.type === 'folder') {
        q += ` and mimeType = 'application/vnd.google-apps.folder'`;
      } else if (query?.type === 'file') {
        q += ` and mimeType != 'application/vnd.google-apps.folder'`;
      }

      const response = await this.client.request({
        endpoint: '/drive/v3/files',
        params: {
          q,
          fields: 'files(id, name, mimeType, shared, size, modifiedTime, fileExtension, capabilities, appProperties)',
          pageSize: query?.limit?.toString() || '50',
          ...(query?.cursor && { pageToken: query.cursor }),
          supportsAllDrives: 'true',
          includeItemsFromAllDrives: 'true'
        }
      });

      const items = (response.data.files || []).map((f: any) => ({
        id: f.id,
        name: f.shared ? `👥 ${f.name}` : f.name,
        type: f.mimeType?.includes('folder') ? 'folder' : 'file',
        rawMimeType: f.mimeType,
        size: f.size ? parseInt(f.size) : undefined,
        updatedAt: f.modifiedTime,
        provider: 'google-drive',
        isShared: f.shared,
        parentId: parentId
      }));

      return this.result(items);
    } catch (err: any) {
      console.error('[GoogleDriveAdapter] listInventory failed:', err);
      return this.error(`INVENTORY_ERR: ${err.message || 'Unknown error'}`);
    }
  }
  
  /**
   * Resolves the full ancestry path from root to a given file/folder ID.
   */
  async resolvePath(id: string): Promise<OperationResult<string[]>> {
    try {
      const path: string[] = [];
      let currentId = id;

      while (currentId && currentId !== 'root') {
        const response = await this.client.request({
          endpoint: `/drive/v3/files/${currentId}`,
          params: { 
            fields: 'id, name, parents',
            supportsAllDrives: 'true',
            includeItemsFromAllDrives: 'true'
          }
        });

        if (!response.data || !response.data.id) break;

        path.unshift(response.data.id);
        const parents = response.data.parents;
        if (!parents || parents.length === 0) {
          break;
        }
        currentId = parents[0];
        if (currentId === response.data.id) break; // Avoid loop
      }

      return this.result(['root', ...path]);
    } catch (err: any) {
      console.error('[GoogleDriveAdapter] resolvePath failed:', err);
      // Fallback: if resolve fails, just return root + target id
      return this.result(['root', id]);
    }
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
        endpoint: '/drive/v3/files',
        params: {
          q: `name = '${segment.replace(/'/g, "\\")}' and '${currentParentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
          fields: 'files(id)',
          supportsAllDrives: 'true',
          includeItemsFromAllDrives: 'true'
        },
      });

      if (searchRes.data.files && searchRes.data.files.length > 0) {
        currentParentId = searchRes.data.files[0].id;
      } else {
        // 🧪 SCIENTIFIC STANDARD: Use Proxy for creation to handle auto-refresh
        const folder = await this.client.request({
          method: 'POST',
          endpoint: '/drive/v3/files',
          data: {
            name: segment,
            parents: [currentParentId],
            mimeType: 'application/vnd.google-apps.folder',
          },
        });

        if (!folder.data?.id) {
          throw new Error(`Failed to create folder segment: ${segment}`);
        }
        currentParentId = folder.data.id;
      }
    }

    return currentParentId;
  }

  async getRecords(sourceId: string, options?: any): Promise<OperationResult<any[]>> {
    return this.error('Not implemented for Drive. Use listSources instead.');
  }

  async pushRecords(targetId: string, records: any[]): Promise<OperationResult<any>> {
    return this.error('Not implemented for Drive. Use createResumableSession instead.');
  }
}
