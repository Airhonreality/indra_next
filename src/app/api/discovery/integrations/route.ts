import { NextResponse } from 'next/server';
import { auth } from "@/auth";

/**
 * API ENDPOINT: DISCOVERY & PROVISIONING
 * Handles the detection of configured cloud providers in Nango
 * and allows administrative provisioning of new credentials.
 */

const NANGO_API_BASE = 'https://api.nango.dev';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const nangoSecret = process.env.NANGO_SECRET_KEY;
  if (!nangoSecret) {
    return NextResponse.json({ error: 'NANGO_SECRET_KEY_MISSING' }, { status: 500 });
  }

  try {
    // Fetch active configurations from Nango (Providers already provisioned with keys)
    const response = await fetch(`${NANGO_API_BASE}/config`, {
      headers: { 'Authorization': `Bearer ${nangoSecret}` }
    });

    if (!response.ok) {
      throw new Error(`Nango API returned status ${response.status}`);
    }

    const data = await response.json();
    
    // Return provisioned configurations
    // Nango returns an object with a 'configs' array
    return NextResponse.json({ 
      providers: data.configs || [] 
    });
  } catch (error) {
    console.error('[Discovery API Error]:', error);
    return NextResponse.json({ error: 'Failed to discover provider configurations' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await auth();
  
  // SECURITY CHECK: Temporarily allowing any authenticated user to provision for MVP
  // In production, this should check for an admin role or specific email
  const isAdmin = !!session?.user?.id;
  
  if (!isAdmin) {
    return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
  }

  const nangoSecret = process.env.NANGO_SECRET_KEY;

  try {
    const { provider, client_id, client_secret } = await req.json();

    if (!provider || !client_id || !client_secret) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    // Register provider credentials in Nango
    const response = await fetch(`${NANGO_API_BASE}/config`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${nangoSecret}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        provider: provider,
        unique_key: provider, 
        client_id: client_id,
        client_secret: client_secret
      })
    });

    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.message || 'Nango registration failed');
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Provisioning API Error]:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
