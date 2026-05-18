import { Suspense } from 'react';
import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { AgnosticConsoleShell } from '@/features/connections/ui/AgnosticConsoleShell';
import { StorageWidget } from '@/components/storage/StorageWidget';

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect('/api/auth/signin');

  return (
    <main className="min-h-screen bg-background text-foreground">
      <Suspense fallback={
        <div className="fixed inset-0 flex flex-col items-center justify-center space-y-4 bg-background z-50">
          <div className="size-8 border-4 border-primary border-t-transparent animate-spin rounded-full" />
          <p className="text-[10px] uppercase font-bold tracking-[0.4em] text-muted-foreground animate-pulse">
            Initializing Sovereign Console...
          </p>
        </div>
      }>
        <AgnosticConsoleShell
          storageSlot={
            <Suspense fallback={
              <div className="h-64 bg-zinc-900/20 animate-pulse rounded-2xl border border-zinc-800" />
            }>
              <StorageWidget />
            </Suspense>
          }
        />
      </Suspense>
    </main>
  );
}
