import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { integrations } from '@/core/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const connectionId = searchParams.get('connectionId');

    let query = db.select().from(integrations);
    
    if (connectionId) {
      // @ts-ignore - drizzle type check
      query = db.select().from(integrations).where(eq(integrations.connectionId, connectionId));
    }

    const list = await query;
    return NextResponse.json({ integrations: list });
  } catch (error) {
    console.error('Fetch Integrations Error:', error);
    return NextResponse.json({ error: 'Failed to fetch integrations' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { type, label, connectionId, config } = await req.json();

    const result = await db.insert(integrations).values({
      type,
      label,
      connectionId,
      config: config || {},
      isActive: true,
    }).returning();

    return NextResponse.json({ success: true, integration: result[0] });
  } catch (error) {
    console.error('Create Integration Error:', error);
    return NextResponse.json({ error: 'Failed to create integration' }, { status: 500 });
  }
}
