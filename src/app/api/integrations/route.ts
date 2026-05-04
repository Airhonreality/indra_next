import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { integrations } from '@/core/db/schema';
import { eq, and } from 'drizzle-orm';
import { auth } from "@/auth";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const list = await db
      .select()
      .from(integrations)
      .where(eq(integrations.userId, session.user.id));
      
    return NextResponse.json({ integrations: list });
  } catch (error) {
    console.error('Fetch Integrations Error:', error);
    return NextResponse.json({ error: 'Failed to fetch integrations' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { type, label, connectionId, config } = await req.json();

    const result = await db.insert(integrations).values({
      userId: session.user.id,
      type,
      label,
      connectionId, // Still need the Nango connection ID (which matches userId for now)
      config: config || {},
      isActive: true,
    }).returning();

    return NextResponse.json({ success: true, integration: result[0] });
  } catch (error) {
    console.error('Create Integration Error:', error);
    return NextResponse.json({ error: 'Failed to create integration' }, { status: 500 });
  }
}
