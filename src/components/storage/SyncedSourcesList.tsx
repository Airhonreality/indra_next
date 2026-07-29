'use client';

import { FolderOpen, Cloud, Database, HardDrive } from 'lucide-react';

type SyncedSource = {
  provider: string;
  connection: string;
  label: string;
  localPath: string;
};

interface SyncedSourcesListProps {
  sources: SyncedSource[];
  isLoading?: boolean;
}

const PROVIDER_ICONS: Record<string, React.ReactNode> = {
  google_drive: <Cloud className="size-4 text-blue-500" />,
  r2: <Database className="size-4 text-amber-500" />,
  s3: <Database className="size-4 text-orange-500" />,
  mega: <Cloud className="size-4 text-red-500" />,
  onedrive: <Cloud className="size-4 text-cyan-500" />,
  storage: <HardDrive className="size-4 text-slate-500" />,
};

const PROVIDER_LABELS: Record<string, string> = {
  google_drive: 'Google Drive',
  r2: 'R2 Cloudflare',
  s3: 'Amazon S3',
  mega: 'Mega',
  onedrive: 'OneDrive',
  storage: 'Almacenamiento Local',
};

export function SyncedSourcesList({ sources, isLoading }: SyncedSourcesListProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 rounded-lg bg-muted/30 animate-pulse" />
        ))}
      </div>
    );
  }

  if (sources.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border/40 bg-muted/20 p-6 text-center">
        <FolderOpen className="mx-auto size-8 text-muted-foreground/50 mb-2" />
        <p className="text-sm text-muted-foreground">
          No hay almacenamientos sincronizados. Conecta un provider desde "Conexiones".
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {sources.map((source) => (
        <div
          key={source.connection}
          className="rounded-lg border border-border/40 bg-card p-4 hover:bg-muted/50 transition-colors"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="flex-shrink-0">
                {PROVIDER_ICONS[source.provider] || (
                  <Cloud className="size-4 text-foreground/60" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-sm truncate">
                    {source.label}
                  </p>
                  <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary flex-shrink-0">
                    {PROVIDER_LABELS[source.provider] || source.provider}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1 break-all">
                  {source.localPath}
                </p>
              </div>
            </div>
            <button className="flex-shrink-0 px-3 py-1.5 text-xs font-medium rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
              Abrir
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
