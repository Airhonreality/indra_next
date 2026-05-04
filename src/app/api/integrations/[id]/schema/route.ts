import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { integrations } from '@/core/db/schema';
import { eq } from 'drizzle-orm';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { dynamicSchema } = await req.json();

    await db.update(integrations)
      .set({ 
        dynamicSchema,
        updatedAt: new Date()
      })
      .where(eq(integrations.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update Schema Error:', error);
    return NextResponse.json({ error: 'Failed to update schema' }, { status: 500 });
  }
}
