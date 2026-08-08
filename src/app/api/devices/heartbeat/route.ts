/**
 * POST /api/devices/heartbeat
 *
 * Daemon reports its state and receives pending commands.
 * Authentication via Authorization: Bearer <deviceToken> header (not NextAuth session).
 * Atomically consumes pending commands for this device.
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { devices, syncCommands } from '@/core/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { createHash } from 'crypto';

export async function POST(request: Request) {
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

    // Hash the token with SHA-256 (same as pair/claim)
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

    // Parse request body
    let body: { deviceName?: string; files?: Array<{ path: string; sizeBytes: number; modifiedAtMs: number; blake3Hex: string | null }> } = {};
    try {
      body = await request.json();
    } catch (e) {
      // Allow empty body
    }

    // Log file count if provided
    if (body.files && Array.isArray(body.files)) {
      console.log(`[heartbeat] Device ${device.id} reported ${body.files.length} files`);
    }

    // Update lastSeenAt
    const now = new Date();
    await db
      .update(devices)
      .set({ lastSeenAt: now })
      .where(eq(devices.id, device.id));

    // Consume pending commands atomically
    const consumed = await db
      .update(syncCommands)
      .set({ consumedAt: now })
      .where(and(eq(syncCommands.deviceId, device.id), isNull(syncCommands.consumedAt)))
      .returning();

    return NextResponse.json(
      {
        acknowledged: true,
        commands: consumed,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[heartbeat] Error processing heartbeat:', error);
    return NextResponse.json(
      {
        error: 'internal_error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
