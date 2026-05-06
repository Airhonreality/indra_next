import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ingestionPorts, integrations } from '@/core/db/schema';
import { eq } from 'drizzle-orm';
import { registry } from '@/core/registry';
import type { GoogleDriveAdapter } from '@/integrations/google-drive/adapter';

/**
 * PUBLIC INGESTION API: UPLOAD NEGOTIATION
 * Negotiates a resumable upload session with the target silo adapter.
 * No Auth required - target port must be active.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  try {
    // 1. Resolve Port and its associated Integration
    const [port] = await db
      .select({
        port: ingestionPorts,
        integration: integrations
      })
      .from(ingestionPorts)
      .innerJoin(integrations, eq(ingestionPorts.integrationId, integrations.id))
      .where(eq(ingestionPorts.slug, slug))
      .limit(1);

    if (!port || !port.port.isActive) {
      return NextResponse.json({ error: 'PORT_NOT_FOUND_OR_INACTIVE' }, { status: 404 });
    }

    const { fileName, mimeType, fileSize } = await req.json();

    // 2. Resolve the Adapter and create a session
    // Axiom: The motor doesn't know it's Drive. It just calls the common interface.
    const adapter = registry.resolve(port.integration.type, {
      connectionId: port.integration.connectionId
    }) as GoogleDriveAdapter;

    if (!adapter.createResumableSession) {
      return NextResponse.json({ error: 'ADAPTER_DOES_NOT_SUPPORT_RESUMABLE_UPLOAD' }, { status: 501 });
    }

    const sessionResult = await adapter.createResumableSession(
      port.port.targetPath,
      fileName,
      mimeType,
      fileSize
    );

    if (!sessionResult.ok) {
      return NextResponse.json({ error: sessionResult.error }, { status: 500 });
    }

    // 3. Return the session URI so the client can upload chunks directly to the silo
    return NextResponse.json({ 
      uploadUrl: sessionResult.data.resumableUri,
      sessionId: sessionResult.data.sessionId
    });

  } catch (err) {
    console.error('[Ingestion API Error]:', err);
    return NextResponse.json({ error: 'INTERNAL_INGESTION_ERROR' }, { status: 500 });
  }
}
