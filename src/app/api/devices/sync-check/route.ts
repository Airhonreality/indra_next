/**
 * POST /api/devices/sync-check
 *
 * Producer of download_file commands.
 * Checks the remote provider for new files, enqueues download commands for all paired devices.
 * Requires NextAuth session.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { localSyncSettings, localSyncState, syncCommands, devices } from '@/core/db/schema';
import { getActiveUpstreams } from '@/integrations/storage-union/helpers';
import { eq, and, inArray } from 'drizzle-orm';

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Step 1: Read user's sync target from local_sync_settings
    const settings = await db
      .select()
      .from(localSyncSettings)
      .where(eq(localSyncSettings.userId, session.user.id))
      .limit(1);

    if (!settings.length || !settings[0].provider) {
      return NextResponse.json(
        {
          error: 'no_sync_target',
          message: 'No sync target configured.',
        },
        { status: 400 }
      );
    }

    const targetProvider = settings[0].provider;

    // Step 2: Resolve the adapter
    const upstreams = await getActiveUpstreams(session.user.id);
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

    // Step 3: List inventory from remote
    let inventoryResult;
    try {
      inventoryResult = await adapter.listInventory();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      return NextResponse.json(
        {
          error: 'inventory_list_failed',
          message: `Failed to list remote inventory: ${msg}`,
        },
        { status: 502 }
      );
    }

    if (!inventoryResult.ok) {
      return NextResponse.json(
        {
          error: 'inventory_list_failed',
          message: inventoryResult.error || 'Failed to list remote inventory',
        },
        { status: 502 }
      );
    }

    const remoteItems = inventoryResult.data || [];

    // Step 4: Identify new files (not yet in local_sync_state)
    const newRemoteItems = [];
    for (const item of remoteItems) {
      if (item.type !== 'file') continue; // Skip folders

      const existing = await db
        .select()
        .from(localSyncState)
        .where(
          and(
            eq(localSyncState.userId, session.user.id),
            eq(localSyncState.provider, targetProvider),
            eq(localSyncState.remoteObjectId, item.id)
          )
        )
        .limit(1);

      if (!existing.length) {
        newRemoteItems.push(item);
      }
    }

    // Step 5: Get all active devices for this user
    const userDevices = await db
      .select()
      .from(devices)
      .where(eq(devices.userId, session.user.id));

    // Nothing currently writes local_sync_state for the download direction (a device
    // downloading a file only updates its own local SQLite, not this table) - so the Step 4
    // check above can never see a previously-downloaded object as "already synced". Without
    // this guard, calling sync-check twice would enqueue duplicate download_file commands for
    // the same object forever. Until a download-confirmation round trip exists (future fase),
    // dedupe against sync_commands already issued for each device/object pair instead.
    const deviceIds = userDevices.map((d) => d.id);
    const alreadyQueued = new Set<string>();
    if (deviceIds.length > 0) {
      const existingCommands = await db
        .select({ deviceId: syncCommands.deviceId, payload: syncCommands.payload })
        .from(syncCommands)
        .where(and(inArray(syncCommands.deviceId, deviceIds), eq(syncCommands.kind, 'download_file')));

      for (const cmd of existingCommands) {
        const remoteObjectId = (cmd.payload as { remoteObjectId?: string } | null)?.remoteObjectId;
        if (remoteObjectId) {
          alreadyQueued.add(`${cmd.deviceId}:${remoteObjectId}`);
        }
      }
    }

    // Step 6: For each new remote file x each device, insert a sync_command (skip duplicates)
    let enqueuedCount = 0;
    for (const item of newRemoteItems) {
      for (const device of userDevices) {
        if (alreadyQueued.has(`${device.id}:${item.id}`)) continue;

        await db.insert(syncCommands).values({
          deviceId: device.id,
          kind: 'download_file',
          payload: {
            remoteObjectId: item.id,
            fileName: item.name,
          },
        });
        enqueuedCount++;
      }
    }

    return NextResponse.json({
      enqueued: enqueuedCount,
      devices: userDevices.length,
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
