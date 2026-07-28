import { NextResponse } from 'next/server';
import { auth } from '@/auth';

function normalizeBaseUrl(baseUrl: unknown): string {
  const raw = typeof baseUrl === 'string' && baseUrl.trim() ? baseUrl.trim() : 'https://www.clarodrive.com';
  const parsed = new URL(raw);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Claro Drive base URL must use http or https');
  }
  return parsed.toString().replace(/\/+$/, '');
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const baseUrl = normalizeBaseUrl(body?.baseUrl);
    const token = typeof body?.token === 'string' ? body.token.trim() : '';
    const endpoint = typeof body?.endpoint === 'string' && body.endpoint.trim()
      ? body.endpoint.trim()
      : `${baseUrl}/login/v2/poll`;

    if (!token) {
      return NextResponse.json({ error: 'Missing poll token' }, { status: 400 });
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        'OCS-APIREQUEST': 'true',
        'User-Agent': 'Indra Next Claro Login',
      },
      body: new URLSearchParams({ token }).toString(),
      cache: 'no-store',
    });

    if (response.status === 404) {
      return NextResponse.json({ pending: true }, { status: 202 });
    }

    if (!response.ok) {
      const details = await response.text().catch(() => '');
      return NextResponse.json(
        {
          error: `Login poll failed: HTTP ${response.status}`,
          details,
        },
        { status: 502 }
      );
    }

    const payload = await response.json();
    return NextResponse.json({
      pending: false,
      server: payload?.server || baseUrl,
      loginName: payload?.loginName || payload?.login_name || '',
      appPassword: payload?.appPassword || payload?.app_password || '',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
