import { BaseAdapter } from '../shared/base-adapter';
import { IBlobCapable, OperationResult, Record, FieldSchema, IntegrationAdapter } from '@/core/types/integration';
import { AgnosticQuery, AgnosticInventoryItem } from '@/core/inventory/types';

export type WritePolicy = 'mfs' | 'ff' | 'epmfs';
export type ReadPolicy = 'ff' | 'all';

/**
 * 🌐 StorageUnion: aggregates multiple storage adapters into a single virtual filesystem.
 * Handles automatic prefixing, query routing, MIME-type filtering, and smart upload balancing.
 */
export class StorageUnion extends BaseAdapter implements IBlobCapable {
  readonly id = 'storage-union';
  readonly label = 'Storage Union';

  static readonly meta = {
    color: 'text-indigo-500 dark:text-indigo-400',
    icon: 'database',
    label: 'Storage Union',
    accentCss: 'bg-indigo-500',
  };

  constructor(
    private upstreams: (IntegrationAdapter & Partial<IBlobCapable>)[],
    private writePolicy: WritePolicy = 'mfs',
    private readPolicy: ReadPolicy = 'all'
  ) {
    super();
  }

  async testConnection(): Promise<OperationResult<boolean>> {
    try {
      const promises = this.upstreams.map(async (u) => {
        try {
          const res = await u.testConnection();
          return res.ok;
        } catch {
          return false;
        }
      });
      const results = await Promise.all(promises);
      const isWorking = results.some((r) => r === true);
      return this.result(isWorking);
    } catch (err: any) {
      return this.error(`UNION_CONNECTION_ERR: ${err.message || 'Unknown error'}`);
    }
  }

  async listSources(): Promise<OperationResult<any[]>> {
    const sources = this.upstreams.map((u) => ({
      id: `${u.id}::root`,
      label: `${u.label} Root`,
      type: 'folder',
    }));
    return this.result(sources);
  }

  async getSchema(sourceId: string): Promise<OperationResult<FieldSchema[]>> {
    const parts = sourceId.split('::');
    const provider = parts[0];
    const originalSourceId = parts.slice(1).join('::');

    const upstream = this.upstreams.find((u) => u.id === provider);
    if (upstream) {
      return upstream.getSchema(originalSourceId);
    }

    const defaultSchema: FieldSchema[] = [
      { key: 'name', label: 'Name', type: 'string', required: true },
      { key: 'size', label: 'Size', type: 'number' },
      { key: 'mimeType', label: 'Mime Type', type: 'string' },
    ];
    return this.result(defaultSchema);
  }

  async getRecords(sourceId: string, options?: any): Promise<OperationResult<Record[]>> {
    return this.error('Not implemented for StorageUnion.');
  }

  async pushRecords(targetId: string, records: Record[]): Promise<OperationResult<any>> {
    return this.error('Not implemented for StorageUnion.');
  }

  /**
   * Aggregates files and folders from upstreams.
   * Tolerates partial upstream outages gracefully.
   */
  async listInventory(query?: AgnosticQuery): Promise<OperationResult<AgnosticInventoryItem[]>> {
    const parentId = query?.parentId || 'root';

    const validatedQuery: AgnosticQuery = {
      parentId: parentId,
      cursor: query?.cursor,
      limit: query?.limit ?? 50,
      search: query?.search,
      type: query?.type ?? 'all',
      depth: query?.depth ?? 0
    };

    if (parentId === 'root' || parentId === '') {
      // Query all upstreams in parallel
      const promises = this.upstreams.map(async (upstream) => {
        try {
          const res = await upstream.listInventory({ ...validatedQuery, parentId: 'root' });
          if (!res.ok) {
            return { provider: upstream.id, ok: false, error: res.error };
          }
          const mapped: AgnosticInventoryItem[] = res.data.map((item) => ({
            id: `${upstream.id}::${item.id}`,
            name: item.name,
            type: (item.type === 'folder' || item.type === 'table') ? 'folder' : 'file',
            rawMimeType: item.rawMimeType,
            size: (item as any).size,
            updatedAt: (item as any).updatedAt,
            provider: upstream.id,
            parentId: 'root', // root children always map to 'root' parent globally
          }));
          return { provider: upstream.id, ok: true, data: mapped };
        } catch (err: any) {
          return { provider: upstream.id, ok: false, error: err.message };
        }
      });

      const results = await Promise.allSettled(promises);
      const allItems: AgnosticInventoryItem[] = [];
      const errors: string[] = [];

      for (const res of results) {
        if (res.status === 'fulfilled') {
          if (res.value.ok && res.value.data) {
            allItems.push(...res.value.data);
          } else {
            errors.push(`${res.value.provider}: ${res.value.error}`);
          }
        } else {
          errors.push(`Unknown upstream failure: ${res.reason}`);
        }
      }

      return this.result(allItems, {
        errors: errors.length > 0 ? errors : undefined,
        count: allItems.length,
      });
    } else {
      // Parse qualified parent ID: {provider}::{originalParentId}
      const parts = parentId.split('::');
      if (parts.length < 2) {
        return this.error(`Malformed parentId: "${parentId}". Expected "provider::originalId" format.`);
      }
      const provider = parts[0];
      const originalParentId = parts.slice(1).join('::');

      const upstream = this.upstreams.find((u) => u.id === provider);
      if (!upstream) {
        return this.error(`No active upstream provider matching "${provider}" found.`);
      }

      try {
        const res = await upstream.listInventory({ ...validatedQuery, parentId: originalParentId });
        if (!res.ok) {
          return this.error(`Upstream "${provider}" error: ${res.error}`);
        }
        const mapped: AgnosticInventoryItem[] = res.data.map((item) => ({
          id: `${provider}::${item.id}`,
          name: item.name,
          type: (item.type === 'folder' || item.type === 'table') ? 'folder' : 'file',
          rawMimeType: item.rawMimeType,
          size: (item as any).size,
          updatedAt: (item as any).updatedAt,
          provider: provider,
          parentId: parentId, // keep fully qualified parentId
        }));
        return this.result(mapped);
      } catch (err: any) {
        return this.error(`Upstream "${provider}" threw: ${err.message}`);
      }
    }
  }

  /**
   * Routes download request to the designated upstream capability.
   */
  async downloadBlob(fileId: string, rangeHeader?: string): Promise<OperationResult<ReadableStream>> {
    const parts = fileId.split('::');
    if (parts.length < 2) {
      return this.error(`Malformed fileId: "${fileId}". Expected "provider::originalId" format.`);
    }
    const provider = parts[0];
    const originalFileId = parts.slice(1).join('::');

    const upstream = this.upstreams.find((u) => u.id === provider);
    if (!upstream) {
      return this.error(`No active upstream provider matching "${provider}" found.`);
    }

    if (typeof upstream.downloadBlob !== 'function') {
      return this.error(`Upstream provider "${provider}" is not capable of downloading blobs.`);
    }

    try {
      return await upstream.downloadBlob(originalFileId, rangeHeader);
    } catch (err: any) {
      return this.error(`Download from upstream "${provider}" failed: ${err.message}`);
    }
  }

  /**
   * Aggregates usage space across all active and capable upstreams.
   */
  async getSpace(): Promise<OperationResult<{ used: number; total: number; free: number }>> {
    try {
      const promises = this.upstreams.map(async (u) => {
        if (typeof u.getSpace === 'function') {
          try {
            const res = await u.getSpace();
            if (res.ok) {
              return { provider: u.id, ...res.data };
            }
          } catch (err) {
            console.error(`Failed to fetch space for ${u.id}:`, err);
          }
        }
        return null;
      });

      const results = await Promise.all(promises);
      let totalUsed = 0;
      let totalSpace = 0;
      let totalFree = 0;

      for (const space of results) {
        if (space) {
          totalUsed += space.used || 0;
          totalSpace += space.total || 0;
          totalFree += space.free || 0;
        }
      }

      return this.result({
        used: totalUsed,
        total: totalSpace,
        free: totalFree,
      });
    } catch (err: any) {
      return this.error(`UNION_SPACE_ERR: ${err.message || 'Unknown error'}`);
    }
  }

  /**
   * Intelligently selects the destination upstream for an upload.
   */
  private async chooseUpstreamForUpload(
    targetId: string,
    mimeType: string
  ): Promise<(IntegrationAdapter & Partial<IBlobCapable>) | null> {
    // 1. Explicit target routing
    if (targetId.includes('::')) {
      const provider = targetId.split('::')[0];
      const upstream = this.upstreams.find((u) => u.id === provider);
      if (upstream && typeof upstream.createResumableSession === 'function') {
        // If targeted to YouTube but not a video, skip explicit routing to YouTube
        if (provider === 'youtube' && !mimeType.startsWith('video/')) {
          // Continue to generic chooser
        } else {
          return upstream;
        }
      }
    }

    // 2. Filter candidates supporting upload
    let candidates = this.upstreams.filter(
      (u) => typeof u.createResumableSession === 'function'
    );

    // 3. MIME-type routing: filter out YouTube for non-video assets
    if (!mimeType.startsWith('video/')) {
      candidates = candidates.filter((u) => u.id !== 'youtube');
    }

    if (candidates.length === 0) {
      return null;
    }

    // 4. First Fit Policy
    if (this.writePolicy === 'ff') {
      return candidates[0];
    }

    // 5. Most Free Space (mfs) or Existing Path (epmfs) fallback
    const spacePromises = candidates.map(async (u) => {
      if (typeof u.getSpace === 'function') {
        try {
          const res = await u.getSpace();
          if (res.ok) {
            return { providerId: u.id, free: res.data.free };
          }
        } catch (err) {
          console.error(`Error querying space for upload candidate ${u.id}:`, err);
        }
      }
      return { providerId: u.id, free: 0 };
    });

    const spaces = await Promise.all(spacePromises);

    candidates.sort((a, b) => {
      const spaceA = spaces.find((s) => s.providerId === a.id)?.free || 0;
      const spaceB = spaces.find((s) => s.providerId === b.id)?.free || 0;
      return spaceB - spaceA;
    });

    return candidates[0];
  }

  async createResumableSession(
    targetId: string,
    fileName: string,
    mimeType: string,
    totalSize: number,
    metadata?: { [key: string]: string }
  ): Promise<OperationResult<{ resumableUri: string; sessionId: string }>> {
    const upstream = await this.chooseUpstreamForUpload(targetId, mimeType);
    if (!upstream || typeof upstream.createResumableSession !== 'function') {
      return this.error(`No compatible upload capability found in upstreams for ${fileName} (${mimeType}).`);
    }

    // Extract target ID specific to the selected upstream
    let originalTargetId = targetId;
    if (targetId.includes('::')) {
      const parts = targetId.split('::');
      if (parts[0] === upstream.id) {
        originalTargetId = parts.slice(1).join('::');
      } else {
        originalTargetId = 'root';
      }
    }

    try {
      const res = await upstream.createResumableSession(
        originalTargetId,
        fileName,
        mimeType,
        totalSize,
        metadata
      );

      if (!res.ok) {
        return this.error(`Upstream "${upstream.id}" failed: ${res.error}`);
      }

      // Fully qualify the session ID so chunks route to the selected provider
      const unionSessionId = `${upstream.id}::${res.data.sessionId}`;

      return this.result({
        resumableUri: res.data.resumableUri,
        sessionId: unionSessionId,
      });
    } catch (err: any) {
      return this.error(`Resumable session failed on upstream "${upstream.id}": ${err.message}`);
    }
  }
}
