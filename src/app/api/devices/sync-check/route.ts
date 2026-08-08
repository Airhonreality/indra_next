/**
 * POST /api/devices/sync-check
 *
 * Producer of download_file commands.
 * Checks EVERY connected provider for new files (no manual "sync target" - see
 * docs/plans/26_PLAN_puente-daemon-nube-hospedada.md, "Corrección de producto") and enqueues
 * download commands for all paired devices.
 * Requires NextAuth session.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { localSyncState, syncCommands, devices } from '@/core/db/schema';
import { getActiveUpstreams } from '@/integrations/storage-union/helpers';
import { eq, and, inArray } from 'drizzle-orm';

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const userId = session.user.id;

    // Step 1: Resolve every connected provider - no single "sync target" to pick.
    const upstreams = await getActiveUpstreams(userId);

    // Step 2: List inventory from each provider, collecting new files per provider.
    // A failure on one provider shouldn't block the others.
    const newRemoteItems: Array<{ provider: string; id: string; name: string }> = [];
    const providerErrors: Array<{ provider: string; message: string }> = [];

    for (const adapter of upstreams) {
      let inventoryResult;
      try {
        inventoryResult = await adapter.listInventory();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        providerErrors.push({ provider: adapter.id, message: msg });
        continue;
      }

      if (!inventoryResult.ok) {
        providerErrors.push({ provider: adapter.id, message: inventoryResult.error || 'Failed to list remote inventory' });
        continue;
      }

      const remoteItems = inventoryResult.data || [];

      for (const item of remoteItems) {
        if (item.type !== 'file') continue; // Skip folders

        const existing = await db
          .select()
          .from(localSyncState)
          .where(
            and(
              eq(localSyncState.userId, userId),
              eq(localSyncState.provider, adapter.id),
              eq(localSyncState.remoteObjectId, item.id)
            )
          )
          .limit(1);

        if (!existing.length) {
          newRemoteItems.push({ provider: adapter.id, id: item.id, name: item.name });
        }
      }
    }

    // Step 3: Get all active devices for this user
    const userDevices = await db
      .select()
      .from(devices)
      .where(eq(devices.userId, userId));

    // Nothing currently writes local_sync_state for the download direction (a device
    // downloading a file only updates its own local SQLite, not this table) - so the dedup
    // above can never see a previously-downloaded object as "already synced". Without this
    // guard, calling sync-check twice would enqueue duplicate download_file commands for the
    // same object forever. Until a download-confirmation round trip exists (future fase),
    // dedupe against sync_commands already issued for each device/provider/object triple.
    const deviceIds = userDevices.map((d) => d.id);
    const alreadyQueued = new Set<string>();
    if (deviceIds.length > 0) {
      const existingCommands = await db
        .select({ deviceId: syncCommands.deviceId, payload: syncCommands.payload })
        .from(syncCommands)
        .where(and(inArray(syncCommands.deviceId, deviceIds), eq(syncCommands.kind, 'download_file')));

      for (const cmd of existingCommands) {
        const payload = cmd.payload as { provider?: string; remoteObjectId?: string } | null;
        if (payload?.provider && payload?.remoteObjectId) {
          alreadyQueued.add(`${cmd.deviceId}:${payload.provider}:${payload.remoteObjectId}`);
        }
      }
    }

    // Step 4: For each new remote file x each device, insert a sync_command (skip duplicates)
    let enqueuedCount = 0;
    for (const item of newRemoteItems) {
      for (const device of userDevices) {
        const key = `${device.id}:${item.provider}:${item.id}`;
        if (alreadyQueued.has(key)) continue;

        await db.insert(syncCommands).values({
          deviceId: device.id,
          kind: 'download_file',
          payload: {
            provider: item.provider,
            remoteObjectId: item.id,
            fileName: item.name,
          },
        });
        alreadyQueued.add(key);
        enqueuedCount++;
      }
    }

    return NextResponse.json({
      enqueued: enqueuedCount,
      devices: userDevices.length,
      providersChecked: upstreams.length,
      providerErrors,
    });
  } catch (error: unknown) {
    console.error('[sync-check] POST failed:', error);
    return NextResponse.json(
      {
        error: 'sync_check_failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 502 }
    );
  }
}
