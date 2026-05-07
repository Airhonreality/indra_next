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

    if (integration.type === 'google-drive') {
      const response = await fetch(`${NANGO_API_BASE}/proxy/drive/v3/files?pageSize=10`, {
        headers: {
          'Authorization': `Bearer ${nangoSecret}`,
          'Provider-Config-Key': 'google-drive',
          'Connection-Id': session.user.id // In our setup, ConnectionId = UserId
        }
      });
      const data = await response.json();
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
