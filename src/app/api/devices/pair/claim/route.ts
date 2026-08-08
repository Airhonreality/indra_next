/**
 * POST /api/devices/pair/claim
 *
 * Daemon claims a pairing code and receives a device token.
 * No session required (called by daemon, not web browser).
 * Token is returned in plaintext ONLY ONCE — not retrievable later.
 * The token hash is stored in the database, never the plaintext token.
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { devicePairingCodes, devices } from '@/core/db/schema';
import { eq, and, isNull, gt } from 'drizzle-orm';
import { randomBytes, createHash } from 'crypto';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { code, deviceName } = body;

    if (!code || typeof code !== 'string') {
      return NextResponse.json(
        { error: 'invalid_request', message: 'Missing or invalid "code" parameter' },
        { status: 400 }
      );
    }

    if (!deviceName || typeof deviceName !== 'string') {
      return NextResponse.json(
        { error: 'invalid_request', message: 'Missing or invalid "deviceName" parameter' },
        { status: 400 }
      );
    }

    // Generate device token up front: high entropy prefix + random bytes
    const tokenBytes = randomBytes(32);
    const token = 'idr_' + tokenBytes.toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');

    const now = new Date();

    // Claim the code and create the device in one transaction:
    // - The UPDATE's WHERE clause (not-consumed, not-expired) is checked and applied by
    //   Postgres in a single statement, so two concurrent requests for the same code can't
    //   both pass a "is it consumed?" check before either writes — only one can ever flip
    //   consumed_at from NULL. A separate SELECT-then-UPDATE would race.
    // - Wrapping the device INSERT in the same transaction means a failed insert rolls the
    //   claim back too, instead of burning the code with no device created.
    let deviceId: string;
    try {
      const result = await db.transaction(async (tx) => {
        const claimed = await tx
          .update(devicePairingCodes)
          .set({ consumedAt: now })
          .where(
            and(
              eq(devicePairingCodes.code, code),
              isNull(devicePairingCodes.consumedAt),
              gt(devicePairingCodes.expiresAt, now)
            )
          )
          .returning();

        if (claimed.length === 0) {
          return null;
        }

        const inserted = await tx
          .insert(devices)
          .values({
            userId: claimed[0].userId,
            deviceName,
            tokenHash,
            lastSeenAt: null,
            createdAt: now,
          })
          .returning({ id: devices.id });

        return inserted[0];
      });

      if (!result) {
        return NextResponse.json(
          { error: 'invalid_or_expired_code', message: 'Pairing code not found, already used, or expired' },
          { status: 400 }
        );
      }

      deviceId = result.id;
    } catch (txError) {
      console.error('[pair-claim] Transaction failed:', txError);
      return NextResponse.json(
        { error: 'internal_error', message: 'Failed to claim pairing code' },
        { status: 500 }
      );
    }

    // Return token in plaintext (only time it's ever sent)
    return NextResponse.json(
      {
        deviceToken: token,
        deviceId,
        expiresAt: null, // Token does not expire (long-lived credential)
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[pair-claim] Error claiming pairing code:', error);
    return NextResponse.json(
      {
        error: 'internal_error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
