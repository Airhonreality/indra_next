/**
 * WORKER BRIDGE — Typed interface to transcoder.worker.ts
 *
 * Manages the Worker lifecycle and exposes a Promise-based API.
 * Each pending operation is tracked by fileId. The Worker is created
 * lazily on first use and reused across calls (Singleton).
 */

import type {
  MediaMetadata,
  MediaOperationResult,
  TranscodeConfig,
  TransducedResult,
  WorkerCommand,
  WorkerEvent,
} from '@/core/media/types';

type PendingResolver<T> = {
  resolve: (result: MediaOperationResult<T>) => void;
};

export class WorkerBridge {
  private static _instance: WorkerBridge | null = null;

  private worker: Worker | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private pending = new Map<string, PendingResolver<any>>();

  private constructor() {}

  static getInstance(): WorkerBridge {
    if (!this._instance) {
      this._instance = new WorkerBridge();
    }
    return this._instance;
  }

  private getWorker(): Worker {
    if (!this.worker) {
      if (typeof Worker === 'undefined') {
        throw new Error(
          'WORKER_UNAVAILABLE: Web Workers are not supported in this environment.'
        );
      }
      this.worker = new Worker(
        new URL('./transcoder.worker.ts', import.meta.url),
        { type: 'module', name: 'sme-transcoder' }
      );
      this.worker.addEventListener('message', this.handleMessage.bind(this));
      this.worker.addEventListener('error', this.handleWorkerError.bind(this));
    }
    return this.worker;
  }

  private handleMessage(event: MessageEvent<WorkerEvent>): void {
    const msg = event.data;

    switch (msg.type) {
      case 'METADATA_READY': {
        const resolver = this.pending.get(msg.payload.fileId);
        if (resolver) {
          this.pending.delete(msg.payload.fileId);
          resolver.resolve({ ok: true, data: msg.payload.metadata, durationMs: 0 });
        }
        break;
      }
      case 'TRANSCODE_COMPLETE': {
        const resolver = this.pending.get(msg.payload.fileId);
        if (resolver) {
          this.pending.delete(msg.payload.fileId);
          resolver.resolve({ ok: true, data: msg.payload.buffer, durationMs: 0 });
        }
        break;
      }
      case 'FRAME_INDEX_READY': {
        const resolver = this.pending.get(msg.payload.fileId);
        if (resolver) {
          this.pending.delete(msg.payload.fileId);
          resolver.resolve({ ok: true, data: msg.payload.frames, durationMs: 0 });
        }
        break;
      }
      case 'ERROR': {
        const resolver = this.pending.get(msg.payload.fileId);
        if (resolver) {
          this.pending.delete(msg.payload.fileId);
          resolver.resolve({ ok: false, error: msg.payload.error, durationMs: 0 });
        }
        break;
      }
      case 'PROGRESS':
        // Propagate progress events for external listeners
        this.onProgress?.(msg.payload.fileId, msg.payload.percent, msg.payload.stage);
        break;
    }
  }

  private handleWorkerError(event: ErrorEvent): void {
    // Reject all pending operations — the worker has crashed
    for (const [fileId, resolver] of this.pending) {
      resolver.resolve({
        ok: false,
        error: {
          code: 'WORKER_UNAVAILABLE',
          message: `Worker crashed: ${event.message}`,
          recoveryHint: 'Reload the page. If the issue persists, check available memory.',
        },
        durationMs: 0,
      });
    }
    this.pending.clear();
    this.worker = null; // Will be recreated on next use
  }

  /** Optional progress callback for UI feedback */
  onProgress?: (fileId: string, percent: number, stage: string) => void;

  // ─── Public API ─────────────────────────────────────────────────────────────

  extractMetadata(
    fileId: string,
    buffer: ArrayBuffer,
    mimeType: string
  ): Promise<MediaOperationResult<MediaMetadata>> {
    return new Promise(resolve => {
      this.pending.set(fileId, { resolve });
      const cmd: WorkerCommand = {
        type: 'EXTRACT_METADATA',
        payload: {
          fileId,
          buffer,
          mimeType,
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        },
      };
      // Transfer the buffer — zero copy, buffer becomes unusable in main thread
      this.getWorker().postMessage(cmd, [buffer]);
    });
  }

  transcode(
    fileId: string,
    buffer: ArrayBuffer,
    mimeType: string,
    config: TranscodeConfig
  ): Promise<MediaOperationResult<ArrayBuffer>> {
    return new Promise(resolve => {
      this.pending.set(fileId, { resolve });
      const cmd: WorkerCommand = {
        type: 'TRANSCODE',
        payload: { fileId, buffer, mimeType, config },
      };
      this.getWorker().postMessage(cmd, [buffer]);
    });
  }

  buildFrameIndex(
    fileId: string,
    buffer: ArrayBuffer
  ): Promise<MediaOperationResult<import('@/core/media/types').FrameDescriptor[]>> {
    return new Promise(resolve => {
      this.pending.set(fileId, { resolve });
      const cmd: WorkerCommand = {
        type: 'BUILD_FRAME_INDEX',
        payload: { fileId, buffer },
      };
      this.getWorker().postMessage(cmd, [buffer]);
    });
  }

  abort(fileId: string): void {
    const resolver = this.pending.get(fileId);
    if (resolver) {
      this.pending.delete(fileId);
      resolver.resolve({
        ok: false,
        error: {
          code: 'WORKER_UNAVAILABLE',
          message: `Operation for file ${fileId} was aborted by the caller.`,
          recoveryHint: 'Start a new process() call if needed.',
        },
        durationMs: 0,
      });
    }
    const cmd: WorkerCommand = { type: 'ABORT', payload: { fileId } };
    this.worker?.postMessage(cmd);
  }

  /** Terminates the worker and clears all state. */
  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.pending.clear();
    WorkerBridge._instance = null;
  }
}
