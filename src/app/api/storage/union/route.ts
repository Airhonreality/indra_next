import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { StorageUnion } from '@/integrations/storage-union';
import { getActiveUpstreams, decryptMegaCredentials } from '@/integrations/storage-union/helpers';
import { AgnosticQuerySchema } from '@/core/inventory/types';

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 1. Decrypt MEGA credentials from the secure header if provided
  const encryptedCreds = req.headers.get('x-mega-credentials');
  let megaCredentials: any = undefined;
  if (encryptedCreds) {
    try {
      megaCredentials = decryptMegaCredentials(encryptedCreds, session.user.id);
    } catch (err) {
      return NextResponse.json({ error: 'Invalid or undecryptable MEGA credentials' }, { status: 400 });
    }
  }

  try {
    // 2. Fetch and instantiate all active upstreams
    const upstreams = await getActiveUpstreams(session.user.id, megaCredentials);

    // Parse query parameters
    const { searchParams } = new URL(req.url);
    const provider = searchParams.get('provider');
    const parentId = searchParams.get('parentId') || 'root';

    // 3. Filter upstreams if a specific provider is requested
    let activeUpstreams = upstreams;
    if (provider) {
      activeUpstreams = upstreams.filter((u) => u.id === provider);
    }

    if (activeUpstreams.length === 0) {
      return NextResponse.json({
        objects: [],
        provider: provider || 'union',
        diagnostics: { latencyMs: 0, totalCount: 0 },
        error: provider ? `Provider "${provider}" is not connected or active.` : undefined
      });
    }

    const union = new StorageUnion(activeUpstreams);

    // 4. Validate query parameters
    const queryParams: Record<string, any> = {
      parentId,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined,
      cursor: searchParams.get('cursor') || undefined,
      search: searchParams.get('search') || undefined,
      type: searchParams.get('type') || 'all',
      depth: searchParams.get('depth') ? parseInt(searchParams.get('depth')!) : undefined
    };

    const validatedQuery = AgnosticQuerySchema.parse(queryParams);

    const startTime = Date.now();
    const result = await union.listInventory(validatedQuery);
    const latencyMs = Date.now() - startTime;

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({
      objects: result.data,
      provider: provider || 'union',
      diagnostics: {
        latencyMs,
        totalCount: result.data.length
      },
      meta: result.meta
    });
  } catch (error: any) {
    console.error('[Union Inventory API Error]:', error);
    return NextResponse.json({ error: 'Failed to fetch union inventory' }, { status: 500 });
  }
}
