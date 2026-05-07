/**
 * NANGO SESSION TOKEN ENDPOINT
 * Genera un session token de corta duración para que el frontend
 * pueda abrir el Connect UI de Nango de forma segura.
 *
 * AXIOMA: El servidor actúa como mediador de confianza.
 * El frontend NUNCA maneja la Secret Key directamente.
 *
 * Docs: https://docs.nango.dev/guides/auth/auth-guide
 * Flow: Backend genera token → Frontend abre ConnectUI → Nango almacena credenciales
 */

export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { nango } from '@/lib/nango';
import { auth } from "@/auth";

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { integrationId } = body;
    const userId = session.user.id;
    if (!userId) {
      return NextResponse.json({ error: 'User ID missing in session' }, { status: 400 });
    }

    const payload: any = {
      connectionId: userId,
      tags: { indra_user_id: userId }
    };

    if (integrationId) {
      payload.allowed_integrations = [integrationId];
    }
    
    console.log('[Nango Session Request]:', JSON.stringify(payload, null, 2));

    // Bypass SDK and call Nango API directly for transparency
    const nangoRes = await fetch('https://api.nango.dev/connect/session', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.NANGO_SECRET_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const nangoData = await nangoRes.json();

    if (!nangoRes.ok) {
      console.error('[Nango API Error]:', nangoData);
      return NextResponse.json({ 
        error: 'Nango API Failure', 
        nangoDetail: nangoData 
      }, { status: nangoRes.status });
    }

    return NextResponse.json({ sessionToken: nangoData.token });
  } catch (err: any) {
    console.error('[Nango Session Bridge Error]:', err);
    return NextResponse.json(
      { error: `Bridge Error: ${err.message}` },
      { status: 500 }
    );
  }
}
