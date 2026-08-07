/**
 * Local File Sync Endpoint
 *
 * POST /api/desktop/sync
 * Synchronizes files from the local daemon to the user's chosen cloud storage provider.
 *
 * Flow:
 * 1. Pull current file list from local daemon (gRPC)
 * 2. Read user's chosen sync target from local_sync_settings
 * 3. Resolve the actual adapter (S3, Mega, Google Drive)
 * 4. For each file: compare against local_sync_state by BLAKE3 hash
 * 5. For new/changed files: read bytes, upload via adapter.createResumableSession, store in local_sync_state
 * 6. Return summary of uploaded/skipped/errors
 */

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { daemonPullFiles } from '@/lib/daemon-client';
import { localSyncSettings, localSyncState } from '@/core/db/schema';
import { getActiveUpstreams } from '@/integrations/storage-union/helpers';
import { eq, and } from 'drizzle-orm';
import { promises as fs } from 'node:fs';
import { basename } from 'node:path';
import type { IntegrationAdapter, IBlobCapable } from '@/core/types/integration';

interface UploadResult {
  filePath: string;
  localPath: string;
  blake3Hash: string;
  remoteObjectId?: string;
}

interface SyncError {
  filePath: string;
  reason: string;
}

// Type guard to check if adapter supports resumable uploads
function isResumableAdapter(adapter: IntegrationAdapter & Partial<IBlobCapable>): adapter is IntegrationAdapter & IBlobCapable & { createResumableSession: (targetId: string, fileName: string, mimeType: string, totalSize: number, metadata?: Record<string, string>) => Promise<{ ok: boolean; data?: { resumableUri: string; sessionId: string }; error?: string }> } {
  return 'createResumableSession' in adapter && typeof (adapter as unknown as Record<string, unknown>).createResumableSession === 'function';
}

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Step 1: Pull file list from daemon
    const pullResult = await daemonPullFiles();
    const files = pullResult.events
      .filter((event) => event.file !== null)
      .map((event) => {
        const file = event.file!;
        const chunk = file.chunks[0];
        return {
          path: file.path,
          sizeBytes: Number(file.size),
          modifiedAtMs: Number(file.modifiedTimeMs),
          blake3Hex: chunk ? chunk.digest.toString('hex') : null,
        };
      });

    // Step 2: Read user's sync target
    const settings = await db
      .select()
      .from(localSyncSettings)
      .where(eq(localSyncSettings.userId, session.user.id))
      .limit(1);

    if (!settings.length || !settings[0].provider) {
      return NextResponse.json(
        {
          error: 'no_sync_target',
          message: 'No sync target configured. Set a target with PATCH /api/desktop/sync-target first.',
        },
        { status: 400 }
      );
    }

    const targetProvider = settings[0].provider;

    // Step 3: Resolve the adapter for the target provider
    const upstreams = await getActiveUpstreams(session.user.id);
    const adapter = upstreams.find((u) => u.id === targetProvider);

    if (!adapter) {
      return NextResponse.json(
        {
          error: 'provider_not_connected',
          message: `Provider '${targetProvider}' is not connected or active for this user.`,
        },
        { status: 400 }
      );
    }

    // Verify adapter has createResumableSession capability
    if (!isResumableAdapter(adapter)) {
      return NextResponse.json(
        {
          error: 'provider_no_upload',
          message: `Provider '${targetProvider}' does not support file upload.`,
        },
        { status: 400 }
      );
    }

    // Step 4 & 5: Process each file
    const uploaded: UploadResult[] = [];
    const skipped: string[] = [];
    const errors: SyncError[] = [];

    for (const file of files) {
      if (!file.blake3Hex) {
        errors.push({
          filePath: file.path,
          reason: 'No BLAKE3 hash available from daemon',
        });
        continue;
      }

      try {
        // Check if file already synced with same hash
        const existing = await db
          .select()
          .from(localSyncState)
          .where(
            and(
              eq(localSyncState.userId, session.user.id),
              eq(localSyncState.provider, targetProvider),
              eq(localSyncState.localPath, file.path)
            )
          )
          .limit(1);

        if (existing.length > 0 && existing[0].blake3Hash === file.blake3Hex) {
          skipped.push(file.path);
          continue;
        }

        // Read file bytes from local filesystem
        let fileBytes: Buffer;
        try {
          fileBytes = await fs.readFile(file.path);
        } catch (readErr: unknown) {
          const msg = readErr instanceof Error ? readErr.message : 'Unknown error';
          errors.push({
            filePath: file.path,
            reason: `Failed to read file: ${msg}`,
          });
          continue;
        }

        // Infer MIME type from file extension
        const mimeType = inferMimeType(file.path) || 'application/octet-stream';
        const fileName = basename(file.path);

        // Request resumable upload session from adapter
        const resumableResult = await adapter.createResumableSession(
          'indra-local-sync',
          fileName,
          mimeType,
          file.sizeBytes
        );

        if (!resumableResult.ok || !resumableResult.data) {
          errors.push({
            filePath: file.path,
            reason: `Adapter refused upload: ${resumableResult.error || 'Unknown error'}`,
          });
          continue;
        }

        const { resumableUri } = resumableResult.data;

        // Upload bytes via PUT to resumableUri
        const uploadResponse = await fetch(resumableUri, {
          method: 'PUT',
          body: fileBytes as unknown as BodyInit,
          headers: {
            'Content-Type': mimeType,
          },
        });

        if (!uploadResponse.ok) {
          errors.push({
            filePath: file.path,
            reason: `Upload failed: HTTP ${uploadResponse.status} ${uploadResponse.statusText}`,
          });
          continue;
        }

        // Upsert into local_sync_state
        const stateExisting = await db
          .select()
          .from(localSyncState)
          .where(
            and(
              eq(localSyncState.userId, session.user.id),
              eq(localSyncState.localPath, file.path)
            )
          )
          .limit(1);

        if (stateExisting.length > 0) {
          await db
            .update(localSyncState)
            .set({
              provider: targetProvider,
              blake3Hash: file.blake3Hex,
              remoteObjectId: resumableResult.data.sessionId || fileName,
              syncedAt: new Date(),
            })
            .where(eq(localSyncState.id, stateExisting[0].id));
        } else {
          await db.insert(localSyncState).values({
            userId: session.user.id,
            provider: targetProvider,
            localPath: file.path,
            blake3Hash: file.blake3Hex,
            remoteObjectId: resumableResult.data.sessionId || fileName,
            syncedAt: new Date(),
          });
        }

        uploaded.push({
          filePath: file.path,
          localPath: file.path,
          blake3Hash: file.blake3Hex,
          remoteObjectId: resumableResult.data.sessionId || fileName,
        });
      } catch (fileErr: unknown) {
        const msg = fileErr instanceof Error ? fileErr.message : 'Unknown error';
        errors.push({
          filePath: file.path,
          reason: `Unexpected error: ${msg}`,
        });
      }
    }

    return NextResponse.json({
      uploaded,
      skipped,
      errors,
      summary: {
        total: files.length,
        uploadedCount: uploaded.length,
        skippedCount: skipped.length,
        errorCount: errors.length,
      },
    });
  } catch (error) {
    console.error('[desktop/sync] POST failed:', error);
    return NextResponse.json(
      {
        error: 'sync_failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 502 }
    );
  }
}

/**
 * Infer MIME type from file extension.
 * Used to classify files for upload to cloud storage.
 */
function inferMimeType(filePath: string): string | undefined {
  const ext = filePath.split('.').pop()?.toLowerCase();
  const mimeMap: Record<string, string> = {
    'json': 'application/json',
    'csv': 'text/csv',
    'txt': 'text/plain',
    'md': 'text/markdown',
    'html': 'text/html',
    'htm': 'text/html',
    'xml': 'application/xml',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'mp4': 'video/mp4',
    'mov': 'video/quicktime',
    'pdf': 'application/pdf',
  };
  return ext ? mimeMap[ext] : undefined;
}
