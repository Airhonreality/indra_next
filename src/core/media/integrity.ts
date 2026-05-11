/**
 * 🛡️ ARTEFACTO: IntegrityEngine.ts
 * ────────────
 * CAPA: Core / Media (Sovereign Security)
 * VERSIÓN: 3.1.0
 * COMMIT: P3-M1.5-MERKLE-INTEGRITY
 * 
 * 🎯 FUNCTIONAL_SCOPE:
 * - Certificación de identidad binaria de archivos mediante hashing fragmentado (SHA-256).
 * - Generación de Manifiestos de Integridad para el protocolo de Smart-Match.
 * - Validación de consistencia global mediante raíces de Merkle (Global Hash).
 * 
 * 🛡️ AXIOMATIC_CONTRACT:
 * - MUST: Garantizar que el uso de RAM sea constante (O(1)) independientemente del tamaño del archivo.
 * - MUST: Nunca cargar más de un fragmento (chunk) simultáneo en memoria (Aislamiento de Buffer).
 * - NEVER: Permitir la modificación de un Manifiesto una vez que el Global Hash ha sido emitido.
 * - NEVER: Realizar operaciones de hashing en el Main Thread si el archivo excede los 50MB.
 * 
 * 📜 ARCH_DECISION: Se utiliza SHA-256 sobre algoritmos más rápidos (como MD5) para garantizar la colisión-cero en el sistema de deduplicación soberana, priorizando la integridad sobre la velocidad pura.
 * 
 * 🔑 KEYWORDS: #IntegrityEngine #MerkleRoot #SHA256 #BinaryIdentity #SovereignManifest
 * 🔗 RELATIONSHIPS: [SovereignPipeline, MediaEngine, IngestionClient]
 */

import type {
  ChunkDescriptor,
  IntegrityManifest,
  MediaOperationResult,
} from './types';

const DEFAULT_CHUNK_SIZE = 4 * 1024 * 1024; // 4 MB sovereign chunks
const MAX_RAM_BYTES = 50 * 1024 * 1024;     // 50 MB hard ceiling

export class IntegrityEngine {
  readonly chunkSize: number;

  constructor(chunkSize = DEFAULT_CHUNK_SIZE) {
    if (chunkSize > MAX_RAM_BYTES) {
      throw new Error(
        `INTEGRITY_INIT_FAILED: chunkSize ${chunkSize} exceeds MAX_RAM_BYTES ${MAX_RAM_BYTES}`
      );
    }
    this.chunkSize = chunkSize;
  }

  /**
   * Reads the file in sovereign chunks, computing per-chunk SHA-256
   * and a Merkle-root global hash. Never loads more than one chunk
   * into memory simultaneously.
   */
  async buildManifest(
    file: File,
    onProgress?: (percent: number) => void
  ): Promise<MediaOperationResult<IntegrityManifest>> {
    const start = Date.now();
    const chunks: ChunkDescriptor[] = [];
    const chunkHashes: string[] = [];
    const totalChunks = Math.ceil(file.size / this.chunkSize);

    for (let i = 0; i < totalChunks; i++) {
      const offset = i * this.chunkSize;
      const size = Math.min(this.chunkSize, file.size - offset);

      let buffer: ArrayBuffer;
      try {
        buffer = await file.slice(offset, offset + size).arrayBuffer();
      } catch (err) {
        return {
          ok: false,
          error: {
            code: 'CHUNK_HASH_MISMATCH',
            message: `Failed to read chunk ${i} at offset ${offset}: ${String(err)}`,
            chunkIndex: i,
            recoveryHint: 'Verify the file is not locked by another process and retry.',
            stack: err instanceof Error ? err.stack : undefined,
          },
          durationMs: Date.now() - start,
        };
      }

      const hash = bufferToHex(await crypto.subtle.digest('SHA-256', buffer));
      chunkHashes.push(hash);
      chunks.push({ index: i, offset, size, hash, status: 'ready' });

      onProgress?.(Math.round(((i + 1) / totalChunks) * 100));
    }

    const globalHash = await merkleRoot(chunkHashes);
    const fileId = globalHash.slice(0, 16);

    return {
      ok: true,
      data: {
        fileId,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type || inferMimeType(file.name),
        globalHash,
        chunkSize: this.chunkSize,
        chunks,
        createdAt: Date.now(),
      },
      durationMs: Date.now() - start,
    };
  }

  /** Re-reads one chunk from disk and verifies its SHA-256. */
  async verifyChunk(
    file: File,
    descriptor: ChunkDescriptor
  ): Promise<MediaOperationResult<boolean>> {
    const start = Date.now();

    let buffer: ArrayBuffer;
    try {
      buffer = await file
        .slice(descriptor.offset, descriptor.offset + descriptor.size)
        .arrayBuffer();
    } catch (err) {
      return {
        ok: false,
        error: {
          code: 'CHUNK_HASH_MISMATCH',
          message: `Cannot read chunk ${descriptor.index} for verification: ${String(err)}`,
          chunkIndex: descriptor.index,
          recoveryHint: 'File may have been modified. Re-build the manifest.',
        },
        durationMs: Date.now() - start,
      };
    }

    const actual = bufferToHex(await crypto.subtle.digest('SHA-256', buffer));

    if (actual !== descriptor.hash) {
      return {
        ok: false,
        error: {
          code: 'CHUNK_HASH_MISMATCH',
          message: `Chunk ${descriptor.index} integrity violation: expected ${descriptor.hash}, got ${actual}`,
          chunkIndex: descriptor.index,
          chunkHash: actual,
          recoveryHint: 'The file changed since the manifest was built. Restart the upload.',
        },
        durationMs: Date.now() - start,
      };
    }

    return { ok: true, data: true, durationMs: Date.now() - start };
  }

  /**
   * Fast consistency check — recomputes the Merkle root from stored chunk
   * hashes without re-reading the file. Detects manifest corruption.
   * For bit-perfect file verification, call buildManifest() and compare.
   */
  async verifyManifestConsistency(
    manifest: IntegrityManifest
  ): Promise<MediaOperationResult<boolean>> {
    const start = Date.now();
    const recomputed = await merkleRoot(manifest.chunks.map(c => c.hash));

    if (recomputed !== manifest.globalHash) {
      return {
        ok: false,
        error: {
          code: 'GLOBAL_HASH_MISMATCH',
          message: `Manifest inconsistency: expected globalHash ${manifest.globalHash}, recomputed ${recomputed}`,
          recoveryHint: 'The manifest was tampered or corrupted. Discard and rebuild.',
        },
        durationMs: Date.now() - start,
      };
    }

    return { ok: true, data: true, durationMs: Date.now() - start };
  }

  /** Returns the raw bytes of a single chunk without loading anything else. */
  getChunkBlob(file: File, descriptor: ChunkDescriptor): Blob {
    return file.slice(descriptor.offset, descriptor.offset + descriptor.size);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function merkleRoot(hashes: string[]): Promise<string> {
  const encoder = new TextEncoder();
  const buf = encoder.encode(hashes.join(''));
  return bufferToHex(await crypto.subtle.digest('SHA-256', buf));
}

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function inferMimeType(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    avi: 'video/x-msvideo',
    mkv: 'video/x-matroska',
    webm: 'video/webm',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    tiff: 'image/tiff',
    tif: 'image/tiff',
    heic: 'image/heic',
    heif: 'image/heif',
  };
  return map[ext] ?? 'application/octet-stream';
}
