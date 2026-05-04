import { NextResponse } from 'next/server';
import { auth } from "@/auth";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const NANGO_SECRET_KEY = process.env.NANGO_SECRET_KEY;

  if (!NANGO_SECRET_KEY) {
    return NextResponse.json({ error: 'NANGO_SECRET_KEY not configured' }, { status: 500 });
  }

  try {
    // Consultamos a Nango las integraciones configuradas en el proyecto
    const response = await fetch('https://api.nango.dev/config', {
      headers: {
        'Authorization': `Bearer ${NANGO_SECRET_KEY}`
      }
    });

    if (!response.ok) {
      throw new Error(`Nango API responded with ${response.status}`);
    }

    const data = await response.json();
    
    // Devolvemos la lista de integraciones para que la UI se autoconstruya
    // Nango devuelve un objeto con 'configs'
    return NextResponse.json({ 
      integrations: data.configs || [] 
    });
  } catch (error) {
    console.error('Discovery Error:', error);
    return NextResponse.json({ error: 'Failed to discover integrations' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const NANGO_SECRET_KEY = process.env.NANGO_SECRET_KEY;

  try {
    const { provider, client_id, client_secret } = await req.json();

    // Registramos la configuración directamente en Nango
    const response = await fetch('https://api.nango.dev/config', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NANGO_SECRET_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        provider: provider,
        unique_key: provider, // Usamos el nombre del proveedor como clave única
        client_id: client_id,
        client_secret: client_secret
      })
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.message || 'Failed to register in Nango');
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Provisioning Error:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
