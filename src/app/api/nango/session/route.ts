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
 * 
 * 🩹 POST-MORTEM [2026-05-10]: NANGO-V2-HANDSHAKE-FIX
 * - ERROR: 404/400/200-undefined por cambios de ruptura en Nango API v2.
 * - FIX: Endpoint pluralizado (/sessions), llaves snake_case (connection_id), y extracción profunda (data.token).
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

    // Sovereign Connection ID generated on server side
    const connectionId = `${integrationId}-${userId}`;

    const payload: any = {
      connection_id: connectionId,
      tags: { end_user_id: userId }
    };

    if (integrationId) {
      payload.provider_config_key = integrationId;
    }
    
    const secretKey = process.env.NANGO_SECRET_KEY;
    console.log('[Nango Session Request]:', JSON.stringify(payload, null, 2));
    console.log('[Nango Auth Check]:', secretKey ? `Key present (starts with ${secretKey.substring(0, 4)}...)` : 'KEY MISSING');

    if (!secretKey) {
      return NextResponse.json({ error: 'NANGO_SECRET_KEY is not defined in environment' }, { status: 500 });
    }
    const nangoRes = await fetch('https://api.nango.dev/connect/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${secretKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const responseText = await nangoRes.text();
    let nangoData;
    
    try {
      nangoData = JSON.parse(responseText);
    } catch (e) {
      console.error('[Nango API Non-JSON Response]:', responseText);
      return NextResponse.json({ 
        error: 'Nango API returned non-JSON response (HTML Error)', 
        status: nangoRes.status,
        bodyPreview: responseText.substring(0, 200)
      }, { status: 500 });
    }

    if (!nangoRes.ok) {
      console.error('[Nango API Error]:', nangoData);
      return NextResponse.json({ 
        error: 'Nango API Failure', 
        nangoDetail: nangoData 
      }, { status: nangoRes.status });
    }

    return NextResponse.json({ 
      sessionToken: nangoData.data?.token || nangoData.token || nangoData.session_token,
      _fullResponse: nangoData 
    });
  } catch (err: any) {
    console.error('[Nango Session Bridge Error]:', err);
    return NextResponse.json(
      { error: `Bridge Error: ${err.message}` },
      { status: 500 }
    );
  }
}
