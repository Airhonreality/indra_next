/**
 * 🛣️ ARTEFACTO: route.ts (Port Listing)
 * ────────────
 * CAPA: API / Ports (Discovery)
 * VERSIÓN: 1.0.0
 * 
 * 🎯 FUNCTIONAL_SCOPE:
 * - Listado de Puertos de Ingesta registrados en el sistema.
 * - Soporte para filtrado por 'connectionId' para proveer memoria a los widgets de la Shell.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ingestionPorts } from '@/core/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { auth } from "@/auth";

export async function GET(req: NextRequest) {
  const session = await auth();
  
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const connectionId = searchParams.get('connectionId');

    // Base query filtered by USER ID (Sovereign Axiom)
    let whereClause = eq(ingestionPorts.userId, session.user.id);

    // If connectionId is provided, narrow down the filter
    if (connectionId) {
      whereClause = and(
        eq(ingestionPorts.userId, session.user.id),
        eq(ingestionPorts.integrationId, connectionId)
      ) as any;
    }

    const result = await db.select()
      .from(ingestionPorts)
      .where(whereClause)
      .orderBy(desc(ingestionPorts.createdAt));
    
    return NextResponse.json({ ports: result });
  } catch (err) {
    console.error('[API Error] Failed to list ports:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
