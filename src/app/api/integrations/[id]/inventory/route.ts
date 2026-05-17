import { NextResponse } from 'next/server';
import { auth } from "@/auth";
import { db } from '@/lib/db';
import { integrations } from '@/core/db/schema';
import { eq } from 'drizzle-orm';

const NANGO_API_BASE = 'https://api.nango.dev';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const nangoSecret = process.env.NANGO_SECRET_KEY;
  if (!nangoSecret) {
    return NextResponse.json({ error: 'Nango secret missing' }, { status: 500 });
  }

  try {
    // 1. Get the integration details from local DB
    const [integration] = await db
      .select()
      .from(integrations)
      .where(eq(integrations.id, id));

    if (!integration) {
      return NextResponse.json({ error: 'Integration not found' }, { status: 404 });
    }

    // 2. RESOLVE ADAPTER & FETCH AGNOSTIC INVENTORY
    // -------------------------------------------------------------------------
    // RADICAL AGNOSTICISM: Ensure all adapters are registered
    await import('@/integrations/register-all');
    
    const { registry } = await import('@/core/registry');
    const { AgnosticQuerySchema } = await import('@/core/inventory/types');
    
    // Resolve adapter with the stored connectionId
    const adapter = registry.resolveAdapter(integration.type, integration.connectionId);
    
    // 3. PARSE & VALIDATE AGNOSTIC QUERY
    const { searchParams } = new URL(req.url);
    const resolveId = searchParams.get('resolveId');

    if (resolveId) {
      let path = ['root', resolveId];
      if (typeof (adapter as any).resolvePath === 'function') {
        const pathResult = await (adapter as any).resolvePath(resolveId);
        if (pathResult.ok) {
          path = pathResult.data;
        }
      }
      return NextResponse.json({ path });
    }

    const queryParams = Object.fromEntries(searchParams.entries());
    
    // Convert string numeric values to numbers for Zod
    if (queryParams.limit) queryParams.limit = parseInt(queryParams.limit as string) as any;
    if (queryParams.depth) queryParams.depth = parseInt(queryParams.depth as string) as any;

    const validatedQuery = AgnosticQuerySchema.parse(queryParams);
    
    const startTime = Date.now();
    const result = await adapter.listInventory(validatedQuery);
    const latencyMs = Date.now() - startTime;
    
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ 
      objects: result.data,
      provider: integration.type,
      diagnostics: {
        latencyMs,
        totalCount: result.data.length
      }
    });
  } catch (error) {
    console.error('[Inventory API Error]:', error);
    return NextResponse.json({ error: 'Failed to fetch silo inventory' }, { status: 500 });
  }
}
