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
    const response = await fetch(`${baseUrl}/index.php/login/v2`, {
      method: 'POST',
      headers: {
        'OCS-APIREQUEST': 'true',
        'Accept': 'application/json',
        'Accept-Language': 'es-419,es;q=0.9,en;q=0.8',
        'User-Agent': 'Indra Next Claro Login',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      const details = await response.text().catch(() => '');
      return NextResponse.json(
        {
          error: `Login flow start failed: HTTP ${response.status}`,
          details,
        },
        { status: 502 }
      );
    }

    const payload = await response.json();
    const pollEndpoint = payload?.poll?.endpoint
      ? new URL(payload.poll.endpoint, baseUrl).toString()
      : '';

    if (!payload?.login || !payload?.poll?.token || !pollEndpoint) {
      return NextResponse.json(
        { error: 'Login flow response missing login or poll data' },
        { status: 502 }
      );
    }

    return NextResponse.json({
      login: payload.login,
      poll: {
        token: payload.poll.token,
        endpoint: pollEndpoint,
      },
      server: baseUrl,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
