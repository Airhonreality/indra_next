/**
 * GET /api/devices/whoami
 *
 * Verifies device identity and reports pairing status.
 * Authentication via Authorization: Bearer <deviceToken> header (not NextAuth session).
 * Read-only: does NOT consume syncCommands (unlike /heartbeat).
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { devices } from '@/core/db/schema';
import { eq } from 'drizzle-orm';
import { createHash } from 'crypto';

export async function GET(request: Request) {
  try {
    // Extract token from Authorization header
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

    // Update lastSeenAt (idempotent, no side effects on commands)
    const now = new Date();
    await db
      .update(devices)
      .set({ lastSeenAt: now })
      .where(eq(devices.id, device.id));

    // Return identity info (explicitly project fields, never raw device object)
    return NextResponse.json(
      {
        deviceId: device.id,
        deviceName: device.deviceName,
        pairedAt: device.createdAt,
        lastSeenAt: now,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[whoami] Error processing request:', error);
    return NextResponse.json(
      {
        error: 'internal_error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
