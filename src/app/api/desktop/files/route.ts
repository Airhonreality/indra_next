/**
 * Local Daemon File Listing Endpoint
 *
 * GET /api/desktop/files
 * Pulls the current file snapshot known to the local indra-daemon (via gRPC Pull) and
 * returns it sorted by most-recently-modified first, with a BLAKE3 hex digest per file
 * so callers can verify integrity without re-reading the file themselves.
 *
 * This is the REST endpoint referenced by the local usage test in
 * docs/plans/24_PLAN_verificacion-e2e-storage.md (Fase 3/5). Scope: the daemon must be
 * reachable from THIS machine (127.0.0.1:50051) — see that plan for the hosted-cloud gap.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { daemonPullFiles, isDaemonReachable } from '@/lib/daemon-client';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const reachable = await isDaemonReachable();
  if (!reachable) {
    return NextResponse.json(
      {
        error: 'daemon_unreachable',
        message: 'indra-daemon not reachable on 127.0.0.1:50051.',
      },
      { status: 503 }
    );
  }

  try {
    const result = await daemonPullFiles();

    const files = result.events
      .filter((event) => event.file !== null)
      .map((event) => {
        const file = event.file!;
        const chunk = file.chunks[0];
        return {
          path: file.path,
          sizeBytes: Number(file.size),
          modifiedAtMs: Number(file.modifiedTimeMs),
          modifiedAt: new Date(Number(file.modifiedTimeMs)).toISOString(),
          blake3Hex: chunk ? chunk.digest.toString('hex') : null,
          eventType: event.type,
        };
      })
      .sort((a, b) => b.modifiedAtMs - a.modifiedAtMs);

    return NextResponse.json({
      files,
      count: files.length,
      queriedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[desktop/files] Pull failed:', error);
    return NextResponse.json(
      {
        error: 'pull_failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 502 }
    );
  }
}
