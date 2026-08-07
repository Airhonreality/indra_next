/**
 * Native Bridge Status Endpoint
 *
 * GET /api/desktop/bridge
 * Returns the current status of the local indra-daemon (gRPC on 127.0.0.1:50051).
 *
 * Scope: only detects a daemon running on the SAME machine as this Next.js process.
 * See docs/plans/24_PLAN_verificacion-e2e-storage.md for the multi-device/hosted-cloud gap.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { resolveDesktopRootPath } from '@/lib/desktop-root';
import { NativeBridgeStatusSchema } from '@/lib/native-bridge-schema';
import { isDaemonReachable, daemonHeartbeat } from '@/lib/daemon-client';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const reachable = await isDaemonReachable();
    const heartbeat = reachable ? await daemonHeartbeat('indra-next-web') : null;
    const isRunning = reachable && heartbeat?.acknowledged === true;

    const status = {
      capability: (isRunning ? 'cfapi-windows' : 'none') as 'cfapi-windows' | 'none',
      isRunning,
      lastCheck: new Date().toISOString(),
      rootPath: resolveDesktopRootPath(session.user.id),
      syncStatus: (isRunning ? 'idle' : 'error') as 'idle' | 'error',
      message: isRunning
        ? 'indra-daemon reachable on 127.0.0.1:50051.'
        : 'indra-daemon not reachable on 127.0.0.1:50051 (not installed, not running, or on a different machine).',
    };

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
