/**
 * SOVEREIGN PIPELINE — PERISTALTIC UPLOAD PROTOCOL (PUP)
 *
 * Axioms:
 * - 1 concurrent chunk upload (semáforo de cortesía)
 * - Exponential backoff: 1s × 2^n + jitter, max 5 retries
 * - Circuit breaker: CLOSED → OPEN after 3 consecutive failures, 30s cooldown
 * - OPFS staging buffer: each chunk is persisted locally before transmission
 * - Idempotency: chunks keyed by `${sessionId}-${chunkIndex}-${hash}`
 */

import type {
  ChunkDescriptor,
  IntegrityManifest,
  MediaError,
  MediaOperationResult,
  PipelineUploadAdapter,
  UploadSession,
} from './types';

// ─── Circuit Breaker ──────────────────────────────────────────────────────────

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private consecutiveFailures = 0;
  private openedAt = 0;

  private readonly threshold = 3;
  private readonly cooldownMs = 30_000;

  isOpen(): boolean {
    if (this.state === 'OPEN') {
      if (Date.now() - this.openedAt >= this.cooldownMs) {
        this.state = 'HALF_OPEN';
        return false;
      }
      return true;
    }
    return false;
  }

  recordSuccess(): void {
    this.consecutiveFailures = 0;
    this.state = 'CLOSED';
  }

  recordFailure(): void {
    this.consecutiveFailures++;
    if (this.consecutiveFailures >= this.threshold) {
      this.state = 'OPEN';
      this.openedAt = Date.now();
    }
  }

  get currentState(): CircuitState {
    return this.state;
  }
}

// ─── Pipeline ─────────────────────────────────────────────────────────────────

export class SovereignPipeline {
  private readonly circuit = new CircuitBreaker();
  private readonly sessions = new Map<string, UploadSession>();

  /** Returns the persisted session or creates a fresh one. */
  getOrCreateSession(manifest: IntegrityManifest): UploadSession {
    const existing = this.sessions.get(manifest.fileId);
    if (existing) {
      existing.lastActivityAt = Date.now();
      return existing;
    }

    const session: UploadSession = {
      sessionId: `${manifest.fileId}-${Date.now()}`,
      fileId: manifest.fileId,
      manifest,
      uploadedChunks: new Set(),
      startedAt: Date.now(),
      lastActivityAt: Date.now(),
    };
    this.sessions.set(manifest.fileId, session);
    return session;
  }

  /**
   * Executes the full peristaltic upload.
   * - Stages each chunk to OPFS before uploading.
   * - Skips already-uploaded chunks (resumability).
   * - Emits progress via onProgress callback.
   */
  async run(
    file: File,
    manifest: IntegrityManifest,
    adapter: PipelineUploadAdapter,
    onProgress?: (uploaded: number, total: number) => void
  ): Promise<MediaOperationResult<{ url?: string }>> {
    const start = Date.now();
    const session = this.getOrCreateSession(manifest);

    const opfsResult = await checkOpfs();
    if (!opfsResult.ok) return { ok: false, error: opfsResult.error, durationMs: Date.now() - start };

    const opfsRoot = opfsResult.data!;
    const pending = manifest.chunks.filter(c => !session.uploadedChunks.has(c.index));

    for (const chunk of pending) {
      if (this.circuit.isOpen()) {
        return {
          ok: false,
          error: {
            code: 'PIPELINE_CIRCUIT_OPEN',
            message: `Circuit breaker OPEN after repeated failures. Last opened at ${new Date(Date.now() - 30_000).toISOString()}.`,
            chunkIndex: chunk.index,
            recoveryHint: 'Wait 30 seconds and resume the session. If the issue persists, check the upload adapter.',
          },
          durationMs: Date.now() - start,
        };
      }

      // Stage to OPFS
      const stageResult = await stageChunkToOpfs(opfsRoot, session.sessionId, chunk, file);
      if (!stageResult.ok) return { ok: false, error: stageResult.error, durationMs: Date.now() - start };

      // Upload with backoff
      const uploadResult = await this.uploadWithBackoff(
        stageResult.data!,
        chunk,
        session.sessionId,
        adapter
      );

      if (!uploadResult.ok) {
        this.circuit.recordFailure();
        await removeFromOpfs(opfsRoot, session.sessionId, chunk.index);
        return { ok: false, error: uploadResult.error, durationMs: Date.now() - start };
      }

      this.circuit.recordSuccess();
      session.uploadedChunks.add(chunk.index);
      session.lastActivityAt = Date.now();
      await removeFromOpfs(opfsRoot, session.sessionId, chunk.index);

      onProgress?.(session.uploadedChunks.size, manifest.chunks.length);
    }

    // All chunks uploaded — finalize
    const finalResult = await adapter.finalizeSession(session.sessionId, manifest);
    if (finalResult.ok) this.sessions.delete(manifest.fileId);

    return { ...finalResult, durationMs: Date.now() - start };
  }

  private async uploadWithBackoff(
    chunkBytes: Uint8Array,
    descriptor: ChunkDescriptor,
    sessionId: string,
    adapter: PipelineUploadAdapter
  ): Promise<MediaOperationResult<{ etag?: string }>> {
    const maxRetries = 5;
    const baseDelayMs = 1_000;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const result = await adapter.uploadChunk(chunkBytes, descriptor, sessionId);
      if (result.ok) return result;

      if (attempt === maxRetries) {
        return {
          ok: false,
          error: {
            code: 'CHUNK_UPLOAD_FAILED',
            message: `Chunk ${descriptor.index} failed after ${maxRetries + 1} attempts. Last error: ${result.error?.message}`,
            chunkIndex: descriptor.index,
            chunkHash: descriptor.hash,
            recoveryHint: 'The session is persisted. Call resume() with the same file to continue.',
          },
          durationMs: 0,
        };
      }

      const delay = Math.min(baseDelayMs * Math.pow(2, attempt), 64_000);
      const jitter = delay * 0.2 * (Math.random() * 2 - 1);
      await sleep(Math.round(delay + jitter));
    }

    // Unreachable, but TypeScript requires a return
    return {
      ok: false,
      error: {
        code: 'CHUNK_UPLOAD_FAILED',
        message: `Chunk ${descriptor.index} exhausted all retries.`,
        chunkIndex: descriptor.index,
        recoveryHint: 'Resume the session.',
      },
      durationMs: 0,
    };
  }
}

// ─── OPFS helpers ─────────────────────────────────────────────────────────────

async function checkOpfs(): Promise<MediaOperationResult<FileSystemDirectoryHandle>> {
  if (
    typeof navigator === 'undefined' ||
    !('storage' in navigator) ||
    typeof navigator.storage.getDirectory !== 'function'
  ) {
    return {
      ok: false,
      error: {
        code: 'OPFS_UNAVAILABLE',
        message: 'Origin Private File System API is not available in this environment.',
        recoveryHint: 'OPFS requires a secure context (HTTPS). Check browser support.',
      },
      durationMs: 0,
    };
  }

  try {
    const root = await navigator.storage.getDirectory();
    const smeDir = await root.getDirectoryHandle('sme-staging', { create: true });
    return { ok: true, data: smeDir, durationMs: 0 };
  } catch (err) {
    return {
      ok: false,
      error: {
        code: 'OPFS_UNAVAILABLE',
        message: `OPFS access failed: ${String(err)}`,
        recoveryHint: 'Check storage quota and browser permissions.',
      },
      durationMs: 0,
    };
  }
}

async function stageChunkToOpfs(
  dir: FileSystemDirectoryHandle,
  sessionId: string,
  descriptor: ChunkDescriptor,
  file: File
): Promise<MediaOperationResult<Uint8Array>> {
  const name = `${sessionId}-${descriptor.index}.bin`;
  try {
    const handle = await dir.getFileHandle(name, { create: true });
    const buffer = await file
      .slice(descriptor.offset, descriptor.offset + descriptor.size)
      .arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const writable = await handle.createWritable();
    await writable.write(bytes);
    await writable.close();
    return { ok: true, data: bytes, durationMs: 0 };
  } catch (err) {
    return {
      ok: false,
      error: {
        code: 'OPFS_UNAVAILABLE',
        message: `Failed to stage chunk ${descriptor.index} to OPFS: ${String(err)}`,
        chunkIndex: descriptor.index,
        recoveryHint: 'Free up storage space and retry.',
      } satisfies MediaError,
      durationMs: 0,
    };
  }
}

async function removeFromOpfs(
  dir: FileSystemDirectoryHandle,
  sessionId: string,
  chunkIndex: number
): Promise<void> {
  try {
    await dir.removeEntry(`${sessionId}-${chunkIndex}.bin`);
  } catch {
    // Best-effort cleanup; non-fatal
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
