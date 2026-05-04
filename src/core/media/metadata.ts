/**
 * METADATA ENGINE — SURGICAL BINARY OPERATIONS
 * Extracts and injects EXIF (JPEG APP1) and MP4 atoms (moov/mvhd).
 * All operations work on ArrayBuffers to avoid string-layer corruption.
 *
 * MP4 epoch offset: Jan 1 1904 → Jan 1 1970 = 2,082,844,800 seconds
 */

import type { ExifData, MediaMetadata, MediaOperationResult } from './types';

const MP4_EPOCH_OFFSET = 2_082_844_800; // seconds

// ─── Public API ───────────────────────────────────────────────────────────────

export class MetadataEngine {
  /**
   * Extracts all available metadata from a file buffer.
   * Detects mobile sandbox (iOS/Android sanitised files).
   */
  extract(
    buffer: ArrayBuffer,
    mimeType: string,
    userAgent: string
  ): MediaOperationResult<MediaMetadata> {
    const start = Date.now();
    try {
      const platform = detectPlatform(userAgent);
      let meta: MediaMetadata = {
        mimeType,
        origin: { isMobileSandbox: platform !== 'desktop', platform, sanitized: false },
      };

      if (mimeType.startsWith('image/')) {
        meta = extractImageMetadata(buffer, meta);
      } else if (mimeType.startsWith('video/')) {
        meta = extractVideoMetadata(buffer, meta);
      }

      if (meta.origin && platform !== 'desktop' && !meta.exif) {
        meta.origin.sanitized = true;
      }

      return { ok: true, data: meta, durationMs: Date.now() - start };
    } catch (err) {
      return {
        ok: false,
        error: {
          code: 'METADATA_EXTRACTION_FAILED',
          message: `Metadata extraction failed: ${String(err)}`,
          recoveryHint: 'File may have a non-standard structure. Metadata will be absent.',
          stack: err instanceof Error ? err.stack : undefined,
        },
        durationMs: Date.now() - start,
      };
    }
  }

  /**
   * Transplants the original APP1 (EXIF) segment from originalBuffer
   * into a transcoded JPEG buffer. Returns a new ArrayBuffer.
   */
  injectJpegExif(
    transcodedBuffer: ArrayBuffer,
    originalBuffer: ArrayBuffer
  ): MediaOperationResult<ArrayBuffer> {
    const start = Date.now();
    try {
      const app1 = extractApp1Segment(originalBuffer);
      if (!app1) {
        return { ok: true, data: transcodedBuffer, durationMs: Date.now() - start };
      }
      const result = insertApp1IntoJpeg(transcodedBuffer, app1);
      return { ok: true, data: result, durationMs: Date.now() - start };
    } catch (err) {
      return {
        ok: false,
        error: {
          code: 'METADATA_INJECTION_FAILED',
          message: `JPEG EXIF injection failed: ${String(err)}`,
          recoveryHint: 'Transcoded file will lack original EXIF. Manual metadata restore required.',
          stack: err instanceof Error ? err.stack : undefined,
        },
        durationMs: Date.now() - start,
      };
    }
  }

  /**
   * Reads the creation_time from the original MP4's mvhd atom and writes it
   * into the transcoded MP4 buffer. Corrects the iOS UTC-offset bug.
   */
  injectMp4CreationTime(
    transcodedBuffer: ArrayBuffer,
    originalBuffer: ArrayBuffer
  ): MediaOperationResult<ArrayBuffer> {
    const start = Date.now();
    try {
      const creationTimeMp4 = readMvhdCreationTime(originalBuffer);
      if (creationTimeMp4 === null) {
        return { ok: true, data: transcodedBuffer, durationMs: Date.now() - start };
      }
      const result = writeMvhdCreationTime(transcodedBuffer, creationTimeMp4);
      return { ok: true, data: result, durationMs: Date.now() - start };
    } catch (err) {
      return {
        ok: false,
        error: {
          code: 'METADATA_INJECTION_FAILED',
          message: `MP4 creation_time injection failed: ${String(err)}`,
          recoveryHint: 'Transcoded video may show wrong creation date in Premiere/Lightroom.',
          stack: err instanceof Error ? err.stack : undefined,
        },
        durationMs: Date.now() - start,
      };
    }
  }
}

// ─── Image metadata extraction ───────────────────────────────────────────────

function extractImageMetadata(buffer: ArrayBuffer, meta: MediaMetadata): MediaMetadata {
  const view = new DataView(buffer);

  // JPEG: FF D8
  if (view.byteLength >= 2 && view.getUint8(0) === 0xFF && view.getUint8(1) === 0xD8) {
    const exif = parseJpegExif(buffer);
    if (exif) {
      meta = { ...meta, exif };
      meta.width = undefined; // Dimension extraction requires a more complex parser
      meta.height = undefined;
    }
  }

  return meta;
}

function extractVideoMetadata(buffer: ArrayBuffer, meta: MediaMetadata): MediaMetadata {
  const mv = findMp4Box(buffer, 0, 'moov');
  if (!mv) return meta;

  const mvhdOffset = findMp4Box(buffer, mv.dataOffset, 'mvhd');
  if (!mvhdOffset) return meta;

  const view = new DataView(buffer);
  const version = view.getUint8(mvhdOffset.dataOffset);
  let creationTimeMp4: number;
  let timescale: number;
  let durationRaw: number;

  if (version === 0) {
    creationTimeMp4 = view.getUint32(mvhdOffset.dataOffset + 4, false);
    timescale = view.getUint32(mvhdOffset.dataOffset + 12, false);
    durationRaw = view.getUint32(mvhdOffset.dataOffset + 16, false);
  } else {
    // version 1: 64-bit timestamps — read as two 32-bit halves (high, low)
    const hi = view.getUint32(mvhdOffset.dataOffset + 4, false);
    const lo = view.getUint32(mvhdOffset.dataOffset + 8, false);
    creationTimeMp4 = hi * 0x100000000 + lo;
    timescale = view.getUint32(mvhdOffset.dataOffset + 20, false);
    const durHi = view.getUint32(mvhdOffset.dataOffset + 24, false);
    const durLo = view.getUint32(mvhdOffset.dataOffset + 28, false);
    durationRaw = durHi * 0x100000000 + durLo;
  }

  const creationUnix = creationTimeMp4 - MP4_EPOCH_OFFSET;
  const durationMs = timescale > 0 ? Math.round((durationRaw / timescale) * 1000) : undefined;

  return {
    ...meta,
    durationMs,
    video: {
      ...meta.video,
      creationTimeUtc: new Date(creationUnix * 1000).toISOString(),
    },
  };
}

// ─── JPEG APP1 / EXIF ────────────────────────────────────────────────────────

function extractApp1Segment(buffer: ArrayBuffer): Uint8Array | null {
  const view = new DataView(buffer);
  let offset = 2; // skip SOI (FF D8)

  while (offset < buffer.byteLength - 3) {
    if (view.getUint8(offset) !== 0xFF) break;
    const marker = view.getUint8(offset + 1);
    if (marker === 0xD9 || marker === 0xDA) break; // EOI or SOS

    const segLen = view.getUint16(offset + 2, false); // big-endian, includes length bytes

    if (marker === 0xE1) {
      // Check for Exif\0\0 header
      if (buffer.byteLength >= offset + 2 + segLen &&
          String.fromCharCode(...new Uint8Array(buffer, offset + 4, 6)) === 'Exif\0\0') {
        return new Uint8Array(buffer, offset, 2 + segLen);
      }
    }

    offset += 2 + segLen;
  }
  return null;
}

function insertApp1IntoJpeg(
  jpegBuffer: ArrayBuffer,
  app1Bytes: Uint8Array
): ArrayBuffer {
  const view = new DataView(jpegBuffer);
  let insertPos = 2; // default: right after SOI

  // Skip APP0 (FF E0) if present — JFIF header must come before EXIF
  if (view.byteLength > 4 &&
      view.getUint8(2) === 0xFF && view.getUint8(3) === 0xE0) {
    insertPos = 2 + 2 + view.getUint16(4, false);
  }

  const before = new Uint8Array(jpegBuffer, 0, insertPos);
  const after = new Uint8Array(jpegBuffer, insertPos);
  const combined = new Uint8Array(before.length + app1Bytes.length + after.length);
  combined.set(before, 0);
  combined.set(app1Bytes, before.length);
  combined.set(after, before.length + app1Bytes.length);
  return combined.buffer as ArrayBuffer;
}

function parseJpegExif(buffer: ArrayBuffer): ExifData | null {
  const app1 = extractApp1Segment(buffer);
  if (!app1) return null;

  // APP1 layout: FF E1 [len2] "Exif\0\0" [TIFF data]
  const tiffStart = 10; // 2 (marker) + 2 (len) + 6 (Exif\0\0)
  if (app1.length <= tiffStart) return null;

  const tiff = app1.buffer.slice(app1.byteOffset + tiffStart, app1.byteOffset + app1.length) as ArrayBuffer;
  return parseTiffIfd(tiff);
}

function parseTiffIfd(tiff: ArrayBuffer): ExifData | null {
  const view = new DataView(tiff);
  if (view.byteLength < 8) return null;

  const orderMark = view.getUint16(0, false);
  const littleEndian = orderMark === 0x4949; // "II"
  if (orderMark !== 0x4949 && orderMark !== 0x4D4D) return null; // not TIFF
  if (view.getUint16(2, littleEndian) !== 42) return null;

  const ifd0Offset = view.getUint32(4, littleEndian);
  const exif: ExifData = {};
  readIfd(view, tiff, ifd0Offset, littleEndian, exif);
  return exif;
}

function readIfd(
  view: DataView,
  tiff: ArrayBuffer,
  ifdOffset: number,
  le: boolean,
  exif: ExifData
): void {
  if (ifdOffset + 2 > view.byteLength) return;
  const count = view.getUint16(ifdOffset, le);

  for (let i = 0; i < count; i++) {
    const entryBase = ifdOffset + 2 + i * 12;
    if (entryBase + 12 > view.byteLength) break;

    const tag = view.getUint16(entryBase, le);
    const type = view.getUint16(entryBase + 2, le);
    const cnt = view.getUint32(entryBase + 4, le);
    const valOrOffset = entryBase + 8;

    switch (tag) {
      case 0x010F: exif.make = readAscii(view, tiff, type, cnt, valOrOffset, le); break;
      case 0x0110: exif.model = readAscii(view, tiff, type, cnt, valOrOffset, le); break;
      case 0x0112: exif.orientation = view.getUint16(valOrOffset, le); break;
      case 0x9003: {
        const raw = readAscii(view, tiff, type, cnt, valOrOffset, le);
        if (raw) exif.capturedAt = parseTiffDateTime(raw, exif.capturedAt);
        break;
      }
      case 0x9011: {
        // OffsetTimeOriginal: "+05:30" or "-07:00"
        const tz = readAscii(view, tiff, type, cnt, valOrOffset, le);
        if (tz && exif.capturedAt) exif.capturedAt = applyTimezone(exif.capturedAt, tz);
        break;
      }
      case 0x8825: {
        // GPS IFD pointer
        const gpsOffset = view.getUint32(valOrOffset, le);
        exif.gps = readGpsIfd(view, tiff, gpsOffset, le);
        break;
      }
    }
  }
}

function readAscii(
  view: DataView,
  _tiff: ArrayBuffer,
  _type: number,
  count: number,
  valOrOffset: number,
  le: boolean
): string {
  let offset = valOrOffset;
  if (count > 4) {
    offset = view.getUint32(valOrOffset, le);
  }
  if (offset + count > view.byteLength) return '';
  const bytes: number[] = [];
  for (let i = 0; i < count - 1; i++) bytes.push(view.getUint8(offset + i));
  return bytes.map(b => String.fromCharCode(b)).join('').trim();
}

function readGpsIfd(
  view: DataView,
  _tiff: ArrayBuffer,
  gpsOffset: number,
  le: boolean
): { lat: number; lon: number; alt?: number } | undefined {
  if (gpsOffset + 2 > view.byteLength) return undefined;
  const count = view.getUint16(gpsOffset, le);

  let latRef = 'N', lonRef = 'E';
  let lat: number | undefined, lon: number | undefined, alt: number | undefined;

  for (let i = 0; i < count; i++) {
    const base = gpsOffset + 2 + i * 12;
    if (base + 12 > view.byteLength) break;
    const tag = view.getUint16(base, le);
    const valOrOff = base + 8;

    switch (tag) {
      case 0x0001: latRef = String.fromCharCode(view.getUint8(valOrOff)); break;
      case 0x0003: lonRef = String.fromCharCode(view.getUint8(valOrOff)); break;
      case 0x0002: lat = readRationalDMS(view, valOrOff, le); break;
      case 0x0004: lon = readRationalDMS(view, valOrOff, le); break;
      case 0x0006: {
        const off = view.getUint32(valOrOff, le);
        if (off + 8 <= view.byteLength) {
          const num = view.getUint32(off, le);
          const den = view.getUint32(off + 4, le);
          alt = den !== 0 ? num / den : 0;
        }
        break;
      }
    }
  }

  if (lat === undefined || lon === undefined) return undefined;
  return {
    lat: latRef === 'S' ? -lat : lat,
    lon: lonRef === 'W' ? -lon : lon,
    alt,
  };
}

function readRationalDMS(view: DataView, valOrOff: number, le: boolean): number {
  const offset = view.getUint32(valOrOff, le);
  if (offset + 24 > view.byteLength) return 0;

  const degN = view.getUint32(offset, le);
  const degD = view.getUint32(offset + 4, le);
  const minN = view.getUint32(offset + 8, le);
  const minD = view.getUint32(offset + 12, le);
  const secN = view.getUint32(offset + 16, le);
  const secD = view.getUint32(offset + 20, le);

  const deg = degD !== 0 ? degN / degD : 0;
  const min = minD !== 0 ? minN / minD : 0;
  const sec = secD !== 0 ? secN / secD : 0;
  return deg + min / 60 + sec / 3600;
}

// ─── MP4 box parser ───────────────────────────────────────────────────────────

interface BoxLocation { offset: number; size: number; dataOffset: number }

function findMp4Box(
  buffer: ArrayBuffer,
  searchFrom: number,
  type: string
): BoxLocation | null {
  const view = new DataView(buffer);
  const typeBytes = type.split('').map(c => c.charCodeAt(0));
  let offset = searchFrom;

  while (offset + 8 <= buffer.byteLength) {
    let size = view.getUint32(offset, false);
    let dataOffset = offset + 8;

    if (size === 1) {
      // Extended 64-bit size
      const hi = view.getUint32(offset + 8, false);
      const lo = view.getUint32(offset + 12, false);
      size = hi * 0x100000000 + lo;
      dataOffset = offset + 16;
    } else if (size === 0) {
      size = buffer.byteLength - offset;
    }

    const typeMatch = typeBytes.every((b, i) => view.getUint8(offset + 4 + i) === b);

    if (typeMatch) {
      return { offset, size, dataOffset };
    }

    if (size < 8) break;
    offset += size;
  }
  return null;
}

function readMvhdCreationTime(buffer: ArrayBuffer): number | null {
  const moov = findMp4Box(buffer, 0, 'moov');
  if (!moov) return null;

  const mvhd = findMp4Box(buffer, moov.dataOffset, 'mvhd');
  if (!mvhd) return null;

  const view = new DataView(buffer);
  const version = view.getUint8(mvhd.dataOffset);

  if (version === 0) {
    return view.getUint32(mvhd.dataOffset + 4, false);
  } else {
    const hi = view.getUint32(mvhd.dataOffset + 4, false);
    const lo = view.getUint32(mvhd.dataOffset + 8, false);
    return hi * 0x100000000 + lo;
  }
}

function writeMvhdCreationTime(buffer: ArrayBuffer, mp4Time: number): ArrayBuffer {
  const moov = findMp4Box(buffer, 0, 'moov');
  if (!moov) return buffer;

  const mvhd = findMp4Box(buffer, moov.dataOffset, 'mvhd');
  if (!mvhd) return buffer;

  const copy = buffer.slice(0);
  const view = new DataView(copy);
  const version = view.getUint8(mvhd.dataOffset);

  if (version === 0) {
    view.setUint32(mvhd.dataOffset + 4, mp4Time >>> 0, false);
  } else {
    const hi = Math.floor(mp4Time / 0x100000000);
    const lo = mp4Time >>> 0;
    view.setUint32(mvhd.dataOffset + 4, hi, false);
    view.setUint32(mvhd.dataOffset + 8, lo, false);
  }

  return copy;
}

// ─── Utility helpers ──────────────────────────────────────────────────────────

function detectPlatform(ua: string): 'ios' | 'android' | 'desktop' {
  const lower = ua.toLowerCase();
  if (/iphone|ipad|ipod/.test(lower)) return 'ios';
  if (/android/.test(lower)) return 'android';
  return 'desktop';
}

function parseTiffDateTime(tiffDate: string, existing?: string): string {
  // TIFF format: "YYYY:MM:DD HH:MM:SS"
  const m = tiffDate.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return existing ?? tiffDate;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
}

function applyTimezone(isoWithoutTz: string, tz: string): string {
  // tz: "+05:30" or "-07:00"
  if (!/^[+-]\d{2}:\d{2}$/.test(tz)) return isoWithoutTz;
  return isoWithoutTz.includes('+') || isoWithoutTz.includes('-', 10)
    ? isoWithoutTz
    : isoWithoutTz + tz;
}
