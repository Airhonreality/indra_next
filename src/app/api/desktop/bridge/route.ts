/**
 * Native Bridge Status Endpoint
 *
 * GET /api/desktop/bridge
 * Returns the current status of the native bridge daemon.
 *
 * TODAY: Always returns { capability: 'none', isRunning: false, ... }
 * FUTURE: Will check if daemon is running at localhost:9876 (Windows) or /tmp/indra-storage-fuse.sock (Linux)
 */

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { resolveDesktopRootPath } from '@/lib/desktop-root';
import { NativeBridgeStatusSchema } from '@/lib/native-bridge-schema';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // TODAY: Always return 'none' status with placeholder message
    // FUTURE: This will:
    // 1. Detect platform (Windows vs Linux)
    // 2. Check if daemon is running:
    //    - Windows: TCP connection to localhost:9876
    //    - Linux: Check /tmp/indra-storage-fuse.sock or /run/user/{uid}/indra-storage-fuse.sock
    // 3. Query daemon for actual status
    // 4. Return parsed and validated response

    const status = {
      capability: 'none' as const,
      isRunning: false,
      lastCheck: new Date().toISOString(),
      rootPath: resolveDesktopRootPath(session.user.id),
      syncStatus: 'idle' as const,
      message:
        'Native bridge not yet implemented. ' +
        'See docs/architecture/native-bridge-architecture.md for integration details.',
    };

    // Validate response against schema
    const validated = NativeBridgeStatusSchema.parse(status);

    return NextResponse.json(validated);
  } catch (error) {
    console.error('[native-bridge] Bridge status check failed:', error);
    return NextResponse.json(
      {
        error: 'Failed to check native bridge status',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
