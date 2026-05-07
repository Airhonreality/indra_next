import { NextResponse } from 'next/server';
import { auth } from "@/auth";
import { db } from '@/lib/db';
import { integrations } from '@/core/db/schema';
import { eq } from 'drizzle-orm';

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { action } = await req.json();

    // 1. Get the integration details
    const [integration] = await db
      .select()
      .from(integrations)
      .where(eq(integrations.id, params.id));

    if (!integration) {
      return NextResponse.json({ error: 'Integration not found' }, { status: 404 });
    }

    // 2. Execute action based on type
    let result = { message: `Action ${action} executed successfully.` };

    // Simulate different behaviors for the demo/mvp
    switch (action) {
      case 'health_check':
        result.message = `[HEALTH_CHECK] Node ${integration.type} is online. Latency: 120ms.`;
        break;
      case 'force_sync':
        result.message = `[SYNC] Metadata synchronization triggered for ${integration.label}.`;
        break;
      case 'purge_cache':
        result.message = `[CACHE] Purged temporary indices for ${integration.id}.`;
        break;
      default:
        break;
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('[Execution API Error]:', error);
    return NextResponse.json({ error: 'Action execution failed' }, { status: 500 });
  }
}
