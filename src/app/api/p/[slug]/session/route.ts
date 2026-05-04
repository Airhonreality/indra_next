/**
 * RESUMABLE SESSION ENDPOINT
 * Initializes a direct-to-silo upload session via the IntegrationAdapter.
 * AXIOMA: El servidor de Indra actúa como mediador de confianza, 
 * negociando con el Silo y entregando un "pase de subida" al cliente.
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ingestionPorts, integrations } from '@/core/db/schema';
import { eq } from 'drizzle-orm';
import { GoogleDriveAdapter } from '@/integrations/google-drive/adapter';
import { checkRateLimit } from '@/lib/rate-limit';

export const maxDuration = 60;
export const runtime = 'nodejs';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const ip = req.headers.get('x-forwarded-for') || 'unknown';
  if (!checkRateLimit(ip, 20, 60000)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const { slug } = await params;
  
  try {
    const body = await req.json();
    const { fileName, mimeType, fileSize, formValues } = body;

    if (!fileName || !fileSize) {
      return NextResponse.json({ error: 'Missing file metadata' }, { status: 400 });
    }

    // 1. Buscar el puerto y su integración vinculada
    const [port] = await db
      .select()
      .from(ingestionPorts)
      .where(eq(ingestionPorts.slug, slug))
      .limit(1);

    if (!port) {
      return NextResponse.json({ error: 'Port not found' }, { status: 404 });
    }

    // 1b. Obtener la conexión real de Nango
    const [integration] = await db
      .select()
      .from(integrations)
      .where(eq(integrations.id, port.integrationId))
      .limit(1);

    if (!integration || !integration.connectionId) {
      return NextResponse.json({ error: 'Integration connection not found' }, { status: 500 });
    }

    // 2. Instanciar el adaptador con el connectionId real
    const adapter = new GoogleDriveAdapter(integration.connectionId);

    // 3. Resolver ruta paramétrica (Agnosticismo de Ruta)
    // Usamos el utilitario de sanitización del Paso 3
    const { resolveParametricPath } = await import('@/lib/path-utils');
    const fullPath = resolveParametricPath(
      port.config?.pattern,
      port.targetPath,
      formValues || {},
      fileName
    );

    // Extraer la ruta de la carpeta (todo menos el nombre del archivo)
    const relativeFolder = fullPath.replace(port.targetPath, '').split('/').slice(0, -1).join('/');
    
    // 4. Asegurar que la estructura de carpetas existe en el Silo
    let finalFolderId = port.targetPath;
    if (relativeFolder && adapter.getOrCreateFolderByPath) {
      finalFolderId = await adapter.getOrCreateFolderByPath(relativeFolder, port.targetPath);
    }

    if (!adapter.createResumableSession) {
      return NextResponse.json({ error: 'Adapter does not support resumable sessions' }, { status: 501 });
    }

    // 5. Negociar la sesión con el Silo en la carpeta final
    const sessionResult = await adapter.createResumableSession(
      finalFolderId, 
      fileName,
      mimeType || 'application/octet-stream',
      fileSize
    );

    if (!sessionResult.ok) {
      return NextResponse.json({ error: sessionResult.error }, { status: 502 });
    }

    return NextResponse.json({
      ok: true,
      resumableUri: sessionResult.data.resumableUri,
      sessionId: sessionResult.data.sessionId,
    });

  } catch (err) {
    console.error(`[IPW] Session creation error (${slug}):`, err);
    return NextResponse.json({ error: 'Failed to initialize session' }, { status: 500 });
  }
}
