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

    const { fileName, mimeType, fileSize, variables } = await req.json();

    // 2. ROUTING ENGINE: RESOLVE DYNAMIC DESTINATION PATH
    // -------------------------------------------------------------------------
    // This engine resolves the final destination path within the storage provider
    // by combining the static targetPath with a dynamic pattern.
    // Placeholders like {year}, {month}, {day} are system-provided.
    // Custom placeholders are resolved from the 'variables' object (form data).
    
    let baseDirectory = port.port.targetPath; // Root directory defined at port level
    const routingPattern = (port.port.config as any)?.pattern || '/{year}/{month}';
    
    const timestamp = new Date();
    const runtimeContext: Record<string, string> = {
      year: timestamp.getFullYear().toString(),
      month: (timestamp.getMonth() + 1).toString().padStart(2, '0'),
      day: timestamp.getDate().toString().padStart(2, '0'),
      filename: fileName.split('.')[0],
      ext: fileName.split('.').pop() || '',
    };

    // Merge runtime context with user-submitted form variables
    const resolutionContext = { ...runtimeContext, ...variables };
    
    // Resolve placeholders in the pattern
    let resolvedSubPath = routingPattern;
    Object.entries(resolutionContext).forEach(([variableName, value]) => {
      const placeholder = `\\{${variableName}\\}`;
      resolvedSubPath = resolvedSubPath.replace(new RegExp(placeholder, 'g'), String(value));
    });

    // Construct final normalized absolute path (removing redundant slashes)
    const absoluteDestinationPath = `${baseDirectory}/${resolvedSubPath}`.replace(/\/+/g, '/');

    // 3. ADAPTER RESOLUTION & SESSION NEGOTIATION
    // -------------------------------------------------------------------------
    // RADICAL AGNOSTICISM: Ensure all adapters are registered
    await import('@/integrations/register-all');
    const { registry } = await import('@/core/registry');

    const adapter = registry.resolve(port.integration.type, port.integration.connectionId) as GoogleDriveAdapter;

    if (!adapter.createResumableSession) {
      return NextResponse.json({ error: 'ADAPTER_CAPABILITY_MISSING:RESUMABLE_UPLOAD' }, { status: 501 });
    }

    const sessionResult = await adapter.createResumableSession(
      absoluteDestinationPath,
      fileName,
      mimeType,
      fileSize
    );

    if (!sessionResult.ok) {
      return NextResponse.json({ error: sessionResult.error }, { status: 500 });
    }

    // 4. RETURN NEGOTIATED SESSION METADATA
    return NextResponse.json({ 
      uploadUrl: sessionResult.data.resumableUri,
      sessionId: sessionResult.data.sessionId,
      resolvedPath: absoluteDestinationPath
    });

  } catch (err) {
    console.error('[Ingestion API Error]:', err);
    return NextResponse.json({ error: 'INTERNAL_INGESTION_ERROR' }, { status: 500 });
  }
}
