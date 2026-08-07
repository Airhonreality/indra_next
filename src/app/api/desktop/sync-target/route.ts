/**
 * Set Local Sync Target Endpoint
 *
 * PATCH /api/desktop/sync-target
 * Allows the user to choose which storage provider to use as the target for local file sync.
 * Body: { provider: string | null }
 * Provider must be one of: 's3', 'mega', 'google-drive', or null to disable sync.
 *
 * Stores the choice in local_sync_settings (one row per user, upsert on userId).
 */

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { localSyncSettings } from '@/core/db/schema';
import { eq } from 'drizzle-orm';

const ALLOWED_PROVIDERS = ['s3', 'mega', 'google-drive'];

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { provider } = await req.json();

    // Validate provider: must be null or one of the allowed list
    if (provider !== null && !ALLOWED_PROVIDERS.includes(provider)) {
      return NextResponse.json(
        {
          error: 'invalid_provider',
          message: `Provider must be one of ${ALLOWED_PROVIDERS.join(', ')} or null`,
        },
        { status: 400 }
      );
    }

    // Check if a row already exists for this user
    const existing = await db
      .select()
      .from(localSyncSettings)
      .where(eq(localSyncSettings.userId, session.user.id))
      .limit(1);

    let result;
    if (existing.length > 0) {
      // Update existing row
      result = await db
        .update(localSyncSettings)
        .set({
          provider: provider || null,
          updatedAt: new Date(),
        })
        .where(eq(localSyncSettings.userId, session.user.id))
        .returning();
    } else {
      // Insert new row
      result = await db.insert(localSyncSettings).values({
        userId: session.user.id,
        provider: provider || null,
        updatedAt: new Date(),
      }).returning();
    }

    return NextResponse.json({
      success: true,
      syncTarget: result[0],
    });
  } catch (error) {
    console.error('[sync-target] PATCH failed:', error);
    return NextResponse.json(
      {
        error: 'sync_target_failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
