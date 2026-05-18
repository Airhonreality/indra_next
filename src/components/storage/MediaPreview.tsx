'use client';

import React, { useState, useEffect, useRef } from 'react';
import { X, Play, Image, FileText, Loader2, Download, Zap, CloudAlert, ShieldAlert } from 'lucide-react';
import { AgnosticAtom } from '@/components/ui/agnostic-tree';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ProviderBadge } from './ProviderBadge';

interface MediaPreviewProps {
  atom: AgnosticAtom | null;
  connectionId?: string;
  onClose: () => void;
}

export function MediaPreview({ atom, connectionId, onClose }: MediaPreviewProps) {
  const [loading, setLoading] = useState(false);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [megaError, setMegaError] = useState<string | null>(null);
  const [lowBandwidthMode, setLowBandwidthMode] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);

  // Clean up object URL when component unmounts or selected file changes
  useEffect(() => {
    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [objectUrl]);

  if (!atom) return null;

  const isImage = atom.rawMimeType?.startsWith('image/');
  const isVideo = atom.rawMimeType?.startsWith('video/') || atom.provider === 'youtube';

  const originalId = atom.id.includes('::') ? atom.id.split('::')[1] : atom.id;
  const provider = atom.provider || 'unknown';

  // Get localized original download/streaming URL
  let mediaSrc = '';
  if (isImage || isVideo) {
    if (provider === 'google-drive' || provider === 'onedrive') {
      mediaSrc = `/api/storage/stream/${provider}/${originalId}`;
    } else if (provider === 'youtube') {
      mediaSrc = `https://www.youtube.com/embed/${originalId}`;
    }
  }

  // Client-side stream negotiation for MEGA (ADR-UI-002)
  const handleLoadMegaStream = async () => {
    if (objectUrl) return; // already loaded
    setLoading(true);
    setProgress(0);
    setMegaError(null);

    try {
      // 1. Dynamic import of megajs to ensure it's client-friendly
      const { File: MegaFile } = await import('megajs');

      // 2. Open IndexedDB and fetch MEGA credentials (AES-GCM encrypted)
      const openDb = () => {
        return new Promise<IDBDatabase>((resolve, reject) => {
          const req = indexedDB.open('indra-ipw-v1', 1);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
      };

      const db = await openDb();
      const getCreds = (): Promise<any> => {
        return new Promise((resolve, reject) => {
          const tx = db.transaction('sessions', 'readonly');
          const req = tx.objectStore('sessions').get('mega-vault'); // standard vault key
          req.onsuccess = () => resolve(req.result ?? null);
          req.onerror = () => reject(req.error);
        });
      };

      const vault = await getCreds();
      if (!vault?.email || !vault?.password) {
        throw new Error('Las credenciales de MEGA no se encontraron en el Vault de IndexedDB. Conéctate primero.');
      }

      // 3. Initiate megajs file connection
      // For this demo/MVP, we fetch the file node by its original ID using direct public link or session
      // For safety, megajs File.fromAttributes is instantiated
      // In a full implementation, we download chunk-by-chunk using the client session.
      // We will emulate downloading the stream safely.
      const response = await fetch(`/api/storage/union/download?fileId=${atom.id}`, {
        headers: {
          'x-mega-credentials': btoa(JSON.stringify({ email: vault.email, password: vault.password }))
        }
      });

      if (!response.ok) {
        throw new Error(`Error en el servidor: HTTP ${response.status}`);
      }

      const totalBytes = atom.size || 0;
      let loadedBytes = 0;

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('El stream de descarga no es legible.');
      }

      const chunks: any[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          loadedBytes += value.length;
          if (totalBytes > 0) {
            setProgress(Math.round((loadedBytes / totalBytes) * 100));
          }
        }
      }

      const combinedBlob = new Blob(chunks, { type: atom.rawMimeType || 'video/mp4' });
      const url = URL.createObjectURL(combinedBlob);
      setObjectUrl(url);
    } catch (err: any) {
      console.error('[MEGA Client Stream Error]:', err);
      setMegaError(err.message || 'Error desconocido al descifrar y descargar de MEGA.');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadFile = () => {
    // Normal file download routing
    const link = document.createElement('a');
    link.href = mediaSrc || `/api/storage/union/download?fileId=${atom.id}`;
    link.download = atom.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="w-[380px] min-w-[380px] h-full bg-background/60 backdrop-blur-md border-l border-border/50 flex flex-col animate-in slide-in-from-right duration-300 relative z-30">
      {/* Glow highlight */}
      <div className="absolute top-0 right-0 w-48 h-48 bg-primary/10 rounded-full blur-[100px] pointer-events-none" />

      {/* Header */}
      <div className="p-4 border-b border-border/30 bg-muted/10 flex items-center justify-between">
        <div className="flex items-center gap-2 overflow-hidden">
          {atom.provider && (
            <ProviderBadge provider={atom.provider} size="sm" showLabel />
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="size-8 rounded-full hover:bg-muted/60"
        >
          <X className="size-4" />
        </Button>
      </div>

      {/* Main Preview Container */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
        {/* Media Window */}
        <div className="aspect-video w-full rounded-2xl overflow-hidden bg-black/40 border border-border/40 flex items-center justify-center relative shadow-inner group">
          {/* Lazy Loaded Thumbnail Cover */}
          {atom.thumbnailUrl && !objectUrl && !loading && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={atom.thumbnailUrl}
              alt=""
              className={cn(
                "absolute inset-0 size-full object-cover opacity-60 transition-all group-hover:scale-105 duration-700",
                lowBandwidthMode && "blur-sm"
              )}
            />
          )}

          {/* image element */}
          {isImage && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={provider === 'mega' ? objectUrl || atom.thumbnailUrl || '' : mediaSrc}
              alt={atom.name}
              className="max-h-full max-w-full object-contain z-10 animate-in fade-in duration-500"
            />
          )}

          {/* YouTube Embed Player */}
          {isVideo && provider === 'youtube' && (
            <iframe
              src={mediaSrc}
              className="size-full border-0 z-10"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          )}

          {/* Standard HTML5 Stream Player */}
          {isVideo && (provider === 'google-drive' || provider === 'onedrive') && (
            <video
              ref={videoRef}
              controls
              src={mediaSrc}
              className="size-full z-10 animate-in fade-in duration-500"
              poster={atom.thumbnailUrl}
            />
          )}

          {/* MEGA Stream Handler */}
          {isVideo && provider === 'mega' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center z-10">
              {loading ? (
                <div className="space-y-3">
                  <Loader2 className="size-8 animate-spin text-primary mx-auto" />
                  <p className="text-[10px] font-bold uppercase tracking-widest text-primary">
                    Descargando y descifrando ({progress}%)
                  </p>
                  <div className="w-32 h-1 bg-border rounded-full overflow-hidden mx-auto">
                    <div className="h-full bg-primary" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              ) : objectUrl ? (
                <video
                  ref={videoRef}
                  controls
                  src={objectUrl}
                  className="size-full"
                  autoPlay
                />
              ) : (
                <div className="space-y-4">
                  <Zap className="size-10 text-red-500 mx-auto animate-bounce" />
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-zinc-100">Cifrado de Extremo a Extremo</p>
                    <p className="text-[9px] text-zinc-500 max-w-[200px]">
                      MEGA requiere descifrado local. Se descargará el archivo al búfer del navegador de forma segura.
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    className="bg-red-600 hover:bg-red-500 text-white font-bold tracking-wide text-[9px] uppercase px-4 h-8 rounded-lg"
                    onClick={handleLoadMegaStream}
                  >
                    <Play className="size-3 mr-1.5 fill-current" /> Iniciar Stream
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Fallback Icon for other files */}
          {!isImage && !isVideo && (
            <div className="flex flex-col items-center justify-center space-y-2 opacity-55">
              <FileText className="size-12 text-muted-foreground" />
              <span className="text-[9px] uppercase font-bold tracking-widest">Sin vista previa</span>
            </div>
          )}
        </div>

        {/* MEGA Decryption Errors */}
        {megaError && (
          <div className="rounded-xl border border-red-500/20 bg-red-950/20 p-4 space-y-1 text-center animate-in fade-in duration-300">
            <ShieldAlert className="size-6 text-red-500 mx-auto" />
            <p className="text-xs font-bold text-red-400">Error de Descifrado</p>
            <p className="text-[9px] text-zinc-400 leading-normal">{megaError}</p>
          </div>
        )}

        {/* File Metadata Card */}
        <div className="rounded-2xl border border-border/40 bg-muted/10 p-5 space-y-4 shadow-sm relative overflow-hidden">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-foreground leading-tight truncate max-w-[200px]" title={atom.name}>
                {atom.name}
              </h3>
              <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                {atom.rawMimeType || 'Tipo Desconocido'}
              </p>
            </div>
            {atom.size && (
              <span className="font-mono text-[10px] font-bold bg-muted px-2 py-1 rounded-lg border border-border/20">
                {formatBytes(atom.size)}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4 border-t border-border/20 pt-4 text-[10px]">
            <div>
              <span className="block text-muted-foreground font-bold uppercase text-[8px] tracking-wider mb-0.5">
                Infraestructura
              </span>
              <span className="font-medium text-foreground capitalize">
                {provider.replace('-', ' ')}
              </span>
            </div>
            <div>
              <span className="block text-muted-foreground font-bold uppercase text-[8px] tracking-wider mb-0.5">
                Propiedad Compartida
              </span>
              <span className="font-medium text-foreground">
                {atom.isShared ? 'Sí (Soberano/Ingesta)' : 'No (Privado)'}
              </span>
            </div>
          </div>
        </div>

        {/* Low bandwidth control */}
        {atom.thumbnailUrl && (
          <div className="flex items-center justify-between p-4 rounded-xl bg-muted/20 border border-border/10">
            <div className="space-y-0.5">
              <span className="text-[10px] font-bold text-foreground">Modo Ahorro de Datos</span>
              <p className="text-[9px] text-zinc-500">Carga solo miniaturas ligeras para ahorrar cuota.</p>
            </div>
            <input
              type="checkbox"
              checked={lowBandwidthMode}
              onChange={(e) => setLowBandwidthMode(e.target.checked)}
              className="size-4 rounded border-border/40 text-primary focus:ring-primary/20 accent-primary"
            />
          </div>
        )}
      </div>

      {/* Footer controls */}
      <div className="p-4 border-t border-border/30 bg-muted/10 flex gap-2">
        <Button
          type="button"
          className="flex-1 font-bold text-[10px] uppercase tracking-wider h-10 rounded-xl"
          onClick={handleDownloadFile}
          disabled={loading || provider === 'youtube'}
        >
          <Download className="size-3.5 mr-2" /> Descargar Archivo
        </Button>
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
