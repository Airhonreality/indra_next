/**
 * GET /api/devices/providers
 *
 * Lists connected storage providers and their connection status.
 * Authentication via Authorization: Bearer <deviceToken> header (not NextAuth session).
 * Tests each provider with testConnection() (non-invasive health check).
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { devices } from '@/core/db/schema';
import { getActiveUpstreams } from '@/integrations/storage-union/helpers';
import { eq } from 'drizzle-orm';
import { createHash } from 'crypto';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    // Extract and verify device token from Authorization header
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

    // Hash the token with SHA-256 (same as heartbeat/download-object)
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

    // Get active upstreams for this device's user
    const upstreams = await getActiveUpstreams(userId);

    // Test connection for each adapter
    const providers: Array<{
      id: string;
      label: string;
      status: 'ok' | 'error';
      error?: string;
      checkedAt: string;
    }> = [];

    for (const adapter of upstreams) {
      try {
        const result = await adapter.testConnection();
        const checkedAt = new Date().toISOString();

        if (result.ok) {
          providers.push({
            id: adapter.id,
            label: adapter.label,
            status: 'ok',
            checkedAt,
          });
        } else {
          providers.push({
            id: adapter.id,
            label: adapter.label,
            status: 'error',
            error: result.error || 'Unknown error',
            checkedAt,
          });
        }
      } catch (err) {
        const checkedAt = new Date().toISOString();
        providers.push({
          id: adapter.id,
          label: adapter.label,
          status: 'error',
          error: err instanceof Error ? err.message : 'Unknown error',
          checkedAt,
        });
      }
    }

    return NextResponse.json(
      { providers },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error('[providers] GET failed:', error);
    return NextResponse.json(
      {
        error: 'internal_error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
