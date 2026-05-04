/**
 * MEDIA VAULT BRIDGE — Agnostic adapter
 *
 * Connects a TransducedResult (pure SME output) to any existing
 * IntegrationAdapter (Notion, Google Drive, Storage, etc.).
 *
 * The SME knows nothing about vaults. This bridge is the ONLY
 * place where both worlds are aware of each other.
 *
 * Usage:
 *   const bridge = new MediaVaultBridge(driveAdapter);
 *   const result = await MediaEngine.getInstance().process(file, bridge.asPipelineAdapter());
 *   await bridge.deposit(result.data!);
 */

import type { IntegrationAdapter } from '@/core/types/integration';
import type {
  ChunkDescriptor,
  IntegrityManifest,
  MediaOperationResult,
  PipelineUploadAdapter,
  TransducedResult,
} from '@/core/media/types';

export class MediaVaultBridge {
  private readonly vaultAdapter: IntegrationAdapter;
  private readonly targetId: string;

  /**
   * @param vaultAdapter Any IntegrationAdapter (Drive, Storage, etc.)
   * @param targetId     The folder/bucket/database ID on the vault side
   */
  constructor(vaultAdapter: IntegrationAdapter, targetId: string) {
    this.vaultAdapter = vaultAdapter;
    this.targetId = targetId;
  }

  /**
   * Returns a PipelineUploadAdapter that routes SME chunks
   * through the vault adapter's pushRecords method.
   *
   * Each chunk is encoded as a base64 data record. For large files,
   * replace this with a multipart/signed-URL implementation specific
   * to your vault (e.g., Google Drive resumable uploads).
   */
  asPipelineAdapter(): PipelineUploadAdapter {
    const { vaultAdapter, targetId } = this;

    return {
      async uploadChunk(
        chunk: Uint8Array,
        descriptor: ChunkDescriptor,
        sessionId: string
      ): Promise<MediaOperationResult<{ etag?: string }>> {
        const start = Date.now();
        try {
          const b64 = uint8ToBase64(chunk);
          const result = await vaultAdapter.pushRecords(targetId, [
            {
              id: `${sessionId}-chunk-${descriptor.index}`,
              fields: {
                sessionId,
                chunkIndex: descriptor.index,
                chunkHash: descriptor.hash,
                chunkOffset: descriptor.offset,
                chunkSize: descriptor.size,
                data: b64,
              },
              metadata: {
                source: vaultAdapter.id,
                sourceId: `${sessionId}-${descriptor.index}`,
              },
            },
          ]);

          if (!result.ok) {
            return {
              ok: false,
              error: {
                code: 'CHUNK_UPLOAD_FAILED',
                message: `Vault rejected chunk ${descriptor.index}: ${result.error}`,
                chunkIndex: descriptor.index,
                chunkHash: descriptor.hash,
                recoveryHint: 'Check vault connectivity and quota. The pipeline will retry.',
              },
              durationMs: Date.now() - start,
            };
          }

          return { ok: true, data: {}, durationMs: Date.now() - start };
        } catch (err) {
          return {
            ok: false,
            error: {
              code: 'CHUNK_UPLOAD_FAILED',
              message: `uploadChunk threw: ${String(err)}`,
              chunkIndex: descriptor.index,
              recoveryHint: 'Unexpected error. Check adapter implementation.',
              stack: err instanceof Error ? err.stack : undefined,
            },
            durationMs: Date.now() - start,
          };
        }
      },

      async finalizeSession(
        sessionId: string,
        manifest: IntegrityManifest
      ): Promise<MediaOperationResult<{ url?: string }>> {
        const start = Date.now();
        try {
          const result = await vaultAdapter.pushRecords(targetId, [
            {
              id: `${sessionId}-manifest`,
              fields: {
                type: 'SME_MANIFEST',
                sessionId,
                fileId: manifest.fileId,
                fileName: manifest.fileName,
                fileSize: manifest.fileSize,
                mimeType: manifest.mimeType,
                globalHash: manifest.globalHash,
                chunkCount: manifest.chunks.length,
                createdAt: manifest.createdAt,
              },
              metadata: {
                source: vaultAdapter.id,
                sourceId: manifest.fileId,
              },
            },
          ]);

          if (!result.ok) {
            return {
              ok: false,
              error: {
                code: 'CHUNK_UPLOAD_FAILED',
                message: `Vault rejected manifest for session ${sessionId}: ${result.error}`,
                recoveryHint: 'All chunks were uploaded. Retry finalize only.',
              },
              durationMs: Date.now() - start,
            };
          }

          return { ok: true, data: {}, durationMs: Date.now() - start };
        } catch (err) {
          return {
            ok: false,
            error: {
              code: 'CHUNK_UPLOAD_FAILED',
              message: `finalizeSession threw: ${String(err)}`,
              recoveryHint: 'Retry finalization. All chunks are already staged.',
              stack: err instanceof Error ? err.stack : undefined,
            },
            durationMs: Date.now() - start,
          };
        }
      },
    };
  }

  /**
   * After process() completes, deposit the full TransducedResult
   * as a structured record (metadata + manifest reference) in the vault.
   */
  async deposit(result: TransducedResult): Promise<MediaOperationResult<void>> {
    const start = Date.now();
    try {
      const pushResult = await this.vaultAdapter.pushRecords(this.targetId, [
        {
          id: result.fileId,
          fields: {
            fileId: result.fileId,
            fileName: result.originalFile.name,
            fileSize: result.originalFile.size,
            mimeType: result.metadata.mimeType,
            globalHash: result.manifest.globalHash,
            chunkCount: result.manifest.chunks.length,
            width: result.metadata.width ?? null,
            height: result.metadata.height ?? null,
            durationMs: result.metadata.durationMs ?? null,
            capturedAt: result.metadata.exif?.capturedAt ?? null,
            gpsLat: result.metadata.exif?.gps?.lat ?? null,
            gpsLon: result.metadata.exif?.gps?.lon ?? null,
            cameraMake: result.metadata.exif?.make ?? null,
            cameraModel: result.metadata.exif?.model ?? null,
            videoCreationTime: result.metadata.video?.creationTimeUtc ?? null,
            isMobileSandbox: result.metadata.origin?.isMobileSandbox ?? false,
            platform: result.metadata.origin?.platform ?? null,
            metadataSanitized: result.metadata.origin?.sanitized ?? false,
            depositedAt: new Date().toISOString(),
          },
          metadata: {
            source: this.vaultAdapter.id,
            sourceId: result.fileId,
            createdAt: new Date().toISOString(),
          },
        },
      ]);

      if (!pushResult.ok) {
        return {
          ok: false,
          error: {
            code: 'CHUNK_UPLOAD_FAILED',
            message: `Vault deposit failed: ${pushResult.error}`,
            recoveryHint: 'The file was uploaded. Only the metadata record failed. Retry deposit().',
          },
          durationMs: Date.now() - start,
        };
      }

      return { ok: true, durationMs: Date.now() - start };
    } catch (err) {
      return {
        ok: false,
        error: {
          code: 'CHUNK_UPLOAD_FAILED',
          message: `deposit threw: ${String(err)}`,
          recoveryHint: 'Check vault adapter and network connectivity.',
          stack: err instanceof Error ? err.stack : undefined,
        },
        durationMs: Date.now() - start,
      };
    }
  }
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 8192; // avoid stack overflow on large buffers
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}
