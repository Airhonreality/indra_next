/**
 * POST /api/devices/pair/start
 *
 * Generates a short-lived (10 min), single-use pairing code for a device.
 * Requires active NextAuth session (web user).
 * Returns the code in plaintext for the user to share with the daemon.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { devicePairingCodes } from '@/core/db/schema';
import { eq } from 'drizzle-orm';
import { randomBytes, randomInt } from 'crypto';

// Characters for code generation: alphanumeric without ambiguous chars
// Exclude: 0 (looks like O), O, 1 (looks like I/L), I, L
const SAFE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/**
 * Generate a random 8-char pairing code using crypto.randomInt.
 * Retries up to 5 times if collision detected (extremely unlikely but possible).
 */
async function generateUniquePairingCode(userId: string): Promise<string> {
  const maxRetries = 5;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    // Generate 8 random characters
    let code = '';
    for (let i = 0; i < 8; i++) {
      const idx = randomInt(0, SAFE_CHARS.length);
      code += SAFE_CHARS[idx];
    }

    // Check for collision in database
    const existing = await db.query.devicePairingCodes.findFirst({
      where: eq(devicePairingCodes.code, code),
    });

    if (!existing) {
      return code;
    }
  }

  // Extremely unlikely, but fail hard if collision persists
  throw new Error('Failed to generate unique pairing code after 5 attempts');
}

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const userId = session.user.id;

    // Generate unique 8-char code
    const code = await generateUniquePairingCode(userId);

    // Expires in 10 minutes
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    // Insert into database
    await db.insert(devicePairingCodes).values({
      code,
      userId,
      expiresAt,
      consumedAt: null,
    });

    return NextResponse.json(
      {
        code,
        expiresAt: expiresAt.toISOString(),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[pair-start] Error generating pairing code:', error);
    return NextResponse.json(
      {
        error: 'Failed to generate pairing code',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
