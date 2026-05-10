/**
 * 🏛️ ARTEFACTO: SovereignMediaEngine.ts
 * ────────────
 * CAPA: Core / Engines (Browser Runtime)
 * VERSIÓN: 1.2.0-Sovereign
 * COMMIT: P2-M1.4-ADR-MEDIA-ORCHESTRATION
 * 
 * 🎯 FUNCTIONAL_SCOPE:
 * - Orquestación de túneles de datos (Stream-Through) hacia silos externos.
 * - Garantía de integridad binaria mediante hashing SHA-256 concurrente.
 * - Gestión de reanudación inteligente (Smart Match Resume) basada en identidad binaria.
 * 
 * 🛡️ AXIOMATIC_CONTRACT:
 * - MUST: Procesar archivos >1GB sin consumir más de 100MB de RAM (Uso estricto de Streams/Slices).
 * - NEVER: Importar módulos de Node.js ('fs', 'path', 'crypto') o usar 'Buffer'. Solo APIs Web.
 * - NEVER: Instanciar fuera del contexto del navegador (Browser-Only Singleton).
 * - NEVER: Almacenar fragmentos de archivos en memoria persistente del cliente (usar OPFS si es necesario).
 * 
 * 📜 ADR: [2026-05-09] BROWSER_ONLY_MEDIA_PIPELINE
 * - DECISIÓN: El SME debe ejecutarse 100% en el cliente para descargar al servidor de tareas de CPU (Hashing).
 * - IMPACTO: Escalabilidad infinita de ingesta; el servidor solo negocia URIs firmadas.
 * 
 * 🔑 KEYWORDS: #SME #BinaryIntegrity #StreamThrough #BrowserRuntime #SHA256
 * 🔗 RELATIONSHIPS: [IntegrityEngine, SovereignPipeline, WorkerBridge]
 */

import { IntegrityEngine } from './integrity';
import { SovereignPipeline } from './pipeline';
import type {
  MediaOperationResult,
  PipelineUploadAdapter,
  TransducedResult,
  TranscodeConfig,
} from './types';

const DEFAULT_CONFIG: Required<Pick<TranscodeConfig, 'hardwareAcceleration' | 'preserveMetadata'>> = {
  hardwareAcceleration: 'prefer-hardware',
  preserveMetadata: true,
};

export class MediaEngine {
  private static _instance: MediaEngine | null = null;

  private readonly integrity: IntegrityEngine;
  private readonly pipeline: SovereignPipeline;
  private readonly abortSignals = new Map<string, AbortController>();

  private constructor() {
    if (typeof window === 'undefined') {
      throw new Error(
        'SME_SERVER_CONTEXT: MediaEngine must only be instantiated in a browser context.'
      );
    }
    this.integrity = new IntegrityEngine();
    this.pipeline = new SovereignPipeline();
  }

  static getInstance(): MediaEngine {
    if (!this._instance) {
      this._instance = new MediaEngine();
    }
    return this._instance;
  }

  /**
   * Full sovereign processing pipeline:
   * 1. Browser capability check
   * 2. Build integrity manifest (chunked SHA-256)
   * 3. Spawn worker for metadata extraction (non-blocking)
   * 4. Upload all chunks via PUP (OPFS-staged, 1 concurrent, circuit-breaker)
   *
   * For transcoding, call the WorkerBridge directly and pass the result
   * back to process() via the transcodedBlob option.
   */
  async process(
    file: File,
    adapter: PipelineUploadAdapter,
    config: Partial<TranscodeConfig> = {},
    onProgress?: (stage: string, percent: number) => void
  ): Promise<MediaOperationResult<TransducedResult>> {
    const start = Date.now();
    const resolvedConfig: TranscodeConfig = {
      ...DEFAULT_CONFIG,
      ...config,
      preserveMetadata: config.preserveMetadata ?? true,
    };

    // Guard: OffscreenCanvas is required for any image pipeline
    if (typeof OffscreenCanvas === 'undefined') {
      return {
        ok: false,
        error: {
          code: 'OFFSCREEN_CANVAS_UNSUPPORTED',
          message: 'OffscreenCanvas is not supported in this browser.',
          recoveryHint: 'Use a modern Chromium-based browser (Chrome 69+, Edge 79+).',
        },
        durationMs: Date.now() - start,
      };
    }

    onProgress?.('HASHING', 0);

    // Build manifest
    const manifestResult = await this.integrity.buildManifest(
      file,
      pct => onProgress?.('HASHING', pct)
    );
    if (!manifestResult.ok) return { ok: false, error: manifestResult.error, durationMs: Date.now() - start };
    const manifest = manifestResult.data!;

    const controller = new AbortController();
    this.abortSignals.set(manifest.fileId, controller);

    // Lazy-import WorkerBridge only in browser (avoids SSR bundling issues)
    onProgress?.('ANALYZING', 0);
    let metadata = null;
    try {
      const { WorkerBridge } = await import('@/workers/media-worker');
      const bridge = WorkerBridge.getInstance();
      const metaResult = await bridge.extractMetadata(
        manifest.fileId,
        await file.slice(0, Math.min(file.size, 10 * 1024 * 1024)).arrayBuffer(),
        file.type
      );
      if (metaResult.ok) metadata = metaResult.data ?? null;
    } catch {
      // Worker failure is non-fatal; metadata will be absent
    }
    onProgress?.('ANALYZING', 100);

    // Upload via PUP
    onProgress?.('UPLOADING', 0);
    const uploadResult = await this.pipeline.run(
      file,
      manifest,
      adapter,
      (uploaded, total) => onProgress?.('UPLOADING', Math.round((uploaded / total) * 100))
    );

    this.abortSignals.delete(manifest.fileId);

    if (!uploadResult.ok) return { ok: false, error: uploadResult.error, durationMs: Date.now() - start };

    const result: TransducedResult = {
      fileId: manifest.fileId,
      originalFile: file,
      manifest,
      metadata: metadata ?? { mimeType: file.type },
    };

    onProgress?.('DONE', 100);
    return {
      ok: true,
      data: result,
      durationMs: Date.now() - start,
    };
  }

  /**
   * Resumes a previously interrupted upload. The file object must be
   * the same file (identity check via SHA-256 of first chunk).
   */
  async resume(
    fileId: string,
    file: File,
    adapter: PipelineUploadAdapter,
    onProgress?: (stage: string, percent: number) => void
  ): Promise<MediaOperationResult<TransducedResult>> {
    const start = Date.now();

    // Re-build manifest to validate the file hasn't changed
    const manifestResult = await this.integrity.buildManifest(file);
    if (!manifestResult.ok) return { ok: false, error: manifestResult.error, durationMs: Date.now() - start };

    const manifest = manifestResult.data!;
    if (manifest.fileId !== fileId) {
      return {
        ok: false,
        error: {
          code: 'SESSION_RESUME_FAILED',
          message: `File identity mismatch: session fileId ${fileId} ≠ provided file ${manifest.fileId}.`,
          recoveryHint: 'Provide the exact same file that was used to start the session.',
        },
        durationMs: Date.now() - start,
      };
    }

    return this.process(file, adapter, {}, onProgress);
  }

  /** Signals the pipeline to stop processing the given file. */
  abort(fileId: string): void {
    this.abortSignals.get(fileId)?.abort();
    this.abortSignals.delete(fileId);
  }
}
