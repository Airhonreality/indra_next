import { NextResponse } from 'next/server';

export async function GET() {
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
