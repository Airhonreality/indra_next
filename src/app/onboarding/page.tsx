import { Suspense } from 'react';
import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export default async function OnboardingPage() {
  const session = await auth();
  if (!session) redirect('/api/auth/signin');

  // Determinar ubicación según el SO
  const getStorageLocation = () => {
    const platform = typeof window !== 'undefined' ? process.platform : 'linux';
    const username = process.env.USER || process.env.USERNAME || 'usuario';
    const userId = session.user?.email?.split('@')[0] || 'user-id';

    if (process.platform === 'win32') {
      return `C:\\Users\\${username}\\Indra Drive\\${userId}`;
    } else if (process.platform === 'darwin') {
      return `/Users/${username}/Indra Drive/${userId}`;
    } else {
      return `/home/${username}/Indra Drive/${userId}`;
    }
  };

  const storageLocation = getStorageLocation();

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-foreground flex flex-col items-center justify-center p-4">
      <Suspense fallback={
        <div className="flex flex-col items-center space-y-4">
          <div className="size-8 border-4 border-primary border-t-transparent animate-spin rounded-full" />
          <p className="text-[10px] uppercase font-bold tracking-[0.4em] text-muted-foreground">
            Iniciando sesión...
          </p>
        </div>
      }>
        <div className="max-w-md w-full space-y-8">
          {/* Header */}
          <div className="text-center space-y-2">
            <div className="text-4xl">✅</div>
            <h1 className="text-3xl font-bold tracking-tight">
              Bienvenido a Indra
            </h1>
            <p className="text-sm text-muted-foreground">
              Tu raíz local está lista para usar
            </p>
          </div>

          {/* Status Card */}
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-2">
                Raíz Local Creada
              </h2>
              <p className="text-xs text-slate-500 break-all font-mono bg-slate-900/50 p-3 rounded">
                {storageLocation}
              </p>
            </div>

            <div className="bg-slate-900/50 rounded p-3 space-y-2">
              <p className="text-xs text-slate-400">
                <span className="font-semibold">incoming/</span>
                {' '}Archivos listos para subir
              </p>
              <p className="text-xs text-slate-400">
                <span className="font-semibold">cache/</span>
                {' '}Cache local de metadatos
              </p>
              <p className="text-xs text-slate-400">
                <span className="font-semibold">thumbnails/</span>
                {' '}Miniaturas de preview
              </p>
            </div>
          </div>

          {/* Next Steps */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-300">Próximos pasos:</h3>
            <ol className="text-xs text-slate-400 space-y-2">
              <li className="flex gap-2">
                <span className="font-bold text-primary">1</span>
                <span>Conecta tus storages (Google Drive, R2, OneDrive, etc)</span>
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-primary">2</span>
                <span>Visualiza tus archivos en el Explorador</span>
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-primary">3</span>
                <span>Empieza a sincronizar contenido</span>
              </li>
            </ol>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-3">
            <Link
              href="/dashboard"
              className="px-4 py-3 bg-primary text-primary-foreground rounded-lg font-semibold text-sm hover:bg-primary/90 transition-colors text-center"
            >
              Ir al Explorador
            </Link>
            <Link
              href="/"
              className="px-4 py-3 bg-slate-700 text-slate-100 rounded-lg font-semibold text-sm hover:bg-slate-600 transition-colors text-center"
            >
              Conectar Storages
            </Link>
          </div>

          {/* Documentation Link */}
          <div className="text-center">
            <a
              href="https://docs.indra.dev"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-slate-400 hover:text-slate-300 transition-colors underline"
            >
              Ver documentación completa →
            </a>
          </div>
        </div>
      </Suspense>
    </main>
  );
}
