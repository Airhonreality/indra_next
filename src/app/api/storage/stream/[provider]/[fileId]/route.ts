import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getActiveUpstreams } from '@/integrations/storage-union/helpers';

export const dynamic = 'force-dynamic';

/**
 * 🛰️ STREAMING PROXY ROUTE (Google Drive + OneDrive)
 * ───────────────────────────────────────────────
 * Allows the browser to stream media using standard HTML5 tags (e.g. <video>, <audio>).
 * Supports the standard 'Range' header for fast video scrubbing (seeking).
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ provider: string; fileId: string }> }
) {
  const { provider, fileId } = await context.params;

  // 1. Validate session
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // 2. Resolve connection and instantiate authorized upstream client
    const upstreams = await getActiveUpstreams(session.user.id);
    const upstream = upstreams.find((u) => u.id === provider);

    if (!upstream) {
      return NextResponse.json(
        { error: `Active connection for "${provider}" not found or unauthorized.` },
        { status: 404 }
      );
    }

    // 3. Ensure upstream supports downloading raw blobs/streams
    const blobUpstream = upstream as any;
    if (typeof blobUpstream.downloadBlob !== 'function') {
      return NextResponse.json(
        { error: `Adapter for "${provider}" is not blob-capable (downloadBlob missing).` },
        { status: 501 }
      );
    }

    // 5. Extract Range header and request partial stream from provider
    const rangeHeader = req.headers.get('range') || undefined;
    const result = await blobUpstream.downloadBlob(fileId, rangeHeader);

    if (!result.ok || !result.data) {
      return NextResponse.json(
        { error: result.error || 'Failed to download stream from upstream provider.' },
        { status: 502 }
      );
    }

    // 6. Extract precise upstream headers if returned
    const upstreamHeaders = (result.meta as any)?.headers || {};
    const contentType = upstreamHeaders['content-type'] || 'video/mp4';
    const contentRange = upstreamHeaders['content-range'];
    const contentLength = upstreamHeaders['content-length'];

    const headers: Record<string, string> = {
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
    };

    if (contentRange) {
      headers['Content-Range'] = contentRange;
    } else if (rangeHeader) {
      // Fallback range header
      headers['Content-Range'] = rangeHeader;
    }

    if (contentLength) {
      headers['Content-Length'] = contentLength;
    }

    return new Response(result.data as ReadableStream, {
      status: contentRange ? 206 : (rangeHeader ? 206 : 200),
      headers,
    });
  } catch (error: any) {
    console.error(`[Streaming Proxy Error for ${provider}/${fileId}]:`, error);
    return NextResponse.json(
      { error: 'Internal Server Error during streaming proxy routing' },
      { status: 500 }
    );
  }
}
