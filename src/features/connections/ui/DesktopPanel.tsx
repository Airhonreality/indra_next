'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Download, ExternalLink, MonitorSmartphone, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

type DesktopState = {
  standalone: boolean;
  serviceWorker: boolean;
  installPrompt: boolean;
};

export function DesktopPanel() {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);
  const [state, setState] = useState<DesktopState>({
    standalone: false,
    serviceWorker: false,
    installPrompt: false,
  });
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    const standalone =
      (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches) ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    queueMicrotask(() => {
      setState((prev) => ({ ...prev, standalone }));
    });

    const updateServiceWorkerState = async () => {
      const hasServiceWorker = 'serviceWorker' in navigator;
      const registration = hasServiceWorker ? await navigator.serviceWorker.getRegistration() : null;
      queueMicrotask(() => {
        setState((prev) => ({ ...prev, serviceWorker: hasServiceWorker && !!registration }));
      });
    };

    void updateServiceWorkerState();

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      const nextEvent = event as InstallPromptEvent;
      setPromptEvent(nextEvent);
      setState((prev) => ({ ...prev, installPrompt: true }));
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const statusTone = useMemo(() => {
    if (state.standalone) return 'text-emerald-500';
    if (state.installPrompt) return 'text-sky-500';
    return 'text-zinc-500';
  }, [state.installPrompt, state.standalone]);

  const handleInstall = async () => {
    if (!promptEvent) return;

    setInstalling(true);
    try {
      await promptEvent.prompt();
      await promptEvent.userChoice;
      setPromptEvent(null);
      setState((prev) => ({ ...prev, installPrompt: false }));
    } finally {
      setInstalling(false);
    }
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      <section className="relative overflow-hidden rounded-3xl border border-border/40 bg-card p-6 shadow-xl">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.16),transparent_35%),radial-gradient(circle_at_bottom_left,rgba(16,185,129,0.12),transparent_30%)]" />
        <div className="relative space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.32em] text-primary">
                <Sparkles className="size-3" />
                Desktop Shell
              </div>
              <div className="space-y-1">
                <h3 className="text-2xl font-bold tracking-tight">Indra instalable como app</h3>
                <p className="max-w-2xl text-sm text-muted-foreground">
                  Esta superficie permite instalar Indra en el navegador y ejecutarlo en modo ventana aislada,
                  como una consola de escritorio ligera.
                </p>
              </div>
            </div>
            <div className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.3em] ${statusTone} border-current/20 bg-background/80`}>
              {state.standalone ? 'Instalada' : state.installPrompt ? 'Instalable' : 'Lista'}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <StatusTile
              icon={<MonitorSmartphone className="size-4" />}
              title="Modo ventana"
              body={state.standalone ? 'Se ejecuta como app independiente.' : 'Abre Indra en modo app desde el navegador.'}
            />
            <StatusTile
              icon={<ShieldCheck className="size-4" />}
              title="Service worker"
              body={state.serviceWorker ? 'Registrado y listo para control local.' : 'Se registra al abrir la app.'}
            />
            <StatusTile
              icon={<RefreshCw className="size-4" />}
              title="Actualizaciones"
              body="La web publicada sigue siendo la fuente de distribución."
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              onClick={handleInstall}
              disabled={!promptEvent || installing}
              className="h-11 rounded-xl bg-primary px-4 text-xs font-bold uppercase tracking-[0.28em]"
            >
              <Download className="mr-2 size-4" />
              {installing ? 'Instalando...' : 'Instalar Indra'}
            </Button>
            <a
              href="/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-border/60 bg-background px-4 text-[10px] font-bold uppercase tracking-[0.28em] text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
            >
              <ExternalLink className="size-4" />
              Abrir en ventana nueva
            </a>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-border/40 bg-muted/20 p-6">
        <div className="space-y-4">
          <div className="space-y-1">
            <h4 className="text-lg font-semibold">Qué falta para escritorio nativo</h4>
            <p className="text-sm text-muted-foreground">
              El shell instalable ya existe como PWA. Si más adelante quieres instalador OS-level,
              el siguiente salto es un wrapper nativo.
            </p>
          </div>

          <ul className="space-y-3 text-sm text-muted-foreground">
            <li className="rounded-2xl border border-border/40 bg-background/60 p-4">
              Ventana dedicada con `display: standalone`.
            </li>
            <li className="rounded-2xl border border-border/40 bg-background/60 p-4">
              Registro de service worker para habilitar instalación real en navegador.
            </li>
            <li className="rounded-2xl border border-border/40 bg-background/60 p-4">
              Base para sumar tray, autostart y sync root en una siguiente iteración nativa.
            </li>
          </ul>
        </div>
      </section>
    </div>
  );
}

function StatusTile({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-border/40 bg-background/70 p-4 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.24em] text-foreground">
        <span className="inline-flex size-7 items-center justify-center rounded-full bg-primary/10 text-primary">
          {icon}
        </span>
        {title}
      </div>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}
