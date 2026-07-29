import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { ensureDesktopRoot, readDesktopRootState } from '@/lib/desktop-root';
import { integrations } from '@/core/db/schema';

const DESKTOP_ROOT_CONNECTION_PREFIX = 'indra-desktop-root';

function getDesktopRootConnectionId(userId: string): string {
  return `${DESKTOP_ROOT_CONNECTION_PREFIX}-${userId}`;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const root = await readDesktopRootState(session.user.id);
    const connectionId = getDesktopRootConnectionId(session.user.id);
    const integration = await db
      .select()
      .from(integrations)
      .where(
        and(
          eq(integrations.userId, session.user.id),
          eq(integrations.type, 'storage'),
          eq(integrations.connectionId, connectionId)
        )
      )
      .limit(1);

    return NextResponse.json({ success: true, root, integration: integration[0] ?? null });
  } catch (error) {
    console.error('[desktop/root][GET] Failed to read desktop root state:', error);
    return NextResponse.json({ error: 'Failed to read desktop root state' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const payload = await req.json().catch(() => ({}));
    const action = typeof payload?.action === 'string' ? payload.action : 'ensure';

    if (action !== 'ensure') {
      return NextResponse.json({ error: 'Unsupported desktop root action' }, { status: 400 });
    }

    const root = await ensureDesktopRoot(session.user.id);
    const connectionId = getDesktopRootConnectionId(session.user.id);
    const label = 'Indra Desktop Root';
    const config = {
      basePath: root.path,
      managedRoot: true,
      source: 'desktop-root',
    };

    const existing = await db
      .select()
      .from(integrations)
      .where(
        and(
          eq(integrations.userId, session.user.id),
          eq(integrations.type, 'storage'),
          eq(integrations.connectionId, connectionId)
        )
      )
      .limit(1);

    let integration = existing[0] ?? null;
    if (integration) {
      const result = await db
        .update(integrations)
        .set({
          label,
          config,
          isActive: true,
          updatedAt: new Date(),
        })
        .where(eq(integrations.id, integration.id))
        .returning();
      integration = result[0] ?? integration;
    } else {
      const result = await db
        .insert(integrations)
        .values({
          userId: session.user.id,
          type: 'storage',
          label,
          connectionId,
          config,
          isActive: true,
        })
        .returning();
      integration = result[0] ?? null;
    }

    return NextResponse.json({ success: true, root, integration });
  } catch (error) {
    console.error('[desktop/root][POST] Failed to ensure desktop root:', error);
    return NextResponse.json({ error: 'Failed to ensure desktop root' }, { status: 500 });
  }
}
