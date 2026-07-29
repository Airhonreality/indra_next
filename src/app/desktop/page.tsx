import { Suspense } from 'react';
import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { DesktopPanel } from '@/features/connections/ui/DesktopPanel';

export const metadata = {
  title: 'Estado de escritorio',
  description: 'Panel de administración de la raíz local de trabajo y del bridge de storage.',
};

export default async function DesktopPage() {
  const session = await auth();
  if (!session) redirect('/api/auth/signin');

  return (
    <main className="min-h-screen bg-background text-foreground">
      <Suspense
        fallback={
          <div className="fixed inset-0 flex flex-col items-center justify-center space-y-4 bg-background z-50">
            <div className="size-8 border-4 border-primary border-t-transparent animate-spin rounded-full" />
            <p className="text-[10px] uppercase font-bold tracking-[0.4em] text-muted-foreground animate-pulse">
              Cargando estado de storage...
            </p>
          </div>
        }
      >
        <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-6">
          <DesktopPanel />
        </div>
      </Suspense>
    </main>
  );
}
