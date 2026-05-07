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

    // 2. Fetch inventory based on provider type
    // For MVP, we use the Nango Proxy for Google Drive / Sheets
    let inventoryData = [];

    const providerKey = integration.type; // Dynamically use the registered type

    if (providerKey === 'google-drive' || providerKey === 'google-sheets') {
      const nangoUrl = `${NANGO_API_BASE}/proxy/drive/v3/files?pageSize=20&q='root' in parents and trashed = false`;
      console.log(`[Inventory Debug] Fetching from Nango (${providerKey}):`, {
        url: nangoUrl,
        connectionId: integration.connectionId, // USE THE STORED ID
        providerConfigKey: providerKey
      });

      const response = await fetch(nangoUrl, {
        headers: {
          'Authorization': `Bearer ${nangoSecret}`,
          'Provider-Config-Key': providerKey,
          'Connection-Id': integration.connectionId // USE THE STORED ID
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Inventory Debug] Nango Proxy Error:', response.status, errorText);
        throw new Error(`Nango Proxy Error: ${response.status}`);
      }

      const data = await response.json();
      console.log('[Inventory Debug] Nango Data Received:', data.files?.length || 0, 'files');
      inventoryData = data.files || [];
    } else if (integration.type === 'google-sheets') {
      // Placeholder for sheets inventory
      inventoryData = [];
    }

    return NextResponse.json({ 
      objects: inventoryData,
      provider: integration.type 
    });
  } catch (error) {
    console.error('[Inventory API Error]:', error);
    return NextResponse.json({ error: 'Failed to fetch silo inventory' }, { status: 500 });
  }
}
