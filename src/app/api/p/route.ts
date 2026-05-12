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
import { eq, desc } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const connectionId = searchParams.get('connectionId');

    let query = db.select()
      .from(ingestionPorts)
      .orderBy(desc(ingestionPorts.createdAt));

    if (connectionId) {
      // In Indra, the field in ingestion_ports that links to connection is integrationId
      query = query.where(eq(ingestionPorts.integrationId, connectionId)) as any;
    }

    const result = await query;
    
    return NextResponse.json({ ports: result });
  } catch (err) {
    console.error('[API Error] Failed to list ports:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
