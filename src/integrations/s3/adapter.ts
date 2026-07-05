import { BaseAdapter } from '../shared/base-adapter';
import { AgnosticInventoryItem, AgnosticQuery } from '@/core/inventory/types';
import type { CapabilityManifest } from '@/core/types/capabilities';
import type { FieldSchema, IBlobCapable, OperationResult, Record as IndraRecord } from '@/core/types/integration';
import { S3Client, HeadBucketCommand, ListObjectsV2Command, GetObjectCommand, PutObjectCommand, DeleteObjectCommand, CopyObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'node:stream';
import { basename, extname, posix } from 'node:path';

export interface S3Credentials {
  bucket: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
}

const MIME_BY_EXTENSION: globalThis.Record<string, string> = {
  '.json': 'application/json',
  '.csv': 'text/csv',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.xml': 'application/xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.pdf': 'application/pdf',
};

function normalizeFolderPrefix(parentId?: string): string {
  if (!parentId || parentId === 'root') return '';
  return parentId.endsWith('/') ? parentId : `${parentId}/`;
}

function inferMimeType(key: string): string | undefined {
  return MIME_BY_EXTENSION[extname(key).toLowerCase()];
}

function getParentPrefix(key: string): string {
  const index = key.lastIndexOf('/');
  if (index < 0) return '';
  return key.slice(0, index + 1);
}

function getFileName(key: string): string {
  return basename(key);
}

function encodeCopySource(bucket: string, key: string): string {
  return `/${encodeURIComponent(bucket)}/${key.split('/').map((part) => encodeURIComponent(part)).join('/')}`;
}

async function bodyToWebStream(body: any): Promise<ReadableStream> {
  if (!body) {
    throw new Error('GetObject body is empty');
  }
  if (typeof body.transformToWebStream === 'function') {
    return body.transformToWebStream();
  }
  if (typeof body.getReader === 'function') {
    return body as ReadableStream;
  }
  if (typeof body.pipe === 'function') {
    return Readable.toWeb(body as any) as ReadableStream;
  }
  throw new Error('Unsupported S3 body stream type');
}

/**
 * S3Adapter: Cloudflare R2 / S3-compatible blob store adapter.
 */
export class S3Adapter extends BaseAdapter implements IBlobCapable {
  static readonly meta = {
    color: 'text-cyan-600 dark:text-cyan-400',
    icon: 'cloud',
    label: 'Cloudflare R2 / S3',
    accentCss: 'bg-cyan-500',
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

  readonly id = 's3';
  readonly label = 'Cloudflare R2 / S3';

  private readonly client: S3Client;

  constructor(private readonly credentials: S3Credentials) {
    super();
    this.client = new S3Client({
      region: 'auto',
      endpoint: credentials.endpoint,
      credentials: {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
      },
      forcePathStyle: true,
    });
  }

  async testConnection(): Promise<OperationResult<boolean>> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.credentials.bucket }));
      return this.result(true);
    } catch (err: any) {
      return this.error(`CONNECTION_ERR: ${err.message || 'Unknown error'}`);
    }
  }

  async listSources(): Promise<OperationResult<{ id: string; label: string; type: 'database' | 'spreadsheet' | 'file' | 'folder' }[]>> {
    return this.result([
      {
        id: 'root',
        label: 'Root',
        type: 'folder',
      },
    ]);
  }

  async getSchema(sourceId: string): Promise<OperationResult<FieldSchema[]>> {
    return this.result([
      { key: 'name', label: 'Name', type: 'string', required: true },
      { key: 'size', label: 'Size', type: 'number' },
      { key: 'mimeType', label: 'Mime Type', type: 'string' },
    ]);
  }

  async getRecords(sourceId: string, options?: any): Promise<OperationResult<IndraRecord[]>> {
    return this.error('Not implemented for S3. Use listInventory and downloadBlob instead.');
  }

  async pushRecords(targetId: string, records: IndraRecord[]): Promise<OperationResult<any>> {
    return this.error('Not implemented for S3. Use createResumableSession instead.');
  }

  async listInventory(query?: AgnosticQuery): Promise<OperationResult<AgnosticInventoryItem[]>> {
    try {
      const prefix = normalizeFolderPrefix(query?.parentId);
      const response = await this.client.send(new ListObjectsV2Command({
        Bucket: this.credentials.bucket,
        Prefix: prefix || undefined,
        Delimiter: '/',
      }));

      const items: AgnosticInventoryItem[] = [];

      for (const commonPrefix of response.CommonPrefixes || []) {
        const folderPrefix = commonPrefix.Prefix;
        if (!folderPrefix) continue;
        items.push({
          id: folderPrefix,
          name: getFileName(folderPrefix.slice(0, -1)) || folderPrefix,
          type: 'folder',
          provider: 's3',
          parentId: prefix || 'root',
        });
      }

      for (const entry of response.Contents || []) {
        const key = entry.Key;
        if (!key || key === prefix) continue;
        if (key.endsWith('/')) continue;

        items.push({
          id: key,
          name: getFileName(key),
          type: 'file',
          rawMimeType: inferMimeType(key),
          size: entry.Size,
          updatedAt: entry.LastModified?.toISOString(),
          provider: 's3',
          parentId: prefix || 'root',
        });
      }

      const limited = query?.limit ? items.slice(0, query.limit) : items;
      return this.result(limited, {
        count: limited.length,
        hasMore: !!response.IsTruncated,
        cursor: response.NextContinuationToken || undefined,
      });
    } catch (err: any) {
      return this.error(`INVENTORY_ERR: ${err.message || 'Unknown error'}`);
    }
  }

  async downloadBlob(fileId: string, rangeHeader?: string): Promise<OperationResult<ReadableStream>> {
    try {
      const response = await this.client.send(new GetObjectCommand({
        Bucket: this.credentials.bucket,
        Key: fileId,
        ...(rangeHeader ? { Range: rangeHeader } : {}),
      }));

      const stream = await bodyToWebStream(response.Body);
      return this.result(stream);
    } catch (err: any) {
      return this.error(`DOWNLOAD_ERR: ${err.message || 'Unknown error'}`);
    }
  }

  async createResumableSession(
    targetId: string,
    fileName: string,
    mimeType: string,
    totalSize: number,
    metadata?: { [key: string]: string }
  ): Promise<OperationResult<{ resumableUri: string; sessionId: string }>> {
    try {
      const key = posix.join(normalizeFolderPrefix(targetId), fileName).replace(/^\/+/, '');
      const command = new PutObjectCommand({
        Bucket: this.credentials.bucket,
        Key: key,
        ContentType: mimeType,
        ContentLength: totalSize,
        ...(metadata ? { Metadata: metadata } : {}),
      });
      const resumableUri = await getSignedUrl(this.client, command, { expiresIn: 3600 });

      return this.result({
        resumableUri,
        sessionId: key,
      });
    } catch (err: any) {
      return this.error(`UPLOAD_ERR: ${err.message || 'Unknown error'}`);
    }
  }

  async deleteItem(itemId: string): Promise<OperationResult<boolean>> {
    try {
      if (itemId.endsWith('/')) {
        return this.error('DELETE_ERR: folder prefixes are not deleted recursively in S3Adapter');
      }

      await this.client.send(new DeleteObjectCommand({
        Bucket: this.credentials.bucket,
        Key: itemId,
      }));

      return this.result(true);
    } catch (err: any) {
      return this.error(`DELETE_ERR: ${err.message || 'Unknown error'}`);
    }
  }

  async renameItem(itemId: string, newName: string): Promise<OperationResult<{ newId: string }>> {
    try {
      if (itemId.endsWith('/')) {
        return this.error('RENAME_ERR: folder prefixes are not renamed recursively in S3Adapter');
      }

      const prefix = getParentPrefix(itemId);
      const newKey = posix.join(prefix, newName).replace(/^\/+/, '');

      await this.client.send(new CopyObjectCommand({
        Bucket: this.credentials.bucket,
        CopySource: encodeCopySource(this.credentials.bucket, itemId),
        Key: newKey,
      }));

      await this.client.send(new DeleteObjectCommand({
        Bucket: this.credentials.bucket,
        Key: itemId,
      }));

      return this.result({ newId: newKey });
    } catch (err: any) {
      return this.error(`RENAME_ERR: ${err.message || 'Unknown error'}`);
    }
  }

  async moveItem(itemId: string, targetFolderId: string): Promise<OperationResult<{ newId: string }>> {
    try {
      if (itemId.endsWith('/')) {
        return this.error('MOVE_ERR: folder prefixes are not moved recursively in S3Adapter');
      }

      const newKey = posix.join(normalizeFolderPrefix(targetFolderId), getFileName(itemId)).replace(/^\/+/, '');

      await this.client.send(new CopyObjectCommand({
        Bucket: this.credentials.bucket,
        CopySource: encodeCopySource(this.credentials.bucket, itemId),
        Key: newKey,
      }));

      await this.client.send(new DeleteObjectCommand({
        Bucket: this.credentials.bucket,
        Key: itemId,
      }));

      return this.result({ newId: newKey });
    } catch (err: any) {
      return this.error(`MOVE_ERR: ${err.message || 'Unknown error'}`);
    }
  }

  async getSpace(): Promise<OperationResult<{ used: number; total: number; free: number }>> {
    return this.error('SPACE_ERR: S3/R2 quota is not exposed by the S3 API.');
  }
}
