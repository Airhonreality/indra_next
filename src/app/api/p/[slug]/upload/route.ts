/**
 * CHUNK UPLOAD ENDPOINT
 * Receives raw binary chunks from the browser's SovereignPipeline.
 * Writes each chunk to the server's tmp dir for assembly on finalize.
 *
 * Headers:
 *   x-session-id   — pipeline session UUID
 *   x-chunk-index  — chunk index (0-based)
 *   x-chunk-hash   — expected SHA-256 hex of the chunk
 *
 * Production note: replace fs writes with signed S3/Drive multipart URLs.
 */

import { NextResponse } from 'next/server';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { db } from '@/lib/db';
import { ingestionPorts } from '@/core/db/schema';
import { eq } from 'drizzle-orm';

export const maxDuration = 300; // 5 minutes for large chunk verification
export const runtime = 'nodejs';  // Node.js required for crypto/fs

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const sessionId = req.headers.get('x-session-id');
  const chunkIndexStr = req.headers.get('x-chunk-index');
  const expectedHash = req.headers.get('x-chunk-hash');

  if (!sessionId || chunkIndexStr === null || !expectedHash) {
    return NextResponse.json({ error: 'Missing required headers' }, { status: 400 });
  }

  const chunkIndex = parseInt(chunkIndexStr, 10);

  try {
    // Validate port exists
    const [port] = await db
      .select({ id: ingestionPorts.id })
      .from(ingestionPorts)
      .where(eq(ingestionPorts.slug, slug))
      .limit(1);

    if (!port) {
      return NextResponse.json({ error: 'Port not found' }, { status: 404 });
    }

    // Read binary body
    const buffer = await req.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    // Verify integrity server-side (Sovereign Guard)
    const actualHash = createHash('sha256').update(bytes).digest('hex');
    if (actualHash !== expectedHash) {
      return NextResponse.json({ error: 'Hash mismatch', expected: expectedHash, actual: actualHash }, { status: 422 });
    }

    // ─── PROXY TO SILO (Stream-Through) ──────────────────────────────────────
    const resumableUri = req.headers.get('x-resumable-uri');
    const byteStart = req.headers.get('x-byte-range-start');
    const totalSize = req.headers.get('x-file-size');

    if (!resumableUri || !byteStart || !totalSize) {
      return NextResponse.json({ error: 'Missing resumable headers' }, { status: 400 });
    }

    const byteEnd = parseInt(byteStart, 10) + bytes.length - 1;

    // Forward chunk to Drive Resumable URI
    // Ref: https://developers.google.com/drive/api/v3/manage-uploads#resumable
    const driveRes = await fetch(resumableUri, {
      method: 'PUT',
      headers: {
        'Content-Length': String(bytes.length),
        'Content-Range': `bytes ${byteStart}-${byteEnd}/${totalSize}`,
      },
      body: bytes,
    });

    if (!driveRes.ok && driveRes.status !== 308) {
      const driveError = await driveRes.text();
      console.error('[IPW] Drive Proxy Error:', driveError);
      return NextResponse.json({ error: 'Silo rejected chunk', detail: driveError }, { status: 502 });
    }

    return NextResponse.json({ 
      ok: true, 
      chunkIndex, 
      size: bytes.length,
      siloStatus: driveRes.status 
    });
  } catch (err) {
    console.error(`[IPW] chunk upload error (${slug}, chunk ${chunkIndex}):`, err);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
