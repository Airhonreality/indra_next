/**
 * SOVEREIGN MEDIA ENGINE — TYPE CONTRACTS
 * Single source of truth for all SME interfaces.
 * Zero coupling to external silos (Drive, Notion, etc.).
 */

export type MediaErrorCode =
  | 'CHUNK_HASH_MISMATCH'
  | 'GLOBAL_HASH_MISMATCH'
  | 'WORKER_UNAVAILABLE'
  | 'OFFSCREEN_CANVAS_UNSUPPORTED'
  | 'WEBCODECS_UNSUPPORTED'
  | 'HARDWARE_ACCEL_UNAVAILABLE'
  | 'METADATA_EXTRACTION_FAILED'
  | 'METADATA_INJECTION_FAILED'
  | 'CHUNK_UPLOAD_FAILED'
  | 'SESSION_RESUME_FAILED'
  | 'MOBILE_SANDBOX_DETECTED'
  | 'PIPELINE_CIRCUIT_OPEN'
  | 'OPFS_UNAVAILABLE';

export interface MediaError {
  code: MediaErrorCode;
  message: string;
  chunkIndex?: number;
  chunkHash?: string;
  recoveryHint: string;
  stack?: string;
}

export interface MediaOperationResult<T = void> {
  ok: boolean;
  data?: T;
  error?: MediaError;
  durationMs: number;
}

export interface ChunkDescriptor {
  index: number;
  offset: number;
  size: number;
  /** SHA-256 hex of the chunk bytes */
  hash: string;
  status: 'pending' | 'hashing' | 'ready' | 'uploading' | 'done' | 'failed';
}

export interface IntegrityManifest {
  /** First 16 hex chars of the global (Merkle-root) SHA-256 */
  fileId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  /** SHA-256 of all chunk hashes concatenated — bit-perfect Merkle root */
  globalHash: string;
  chunkSize: number;
  chunks: ChunkDescriptor[];
  createdAt: number;
}

export interface ExifData {
  make?: string;
  model?: string;
  /** ISO 8601 with UTC offset, e.g. "2024-03-15T14:22:00+05:30" */
  capturedAt?: string;
  gps?: { lat: number; lon: number; alt?: number };
  orientation?: number;
}

export interface FrameDescriptor {
  index: number;
  timeMs: number;
  isKeyframe: boolean;
  byteOffset: number;
}

export interface MediaMetadata {
  mimeType: string;
  width?: number;
  height?: number;
  durationMs?: number;
  bitrate?: number;
  exif?: ExifData;
  video?: {
    codec?: string;
    frameRate?: number;
    /** UTC-corrected creation time from mvhd atom */
    creationTimeUtc?: string;
    /** Keyframe identity map for instant seek */
    identityMap?: FrameDescriptor[];
    /** Normalised waveform peaks, range [-1, 1] */
    waveformPeaks?: number[];
  };
  origin?: {
    isMobileSandbox: boolean;
    platform?: 'ios' | 'android' | 'desktop';
    /** True when the OS stripped metadata before we received the file */
    sanitized: boolean;
  };
}

export interface TransducedResult {
  fileId: string;
  originalFile: File;
  manifest: IntegrityManifest;
  metadata: MediaMetadata;
  transcodedBlob?: Blob;
  transcodedManifest?: IntegrityManifest;
}

export interface UploadSession {
  sessionId: string;
  fileId: string;
  manifest: IntegrityManifest;
  uploadedChunks: Set<number>;
  startedAt: number;
  lastActivityAt: number;
}

export interface TranscodeConfig {
  codec?: 'avc' | 'hevc' | 'vp9' | 'av1';
  profile?: 'baseline' | 'main' | 'high';
  hardwareAcceleration?: 'prefer-hardware' | 'prefer-software' | 'no-preference';
  bitrate?: number;
  targetWidth?: number;
  targetHeight?: number;
  preserveMetadata: boolean;
}

// ─── Worker message protocol (structured-clone safe) ────────────────────────

export type WorkerCommand =
  | {
      type: 'TRANSCODE';
      payload: { fileId: string; buffer: ArrayBuffer; mimeType: string; config: TranscodeConfig };
    }
  | {
      type: 'EXTRACT_METADATA';
      payload: { fileId: string; buffer: ArrayBuffer; mimeType: string; userAgent: string };
    }
  | {
      type: 'BUILD_FRAME_INDEX';
      payload: { fileId: string; buffer: ArrayBuffer };
    }
  | {
      type: 'ABORT';
      payload: { fileId: string };
    };

export type WorkerEvent =
  | { type: 'PROGRESS'; payload: { fileId: string; percent: number; stage: string } }
  | { type: 'METADATA_READY'; payload: { fileId: string; metadata: MediaMetadata } }
  | { type: 'FRAME_INDEX_READY'; payload: { fileId: string; frames: FrameDescriptor[] } }
  | { type: 'TRANSCODE_COMPLETE'; payload: { fileId: string; buffer: ArrayBuffer } }
  | { type: 'ERROR'; payload: { fileId: string; error: MediaError } };

// ─── Pipeline upload contract ────────────────────────────────────────────────

export interface PipelineUploadAdapter {
  uploadChunk(
    chunk: Uint8Array,
    descriptor: ChunkDescriptor,
    sessionId: string
  ): Promise<MediaOperationResult<{ etag?: string }>>;

  finalizeSession(
    sessionId: string,
    manifest: IntegrityManifest
  ): Promise<MediaOperationResult<{ url?: string }>>;
}
