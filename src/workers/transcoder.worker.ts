/**
 * TRANSCODER WORKER — Web Worker entry point
 *
 * Runs in a dedicated thread. Handles:
 *   EXTRACT_METADATA  → binary EXIF / MP4 atom parsing
 *   TRANSCODE         → image: OffscreenCanvas; video: WebCodecs (requires demuxer)
 *   BUILD_FRAME_INDEX → stub (requires mp4box.js for production muxing)
 *
 * All large ArrayBuffers are transferred (Transferable), not copied.
 *
 * Prohibited in this file:
 *   - Any import of React, Next.js, or DOM UI APIs
 *   - Any reference to window.document
 */

import type { WorkerCommand, WorkerEvent, MediaError, MediaMetadata } from '@/core/media/types';
import { MetadataEngine } from '@/core/media/metadata';

const engine = new MetadataEngine();

// In a DedicatedWorker, postMessage accepts (message, transfer[]).
// TypeScript's dom lib types self as Window, so we cast once.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ctx = self as unknown as { addEventListener: typeof self.addEventListener; postMessage(msg: unknown, transfer?: Transferable[]): void };

// ─── Message router ───────────────────────────────────────────────────────────

ctx.addEventListener('message', async (event: MessageEvent<WorkerCommand>) => {
  const cmd = event.data;

  switch (cmd.type) {
    case 'EXTRACT_METADATA':
      await handleExtractMetadata(cmd.payload);
      break;
    case 'TRANSCODE':
      await handleTranscode(cmd.payload);
      break;
    case 'BUILD_FRAME_INDEX':
      await handleBuildFrameIndex(cmd.payload);
      break;
    case 'ABORT':
      // No-op: per-file abort is handled at the engine level
      break;
    default:
      emitError('__unknown__', {
        code: 'WORKER_UNAVAILABLE',
        message: `Unknown command type received by transcoder worker.`,
        recoveryHint: 'Update the WorkerBridge to match the worker protocol.',
      });
  }
});

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function handleExtractMetadata(payload: {
  fileId: string;
  buffer: ArrayBuffer;
  mimeType: string;
  userAgent: string;
}): Promise<void> {
  emitProgress(payload.fileId, 10, 'Parsing binary metadata');

  const result = engine.extract(payload.buffer, payload.mimeType, payload.userAgent);

  if (!result.ok) {
    emitError(payload.fileId, result.error!);
    return;
  }

  emitProgress(payload.fileId, 100, 'Metadata extracted');

  const event: WorkerEvent = {
    type: 'METADATA_READY',
    payload: { fileId: payload.fileId, metadata: result.data! },
  };
  ctx.postMessage(event);
}

async function handleTranscode(payload: {
  fileId: string;
  buffer: ArrayBuffer;
  mimeType: string;
  config: import('@/core/media/types').TranscodeConfig;
}): Promise<void> {
  const { fileId, buffer, mimeType, config } = payload;

  if (mimeType.startsWith('image/')) {
    await transcodeImage(fileId, buffer, mimeType, config);
  } else if (mimeType.startsWith('video/')) {
    await transcodeVideo(fileId, buffer, mimeType, config);
  } else {
    emitError(fileId, {
      code: 'WEBCODECS_UNSUPPORTED',
      message: `MIME type "${mimeType}" is not supported for transcoding.`,
      recoveryHint: 'Provide an image/* or video/* file.',
    });
  }
}

async function transcodeImage(
  fileId: string,
  buffer: ArrayBuffer,
  mimeType: string,
  config: import('@/core/media/types').TranscodeConfig
): Promise<void> {
  if (typeof OffscreenCanvas === 'undefined') {
    emitError(fileId, {
      code: 'OFFSCREEN_CANVAS_UNSUPPORTED',
      message: 'OffscreenCanvas is unavailable in this Worker context.',
      recoveryHint: 'Use a Chromium-based browser with OffscreenCanvas support.',
    });
    return;
  }

  emitProgress(fileId, 10, 'Decoding image');

  let bitmap: ImageBitmap;
  try {
    const blob = new Blob([buffer], { type: mimeType });
    bitmap = await createImageBitmap(blob);
  } catch (err) {
    emitError(fileId, {
      code: 'METADATA_EXTRACTION_FAILED',
      message: `createImageBitmap failed: ${String(err)}`,
      recoveryHint: 'Verify the file is a valid, untruncated image.',
    });
    return;
  }

  const width = config.targetWidth ?? bitmap.width;
  const height = config.targetHeight ?? bitmap.height;
  const canvas = new OffscreenCanvas(width, height);
  const canvasCtx = canvas.getContext('2d');

  if (!canvasCtx) {
    emitError(fileId, {
      code: 'OFFSCREEN_CANVAS_UNSUPPORTED',
      message: 'Could not acquire 2D context from OffscreenCanvas.',
      recoveryHint: 'GPU context may be unavailable. Retry.',
    });
    return;
  }

  canvasCtx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  emitProgress(fileId, 60, 'Encoding output');

  let outputBlob: Blob;
  try {
    outputBlob = await canvas.convertToBlob({
      type: 'image/jpeg',
      quality: 0.92,
    });
  } catch (err) {
    emitError(fileId, {
      code: 'WEBCODECS_UNSUPPORTED',
      message: `canvas.convertToBlob failed: ${String(err)}`,
      recoveryHint: 'Try a different output format.',
    });
    return;
  }

  const outBuffer = await outputBlob.arrayBuffer();
  emitProgress(fileId, 100, 'Image transcoded');

  const event: WorkerEvent = {
    type: 'TRANSCODE_COMPLETE',
    payload: { fileId, buffer: outBuffer },
  };
  // Transfer ownership — zero copy
  ctx.postMessage(event, [outBuffer]);
}

async function transcodeVideo(
  fileId: string,
  _buffer: ArrayBuffer,
  _mimeType: string,
  config: import('@/core/media/types').TranscodeConfig
): Promise<void> {
  // Hardware acceleration negotiation
  if (typeof VideoEncoder === 'undefined') {
    emitError(fileId, {
      code: 'WEBCODECS_UNSUPPORTED',
      message: 'WebCodecs VideoEncoder is not available in this browser.',
      recoveryHint: 'Use Chrome 94+ or Edge 94+. Safari requires version 16.4+.',
    });
    return;
  }

  const codec = config.codec ?? 'avc';
  const codecString = codecToString(codec, config.profile ?? 'high');
  const accel = config.hardwareAcceleration ?? 'prefer-hardware';

  const support = await VideoEncoder.isConfigSupported({
    codec: codecString,
    width: config.targetWidth ?? 1920,
    height: config.targetHeight ?? 1080,
    bitrate: config.bitrate ?? 8_000_000,
    hardwareAcceleration: accel,
  });

  if (!support.supported) {
    emitError(fileId, {
      code: 'HARDWARE_ACCEL_UNAVAILABLE',
      message: `Codec "${codecString}" with "${accel}" is not supported on this device.`,
      recoveryHint: 'Try codec "avc" with "prefer-software" as fallback.',
    });
    return;
  }

  // Full video transcoding requires an MP4 demuxer (mp4box.js) to feed
  // EncodedVideoChunk objects to VideoDecoder. Without it, we cannot
  // process the container format.
  emitError(fileId, {
    code: 'WEBCODECS_UNSUPPORTED',
    message: 'Video transcoding requires an MP4 demuxer. Add mp4box.js as a dependency.',
    recoveryHint: 'Install mp4box.js: npm install mp4box. The WebCodecs pipeline is ready.',
  });
}

async function handleBuildFrameIndex(payload: {
  fileId: string;
  buffer: ArrayBuffer;
}): Promise<void> {
  // Without mp4box.js we cannot walk the sample table (stbl/stts/ctts/stss).
  // Emit an empty identity map so callers can gracefully degrade.
  emitProgress(payload.fileId, 100, 'Frame index unavailable without demuxer');

  const event: WorkerEvent = {
    type: 'FRAME_INDEX_READY',
    payload: { fileId: payload.fileId, frames: [] },
  };
  ctx.postMessage(event);
}

// ─── Emit helpers ─────────────────────────────────────────────────────────────

function emitProgress(fileId: string, percent: number, stage: string): void {
  const event: WorkerEvent = {
    type: 'PROGRESS',
    payload: { fileId, percent, stage },
  };
  ctx.postMessage(event);
}

function emitError(fileId: string, error: MediaError): void {
  const event: WorkerEvent = {
    type: 'ERROR',
    payload: { fileId, error },
  };
  ctx.postMessage(event);
}

// ─── Codec string helpers ─────────────────────────────────────────────────────

function codecToString(
  codec: 'avc' | 'hevc' | 'vp9' | 'av1',
  profile: 'baseline' | 'main' | 'high'
): string {
  // AVC codec strings per RFC 6381
  const avcProfileMap: Record<string, string> = {
    baseline: 'avc1.42E01E',
    main: 'avc1.4D401E',
    high: 'avc1.640028',
  };
  switch (codec) {
    case 'avc': return avcProfileMap[profile] ?? avcProfileMap.high;
    case 'hevc': return 'hvc1.1.6.L93.B0';
    case 'vp9': return 'vp09.00.10.08';
    case 'av1': return 'av01.0.04M.08';
  }
}

// Required by TypeScript to treat this as a module
export {};
