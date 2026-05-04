import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { integrations } from '@/core/db/schema';
import { eq } from 'drizzle-orm';

export async function GET() {
  try {
    const list = await db.select().from(integrations);
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
