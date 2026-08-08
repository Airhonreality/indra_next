/**
 * GET /api/devices/download-object?objectId=<id>
 *
 * Proxy for daemon to download remote objects.
 * Authentication via Authorization: Bearer <deviceToken> header (not NextAuth session).
 * Resolves the object via the user's configured storage provider.
 */

import { NextResponse, NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { devices, localSyncSettings } from '@/core/db/schema';
import { getActiveUpstreams } from '@/integrations/storage-union/helpers';
import { eq } from 'drizzle-orm';
import { createHash } from 'crypto';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    // 1. Extract objectId from query params
    const objectId = request.nextUrl.searchParams.get('objectId');
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

    // 3. Read user's sync target
    const settings = await db
      .select()
      .from(localSyncSettings)
      .where(eq(localSyncSettings.userId, userId))
      .limit(1);

    if (!settings.length || !settings[0].provider) {
      return NextResponse.json(
        { error: 'no_sync_target', message: 'No sync target configured for this user' },
        { status: 400 }
      );
    }

    const targetProvider = settings[0].provider;

    // 4. Resolve the adapter
    const upstreams = await getActiveUpstreams(userId);
    const adapter = upstreams.find((u) => u.id === targetProvider);

    if (!adapter) {
      return NextResponse.json(
        {
          error: 'provider_not_connected',
          message: `Provider '${targetProvider}' is not connected or active for this user.`,
        },
        { status: 400 }
      );
    }

    // 5. Verify adapter supports blob download
    if (!adapter.downloadBlob) {
      return NextResponse.json(
        { error: 'provider_no_download', message: `Provider '${targetProvider}' does not support blob download.` },
        { status: 501 }
      );
    }

    // 6. Call adapter.downloadBlob
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

    // 7. Return the stream as the response body
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
