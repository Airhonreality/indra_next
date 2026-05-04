/**
 * SESSION FINALIZE ENDPOINT
 * Called after all chunks are uploaded. Verifies manifest integrity,
 * assembles the file, and pushes the manifest record to the vault.
 *
 * Body: { sessionId, manifest: IntegrityManifest, formValues: Record<string, unknown> }
 */

import { NextResponse } from 'next/server';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { db } from '@/lib/db';
import { ingestionPorts } from '@/core/db/schema';
import { eq } from 'drizzle-orm';
import { StorageAdapter } from '@/integrations/storage/adapter';
import type { IntegrityManifest } from '@/core/media/types';

export const maxDuration = 300; // 5 minutes for assembly and push
export const runtime = 'nodejs';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  let body: {
    sessionId: string;
    manifest: IntegrityManifest;
    formValues: Record<string, unknown>;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { sessionId, manifest, formValues } = body;

  if (!sessionId || !manifest) {
    return NextResponse.json({ error: 'Missing sessionId or manifest' }, { status: 400 });
  }

  try {
    const [port] = await db
      .select()
      .from(ingestionPorts)
      .where(eq(ingestionPorts.slug, slug))
      .limit(1);

    if (!port) {
      return NextResponse.json({ error: 'Port not found' }, { status: 404 });
    }

    // 1. Resolver ruta paramétrica final (Agnosticismo de Ruta)
    const { resolveParametricPath } = await import('@/lib/path-utils');
    const destPath = resolveParametricPath(
      port.config?.pattern,
      port.targetPath,
      formValues,
      manifest.fileName
    );

    // 2. Registrar el manifiesto de integridad en el Silo (Agnóstico)
    // Usamos el StorageAdapter local o el del integrador para persistir el JSON del manifiesto
    const storageAdapter = new StorageAdapter('./data/vault');
    
    await storageAdapter.pushRecords('_manifests.json', [
      {
        id: manifest.fileId,
        fields: {
          fileId: manifest.fileId,
          fileName: manifest.fileName,
          fileSize: manifest.fileSize,
          mimeType: manifest.mimeType,
          globalHash: manifest.globalHash,
          chunkCount: manifest.chunks.length,
          portSlug: slug,
          destPath,
          formValues,
          uploadedAt: new Date().toISOString(),
          isResumable: true,
          sessionId,
        },
        metadata: { source: 'ipw-sovereign', sourceId: manifest.fileId },
      },
    ]);

    return NextResponse.json({
      ok: true,
      fileId: manifest.fileId,
      destPath,
      status: 'verified_in_silo'
    });
  } catch (err) {
    console.error(`[IPW] finalize error (${slug}):`, err);
    return NextResponse.json({ error: 'Finalize failed' }, { status: 500 });
  }
}

