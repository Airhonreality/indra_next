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
    const candidates = [
      `${baseUrl}/index.php/login/v2`,
      `${baseUrl}/login/v2`,
    ];

    const failures: Array<{ url: string; status: number; details: string }> = [];

    for (const url of candidates) {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-Language': 'es-419,es;q=0.9,en;q=0.8',
          'User-Agent': 'Indra Next Claro Login',
        },
        cache: 'no-store',
      });

      const contentType = response.headers.get('content-type') || '';
      const rawBody = await response.text().catch(() => '');

      if (!response.ok) {
        failures.push({
          url,
          status: response.status,
          details: rawBody.slice(0, 400),
        });
        continue;
      }

      let payload: unknown;
      try {
        payload = contentType.includes('application/json') ? JSON.parse(rawBody) : JSON.parse(rawBody);
      } catch {
        failures.push({
          url,
          status: response.status,
          details: rawBody.slice(0, 400),
        });
        continue;
      }

      const json = payload as {
        login?: string;
        poll?: { token?: string; endpoint?: string };
      };
      const pollEndpoint = json?.poll?.endpoint ? new URL(json.poll.endpoint, baseUrl).toString() : '';

      if (!json?.login || !json?.poll?.token || !pollEndpoint) {
        failures.push({
          url,
          status: response.status,
          details: rawBody.slice(0, 400),
        });
        continue;
      }

      return NextResponse.json({
        login: json.login,
        poll: {
          token: json.poll.token,
          endpoint: pollEndpoint,
        },
        server: baseUrl,
      });
    }

    return NextResponse.json(
      {
        error: 'Login flow start failed on all candidate endpoints',
        details: failures,
      },
      { status: 502 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
