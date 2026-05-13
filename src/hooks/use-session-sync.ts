import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useIndraStore } from '@/stores/indra-store';

/**
 * Mounts once in AgnosticConsoleShell.
 * Reads from next-auth useSession and writes userId + status into the Zustand store,
 * so domain hooks (useConnections, useIntegrationState) can read session identity
 * without each needing to call useSession() independently.
 */
export function useSessionSync() {
  const { data: session, status } = useSession();
  const setSession = useIndraStore((s) => s.setSession);

  useEffect(() => {
    setSession(session?.user?.id ?? null, status);
  }, [session?.user?.id, status, setSession]);

  return { session, status };
}
