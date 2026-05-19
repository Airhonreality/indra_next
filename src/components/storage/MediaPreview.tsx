'use client';

import React, { useState, useRef } from 'react';
import { X, FileText, Download } from 'lucide-react';
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
  const [lowBandwidthMode, setLowBandwidthMode] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  if (!atom) return null;

  const isImage = atom.rawMimeType?.startsWith('image/');
  const isVideo = atom.rawMimeType?.startsWith('video/') || atom.provider === 'youtube';
  const provider = atom.provider || 'unknown';

  // Get unified streaming/download URL from contract
  const mediaSrc = atom.streamUrl || '';

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
          {atom.thumbnailUrl && (
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
              src={mediaSrc}
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

          {/* Standard HTML5 Stream Player (Agnostic for Google Drive, MEGA, OneDrive, etc.) */}
          {isVideo && provider !== 'youtube' && (
            <video
              ref={videoRef}
              controls
              src={mediaSrc}
              preload="metadata"
              className="size-full z-10 animate-in fade-in duration-500"
              poster={atom.thumbnailUrl}
            />
          )}

          {/* Fallback Icon for other files */}
          {!isImage && !isVideo && (
            <div className="flex flex-col items-center justify-center space-y-2 opacity-55">
              <FileText className="size-12 text-muted-foreground" />
              <span className="text-[9px] uppercase font-bold tracking-widest">Sin vista previa</span>
            </div>
          )}
        </div>

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
          disabled={provider === 'youtube'}
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
