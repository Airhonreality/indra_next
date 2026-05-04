import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ingestionPorts } from '@/core/db/schema';
import { eq } from 'drizzle-orm';

/** Public endpoint — no auth. Returns port config for the drop-zone page. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  try {
    const [port] = await db
      .select()
      .from(ingestionPorts)
      .where(eq(ingestionPorts.slug, slug))
      .limit(1);

    if (!port || !port.isActive) {
      return NextResponse.json({ error: 'Port not found' }, { status: 404 });
    }

    return NextResponse.json({ port });
  } catch (err) {
    console.error('[IPW] GET /api/p/[slug]:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
