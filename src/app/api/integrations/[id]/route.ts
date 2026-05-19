import { NextResponse } from 'next/server';
import { auth } from "@/auth";
import { db } from '@/lib/db';
import { integrations, storageConnections } from '@/core/db/schema';
import { eq, and } from 'drizzle-orm';

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // 1. Intentar eliminar de las integraciones tradicionales (Notion, Sheets)
    const result = await db
      .delete(integrations)
      .where(
        and(
          eq(integrations.id, id),
          eq(integrations.userId, session.user.id)
        )
      )
      .returning();

    // 2. Si no se encontró nada, intentar eliminar de las conexiones dedicadas (MEGA)
    if (result.length === 0) {
      const storageResult = await db
        .delete(storageConnections)
        .where(
          and(
            eq(storageConnections.id, id),
            eq(storageConnections.userId, session.user.id)
          )
        )
        .returning();

      if (storageResult.length === 0) {
        return NextResponse.json({ error: 'Integration not found or not owned by user' }, { status: 404 });
      }
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('[Integration Delete Error]:', error);
    return NextResponse.json({ error: 'Failed to delete integration' }, { status: 500 });
  }
}

