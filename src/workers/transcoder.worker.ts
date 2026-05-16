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

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import type { WorkerCommand, WorkerEvent, MediaError, MediaMetadata } from '@/core/media/types';
import { MetadataEngine } from '@/core/media/metadata';
import { HardwareTranscoder } from '@/lib/hardware-transcoder';

const engine = new MetadataEngine();
let ffmpeg: FFmpeg | null = null;

/**
 * 🏛️ SOVEREIGN TRANSLATOR: Load FFmpeg only when needed
 */
async function loadFFmpeg() {
  if (ffmpeg) return ffmpeg;
  ffmpeg = new FFmpeg();
  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
  });
  return ffmpeg;
}

// In a DedicatedWorker, postMessage accepts (message, transfer[]).
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
  buffer: ArrayBufferLike;
  mimeType: string;
  userAgent: string;
}): Promise<void> {
  emitProgress(payload.fileId, 10, 'Parsing binary metadata');

  const result = engine.extract(payload.buffer as ArrayBuffer, payload.mimeType, payload.userAgent);

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
  buffer?: ArrayBufferLike;
  opfsFileName?: string;
  mimeType: string;
  config: import('@/core/media/types').TranscodeConfig;
}): Promise<void> {
  const { fileId, buffer, opfsFileName, mimeType, config } = payload;

  let sourceBuffer: ArrayBufferLike;
  if (opfsFileName) {
    emitProgress(fileId, 2, 'Recuperando Materia desde OPFS');
    const root = await navigator.storage.getDirectory();
    const handle = await root.getFileHandle(opfsFileName);
    const file = await handle.getFile();
    sourceBuffer = await file.arrayBuffer();
  } else if (buffer) {
    sourceBuffer = buffer;
  } else {
    throw new Error('TRANSCODE_ERROR: No source material provided.');
  }

  if (mimeType.startsWith('image/')) {
    await transcodeImage(fileId, sourceBuffer, mimeType, config);
  } else if (mimeType.startsWith('video/')) {
    await transcodeVideo(fileId, sourceBuffer, mimeType, config);
  } else {
    emitError(fileId, {
      code: 'WEBCODECS_UNSUPPORTED',
      message: `MIME type "${mimeType}" is not supported.`,
      recoveryHint: 'Provide image or video.',
    });
  }
}

async function transcodeImage(
  fileId: string,
  buffer: ArrayBufferLike,
  mimeType: string,
  config: import('@/core/media/types').TranscodeConfig
): Promise<void> {
  if (typeof OffscreenCanvas === 'undefined') {
    emitError(fileId, {
      code: 'OFFSCREEN_CANVAS_UNSUPPORTED',
      message: 'OffscreenCanvas unavailable.',
      recoveryHint: 'Use a modern browser.',
    });
    return;
  }

  emitProgress(fileId, 10, 'Decoding image');

  let bitmap: ImageBitmap;
  try {
    const blob = new Blob([buffer as any], { type: mimeType });
    bitmap = await createImageBitmap(blob);
  } catch (err) {
    emitError(fileId, {
      code: 'METADATA_EXTRACTION_FAILED',
      message: `createImageBitmap failed: ${String(err)}`,
      recoveryHint: 'Verify file integrity.',
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
      message: 'Context unavailable.',
      recoveryHint: 'Retry.',
    });
    return;
  }

  canvasCtx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  emitProgress(fileId, 60, 'Encoding output');

  let outputBlob: Blob;
  try {
    outputBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
  } catch (err) {
    emitError(fileId, {
      code: 'WEBCODECS_UNSUPPORTED',
      message: `convertToBlob failed: ${String(err)}`,
      recoveryHint: 'Try another format.',
    });
    return;
  }

  const outBuffer = await outputBlob.arrayBuffer();
  finishTranscode(fileId, outBuffer);
}

async function transcodeVideo(
  fileId: string,
  buffer: ArrayBufferLike,
  mimeType: string,
  config: import('@/core/media/types').TranscodeConfig
): Promise<void> {
  const isHardwareSupported = await HardwareTranscoder.checkSupport();
  const isMassiveFile = buffer.byteLength > 2 * 1024 * 1024 * 1024;

  if (isHardwareSupported) {
    emitProgress(fileId, 5, 'Iniciando Pipeline de Hardware (GPU)');
    try {
      const transcoder = new HardwareTranscoder();
      const blob = new Blob([buffer as any], { type: mimeType });
      const result = await transcoder.transcode(blob as any, config, (pct) => {
        emitProgress(fileId, pct, 'Transcodificando vía GPU');
      });
      if (result.byteLength > 0) {
        finishTranscode(fileId, result);
        return;
      }
    } catch (err) {
      console.warn('[SME] Hardware Path fail, fallback to software.', err);
    }
  }

  if (isMassiveFile) {
    console.warn('[SME] Entropy Warning: Massive file on software path.');
  }

  emitProgress(fileId, 10, 'Iniciando Motor Universal (Software Fallback)');
  
  try {
    const ffmpeg = await loadFFmpeg();
    const inputName = `input_${fileId}`;
    const outputName = `output_${fileId}.mp4`;

    await ffmpeg.writeFile(inputName, new Uint8Array(buffer));

    emitProgress(fileId, 25, 'Transcodificando Materia (Software HEVC)');

    await ffmpeg.exec([
      '-i', inputName,
      '-c:v', 'libx265',
      '-crf', '18',
      '-preset', 'ultrafast',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '192k',
      outputName
    ]);

    const data = await ffmpeg.readFile(outputName);
    const outBuffer = (data as Uint8Array).buffer;

    await ffmpeg.deleteFile(inputName);
    await ffmpeg.deleteFile(outputName);

    finishTranscode(fileId, outBuffer);
  } catch (err) {
    emitError(fileId, {
      code: 'WEBCODECS_UNSUPPORTED',
      message: `Critical failure: ${String(err)}`,
      recoveryHint: 'Device insufficient.',
    });
  }
}

function finishTranscode(fileId: string, buffer: ArrayBufferLike) {
  emitProgress(fileId, 100, 'Transcodificación Completada');
  const event: WorkerEvent = {
    type: 'TRANSCODE_COMPLETE',
    payload: { fileId, buffer },
  };
  
  if (buffer instanceof ArrayBuffer) {
    ctx.postMessage(event, [buffer]);
  } else {
    ctx.postMessage(event);
  }
}

async function handleBuildFrameIndex(payload: {
  fileId: string;
  buffer: ArrayBufferLike;
}): Promise<void> {
  emitProgress(payload.fileId, 100, 'Frame index unavailable.');
  const event: WorkerEvent = {
    type: 'FRAME_INDEX_READY',
    payload: { fileId: payload.fileId, frames: [] },
  };
  ctx.postMessage(event);
}

function emitProgress(fileId: string, percent: number, stage: string): void {
  const event: WorkerEvent = { type: 'PROGRESS', payload: { fileId, percent, stage } };
  ctx.postMessage(event);
}

function emitError(fileId: string, error: MediaError): void {
  const event: WorkerEvent = { type: 'ERROR', payload: { fileId, error } };
  ctx.postMessage(event);
}

export {};
