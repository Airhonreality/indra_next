/**
 * ☁️ ARTEFACTO: agnostic-dropzone.tsx
 * ────────────
 * CAPA: UI / Atoms (Ingestion Engine)
 * VERSIÓN: 1.1.0
 * COMMIT: P3-M7.1-SYNTAX-REPAIR-UNIFICATION
 * 
 * 🎯 FUNCTIONAL_SCOPE:
 * - Operador de ingesta universal con soporte para Drag & Drop, Explorador Nativo y Clipboard.
 * - Interfaz agnóstica de formatos para evitar bloqueos de galería en dispositivos móviles.
 */

import React, { useState, useRef, useCallback } from 'react';
import { UploadCloud, FileText, X, Cpu } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AgnosticDropzoneProps {
  onFilesAdded: (files: File[]) => void;
  files: File[];
  onRemoveFile: (index: number) => void;
  isUploading?: boolean;
  className?: string;
}

export function AgnosticDropzone({
  onFilesAdded,
  files,
  onRemoveFile,
  isUploading,
  className
}: AgnosticDropzoneProps) {
  const [isDragActive, setIsDragActive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback((newFiles: FileList | File[]) => {
    setIsProcessing(true);
    const validFiles = Array.from(newFiles);
    
    // Simulate structural analysis/checksum
    setTimeout(() => {
      onFilesAdded(validFiles);
      setIsProcessing(false);
    }, 600);
  }, [onFilesAdded]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(false);
    if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
  };

  const onPaste = (e: React.ClipboardEvent) => {
    if (e.clipboardData.files.length > 0) handleFiles(e.clipboardData.files);
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) handleFiles(e.target.files);
  };

  const triggerPicker = () => fileInputRef.current?.click();

  return (
    <div className="space-y-4 w-full">
      <div 
        onDragOver={(e) => { e.preventDefault(); setIsDragActive(true); }}
        onDragLeave={() => setIsDragActive(false)}
        onDrop={onDrop}
        onPaste={onPaste}
        className={cn(
          "group relative w-full h-40 rounded-[2rem] border-2 border-dashed transition-all duration-500 overflow-hidden flex flex-col items-center justify-center cursor-pointer",
          isDragActive ? "border-primary bg-primary/5 scale-[0.99] shadow-inner" : "border-border hover:border-primary/40 hover:bg-muted/30",
          isUploading ? "opacity-50 pointer-events-none" : "",
          className
        )}
        onClick={triggerPicker}
      >
        <input 
          ref={fileInputRef}
          type="file" 
          multiple
          className="hidden" 
          onChange={onFileChange}
        />

        {isProcessing ? (
          <div className="flex flex-col items-center gap-3 animate-in fade-in zoom-in duration-300">
             <Cpu className="size-8 text-primary animate-pulse" />
             <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">Analizando Activos...</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <UploadCloud className={cn(
              "size-8 text-muted-foreground transition-all duration-500 group-hover:scale-110 group-hover:text-primary",
              isDragActive && "scale-125 text-primary animate-bounce"
            )} />
            <div className="text-center">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-foreground/80">
                Depósito de Activos Digitales
              </p>
              <p className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground/60">
                Arrastra, Pega o Selecciona // Sin Límites
              </p>
            </div>
          </div>
        )}

        {/* Shimmer overlay for active processing */}
        {isDragActive && (
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/5 to-transparent -translate-x-full animate-shimmer" />
        )}
      </div>

      {/* ASSET LIST (HIGH DENSITY) */}
      {files.length > 0 && (
        <div className="grid grid-cols-1 gap-2 animate-in fade-in slide-in-from-top-2 duration-500">
          {files.map((file, idx) => (
            <div key={`${file.name}-${idx}`} className="flex items-center gap-3 p-3 bg-muted/20 border border-border/50 rounded-2xl group/item relative">
              <div className="size-8 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/10">
                <FileText className="size-4 text-primary" />
              </div>
              <div className="flex flex-col overflow-hidden text-left flex-1">
                <span className="text-[10px] font-bold truncate pr-8">{file.name}</span>
                <span className="text-[8px] font-mono opacity-40 uppercase tracking-tighter">
                  {(file.size / 1024 / 1024).toFixed(2)} MB // {file.type || 'RAW_BIN'}
                </span>
              </div>
              {!isUploading && (
                <button 
                  onClick={(e) => { e.stopPropagation(); onRemoveFile(idx); }}
                  className="absolute right-3 p-1.5 rounded-lg hover:bg-destructive/10 hover:text-destructive opacity-0 group-hover/item:opacity-100 transition-all"
                >
                  <X className="size-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
