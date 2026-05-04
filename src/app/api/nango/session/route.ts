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

import { NextResponse } from 'next/server';
import { nango } from '@/lib/nango';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userId, integrationId } = body;

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    // Crear sesión de conexión en Nango
    // El token dura 30 minutos y es de un solo uso
    const { data } = await nango.createConnectSession({
      // Tags vinculan la conexión al usuario soberano de Indra
      tags: {
        end_user_id: userId,
      },
      // Si se especifica una integración, el UI va directo a ese flujo
      ...(integrationId ? { allowed_integrations: [integrationId] } : {}),
    });

    return NextResponse.json({ sessionToken: data.token });
  } catch (err) {
    console.error('[Nango] Failed to create session token:', err);
    return NextResponse.json(
      { error: 'Failed to create Nango session' },
      { status: 500 }
    );
  }
}
