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

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const connectionId = searchParams.get('connectionId');

    let query = 'SELECT * FROM ingestion_ports';
    const params: any[] = [];

    if (connectionId) {
      query += ' WHERE target_id = $1';
      params.push(connectionId);
    }

    query += ' ORDER BY created_at DESC';

    const result = await db.query(query, params);
    
    return NextResponse.json({ ports: result.rows });
  } catch (err) {
    console.error('[API Error] Failed to list ports:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
