import { NextResponse } from 'next/server';
import { auth } from "@/auth";
import { db } from '@/lib/db';
import { integrations, storageConnections } from '@/core/db/schema';
import { eq, and } from 'drizzle-orm';
import type { AgnosticInventoryItem, AgnosticQuery } from '@/core/inventory/types';
import type { IntegrationAdapter } from '@/core/types/integration';

type InventoryIntegration = {
  id: string;
  type: string;
  connectionId: string;
  config?: {
    basePath?: string;
    [key: string]: unknown;
  } | null;
  isActive: boolean | null;
  userId: string;
};

type InventoryAdapter = IntegrationAdapter & {
  resolvePath?: (sourceId: string) => Promise<{ ok: boolean; data: string[]; error?: string }>;
};

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  
  // 🔗 Proxy intercept for virtual storage union to prevent 404 database lookups
  if (id === 'storage-union') {
    const { GET: unionGET } = await import('@/app/api/storage/union/route');
    return unionGET(req);
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // 1. Get the integration details from local DB (traditional or dedicated storage)
    let integration: InventoryIntegration | null = null;

    // Check if ID is a provider name shortcut
    const isProviderShortcut = ['google-drive', 'mega', 'onedrive', 'notion', 'storage', 'claro'].includes(id);

    if (isProviderShortcut) {
      if (id === 'mega') {
        const [dedicated] = await db
          .select()
          .from(storageConnections)
          .where(
            and(
              eq(storageConnections.userId, session.user.id),
              eq(storageConnections.provider, 'mega'),
              eq(storageConnections.isActive, true)
            )
          )
          .limit(1);

        if (dedicated) {
          integration = {
            id: dedicated.id,
            type: dedicated.provider,
            connectionId: dedicated.id,
            config: dedicated.config,
            isActive: dedicated.isActive,
            userId: dedicated.userId
          };
        }
      } else if (id === 'claro') {
        const [dedicated] = await db
          .select()
          .from(storageConnections)
          .where(
            and(
              eq(storageConnections.userId, session.user.id),
              eq(storageConnections.provider, 'claro'),
              eq(storageConnections.isActive, true)
            )
          )
          .limit(1);

        if (dedicated) {
          integration = {
            id: dedicated.id,
            type: dedicated.provider,
            connectionId: dedicated.id,
            config: dedicated.config,
            isActive: dedicated.isActive,
            userId: dedicated.userId
          };
        }
      } else {
        const [traditional] = await db
          .select()
          .from(integrations)
          .where(
            and(
              eq(integrations.userId, session.user.id),
              eq(integrations.type, id),
              eq(integrations.isActive, true)
            )
          )
          .limit(1);

        if (traditional) {
          integration = traditional;
        }
      }
    } else {
      // Direct UUID lookup
      const [traditional] = await db
        .select()
        .from(integrations)
        .where(eq(integrations.id, id));

      if (traditional) {
        integration = traditional;
      } else {
        const [dedicated] = await db
          .select()
          .from(storageConnections)
          .where(eq(storageConnections.id, id));

        if (dedicated) {
          integration = {
            id: dedicated.id,
            type: dedicated.provider,
            connectionId: dedicated.id,
            config: dedicated.config,
            isActive: dedicated.isActive,
            userId: dedicated.userId
          };
        }
      }
    }

    if (!integration) {
      return NextResponse.json({ error: 'Integration not found' }, { status: 404 });
    }

    // 2. RESOLVE ADAPTER & FETCH AGNOSTIC INVENTORY
    // -------------------------------------------------------------------------
    // RADICAL AGNOSTICISM: Ensure all adapters are registered
    await import('@/integrations/register-all');
    
    const { registry } = await import('@/core/registry');
    const { AgnosticQuerySchema } = await import('@/core/inventory/types');
    
    // Resolve adapter with the stored connectionId or decrypted credentials
    let adapter: InventoryAdapter | null = null;
    if (integration.type === 'mega' || integration.type === 'claro') {
      const [dedicated] = await db
        .select()
        .from(storageConnections)
        .where(eq(storageConnections.id, integration.id));
        
      if (dedicated && dedicated.encryptedCredentials) {
        const { decryptServerPayload } = await import('@/lib/server-crypto');
        const creds = decryptServerPayload(dedicated.encryptedCredentials, session.user.id);
        adapter = registry.resolveAdapter(integration.type, creds);
      }
    } else if (integration.type === 'storage') {
      adapter = registry.resolveAdapter('storage', {
        basePath: integration.config?.basePath,
      });
    } else {
      const nangoSecret = process.env.NANGO_SECRET_KEY;
      if (!nangoSecret) {
        return NextResponse.json({ error: 'Nango secret missing' }, { status: 500 });
      }
      adapter = registry.resolveAdapter(integration.type, integration.connectionId);
    }

    if (!adapter) {
      return NextResponse.json({ error: 'Failed to resolve storage adapter' }, { status: 500 });
    }
    
    // 3. PARSE & VALIDATE AGNOSTIC QUERY
    const { searchParams } = new URL(req.url);
    const resolveId = searchParams.get('resolveId');

    if (resolveId) {
      let path = ['root', resolveId];
      if (typeof adapter.resolvePath === 'function') {
        const pathResult = await adapter.resolvePath(resolveId);
        if (pathResult.ok) {
          path = pathResult.data;
        }
      }
      return NextResponse.json({ path });
    }

    const queryParams: Record<string, string | number> = Object.fromEntries(searchParams.entries());
    
    // Convert string numeric values to numbers for Zod
    if (queryParams.limit) queryParams.limit = parseInt(queryParams.limit as string);
    if (queryParams.depth) queryParams.depth = parseInt(queryParams.depth as string);

    const validatedQuery = AgnosticQuerySchema.parse(queryParams) as AgnosticQuery;
    
    const startTime = Date.now();
    const result = await adapter.listInventory(validatedQuery);
    const latencyMs = Date.now() - startTime;
    
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    const mappedObjects = (result.data as AgnosticInventoryItem[]).map((item) => {
      // 🛡️ Zero-Entropy Agnosticism: YouTube uses native iframe embed streamUrl and direct thumbnails.
      if (item.provider === 'youtube') {
        return item;
      }

      const originalId = item.id.includes('::') ? item.id.split('::')[1] : item.id;
      const streamUrl = `/api/storage/stream/${item.provider || integration.type}/${originalId}`;
      let thumbnailUrl = item.thumbnailUrl;
      
      if (!thumbnailUrl && item.type === 'file') {
        thumbnailUrl = `/api/storage/stream/${item.provider || integration.type}/${originalId}`;
      }
      
      return {
        ...item,
        streamUrl,
        thumbnailUrl
      };
    });

    return NextResponse.json({ 
      objects: mappedObjects,
      provider: integration.type,
      diagnostics: {
        latencyMs,
        totalCount: mappedObjects.length
      }
    });
  } catch (error) {
    console.error('[Inventory API Error]:', error);
    return NextResponse.json({ error: 'Failed to fetch silo inventory' }, { status: 500 });
  }
}
