/**
 * GET /api/devices/download-object?provider=<id>&objectId=<id>
 *
 * Proxy for daemon to download remote objects.
 * Authentication via Authorization: Bearer <deviceToken> header (not NextAuth session).
 * `provider` identifies which of the device owner's connected adapters to use - there is no
 * single "sync target" anymore (see docs/plans/26_PLAN_puente-daemon-nube-hospedada.md,
 * "Corrección de producto"); every sync_command payload already carries the provider it came
 * from, so the daemon always has it on hand when it calls this endpoint.
 */

import { NextResponse, NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { devices } from '@/core/db/schema';
import { getActiveUpstreams } from '@/integrations/storage-union/helpers';
import { eq } from 'drizzle-orm';
import { createHash } from 'crypto';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    // 1. Extract provider + objectId from query params
    const provider = request.nextUrl.searchParams.get('provider');
    const objectId = request.nextUrl.searchParams.get('objectId');
    if (!provider) {
      return NextResponse.json(
        { error: 'missing_provider', message: 'Query parameter ?provider is required' },
        { status: 400 }
      );
    }
    if (!objectId) {
      return NextResponse.json(
        { error: 'missing_object_id', message: 'Query parameter ?objectId is required' },
        { status: 400 }
      );
    }

    // 2. Extract and verify device token from Authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader || typeof authHeader !== 'string') {
      return NextResponse.json(
        { error: 'unauthorized', message: 'Missing Authorization header' },
        { status: 401 }
      );
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return NextResponse.json(
        { error: 'unauthorized', message: 'Invalid Authorization header format' },
        { status: 401 }
      );
    }

    const token = parts[1];

    // Hash the token with SHA-256 (same as heartbeat)
    const tokenHash = createHash('sha256').update(token).digest('hex');

    // Find the device by token hash
    const deviceList = await db
      .select()
      .from(devices)
      .where(eq(devices.tokenHash, tokenHash))
      .limit(1);

    if (deviceList.length === 0) {
      return NextResponse.json(
        { error: 'device_not_found', message: 'Device token not recognized' },
        { status: 401 }
      );
    }

    const device = deviceList[0];
    const userId = device.userId;

    // 3. Resolve the adapter identified by ?provider - among THIS device owner's own
    // connected upstreams only, so a valid device token can never reach another user's data.
    const upstreams = await getActiveUpstreams(userId);
    const adapter = upstreams.find((u) => u.id === provider);

    if (!adapter) {
      return NextResponse.json(
        {
          error: 'provider_not_connected',
          message: `Provider '${provider}' is not connected or active for this user.`,
        },
        { status: 400 }
      );
    }

    // 4. Verify adapter supports blob download
    if (!adapter.downloadBlob) {
      return NextResponse.json(
        { error: 'provider_no_download', message: `Provider '${provider}' does not support blob download.` },
        { status: 501 }
      );
    }

    // 5. Call adapter.downloadBlob
    let result;
    try {
      result = await adapter.downloadBlob(objectId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      return NextResponse.json(
        {
          error: 'download_failed',
          message: `Failed to download from provider: ${msg}`,
        },
        { status: 502 }
      );
    }

    if (!result.ok || !result.data) {
      return NextResponse.json(
        {
          error: 'download_failed',
          message: result.error || 'Failed to download object from provider',
        },
        { status: 502 }
      );
    }

    // 6. Return the stream as the response body
    return new Response(result.data as ReadableStream, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${objectId}"`,
      },
    });
  } catch (error: unknown) {
    console.error('[download-object] GET failed:', error);
    return NextResponse.json(
      {
        error: 'internal_error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
