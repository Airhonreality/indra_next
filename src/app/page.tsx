import { Suspense } from 'react';
import { AgnosticConsoleShell } from '@/features/connections/ui/AgnosticConsoleShell';
import { auth } from "@/auth";

export default async function DashboardPage() {
  const session = await auth();
  
  return (
    <main className="min-h-screen bg-background text-foreground">
      <Suspense fallback={
        <div className="fixed inset-0 flex flex-col items-center justify-center space-y-4 bg-background z-50">
          <div className="size-8 border-4 border-primary border-t-transparent animate-spin rounded-full" />
          <p className="text-[10px] uppercase font-bold tracking-[0.4em] text-muted-foreground animate-pulse">Initializing Sovereign Console...</p>
        </div>
      }>
        <AgnosticConsoleShell />
      </Suspense>
    </main>
  );
}
