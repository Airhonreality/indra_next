'use client';

/**
 * REACTOR UI — Public Ingestion Client
 *
 * Implements the full IPW spec:
 *  - Drag & drop Reactor zone with perimetral pulse animation
 *  - Sovereign Cards (per-file) with chunk-level progress
 *  - Smart-Match via IndexedDB (resume interrupted sessions)
 *  - Screen Wake Lock API (prevents display sleep during upload)
 *  - Tab Visibility detection (Reactor Alert state on focus loss)
 *  - Sequential peristaltic upload via SME SovereignPipeline
 *  - Dynamic form from port schema (Zero-hardcoding)
 *  - Cognitive alerts: volume warnings, night mode suggestion
 */

import { useReducer, useCallback, useEffect, useRef, useState, DragEvent } from 'react';
import type { IntegrityManifest, MediaMetadata, ChunkDescriptor, PipelineUploadAdapter, MediaOperationResult, UploadContext } from '@/core/media/types';
import type { PortFieldSchema, PortConfig } from '@/core/db/schema';
import { IntegrityEngine } from '@/core/media/integrity';
import { SovereignPipeline } from '@/core/media/pipeline';

// ─── Types ────────────────────────────────────────────────────────────────────

type FileStatus =
  | 'queued'
  | 'hashing'
  | 'analyzing'
  | 'uploading'
  | 'verifying'
  | 'done'
  | 'error'
  | 'paused';

interface FileEntry {
  sovereignId: string;
  file: File;
  status: FileStatus;
  manifest?: IntegrityManifest;
  metadata?: MediaMetadata;
  thumbnail: string | null;
  uploadedChunks: number;
  totalChunks: number;
  errorMessage?: string;
  recoveryHint?: string;
  bytesPerSec?: number;
}

type ReactorMode = 'idle' | 'active' | 'alert' | 'complete';

interface State {
  files: FileEntry[];
  formValues: Record<string, unknown>;
  reactor: ReactorMode;
  alerts: string[];
}

type Action =
  | { type: 'ADD_FILES'; entries: FileEntry[] }
  | { type: 'PATCH_FILE'; sovereignId: string; patch: Partial<FileEntry> }
  | { type: 'REMOVE_FILE'; sovereignId: string }
  | { type: 'SET_FORM'; key: string; value: unknown }
  | { type: 'SET_REACTOR'; mode: ReactorMode }
  | { type: 'ADD_ALERT'; msg: string }
  | { type: 'DISMISS_ALERT'; msg: string }
  | { type: 'CLEAR_ALL' };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'ADD_FILES':
      return {
        ...state,
        files: [
          ...state.files.filter(f => !action.entries.find(e => e.sovereignId === f.sovereignId)),
          ...action.entries,
        ],
      };
    case 'PATCH_FILE':
      return {
        ...state,
        files: state.files.map(f =>
          f.sovereignId === action.sovereignId ? { ...f, ...action.patch } : f
        ),
      };
    case 'REMOVE_FILE': {
      const entry = state.files.find(f => f.sovereignId === action.sovereignId);
      if (entry?.thumbnail) URL.revokeObjectURL(entry.thumbnail);
      return { ...state, files: state.files.filter(f => f.sovereignId !== action.sovereignId) };
    }
    case 'SET_FORM':
      return { ...state, formValues: { ...state.formValues, [action.key]: action.value } };
    case 'SET_REACTOR':
      return { ...state, reactor: action.mode };
    case 'ADD_ALERT':
      return { ...state, alerts: [...new Set([...state.alerts, action.msg])] };
    case 'DISMISS_ALERT':
      return { ...state, alerts: state.alerts.filter(a => a !== action.msg) };
    case 'CLEAR_ALL':
      state.files.forEach(f => { if (f.thumbnail) URL.revokeObjectURL(f.thumbnail); });
      return { ...state, files: [], alerts: [], reactor: 'idle' };
    default:
      return state;
  }
}

// ─── IndexedDB session store ──────────────────────────────────────────────────

interface StoredSession {
  sovereignId: string;
  sessionId: string;
  resumableUri?: string; // ← Paso 1: Persistir la URI de sesión de Drive
  uploadedChunks: number[];
  manifest?: IntegrityManifest;
  formValues?: Record<string, unknown>; // ← Paso 5: Persistir metadatos
  savedAt: number; // ← Paso 5: TTL para limpieza
}

async function openIdb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open('indra-ipw-v1', 1);
    req.onupgradeneeded = () =>
      req.result.createObjectStore('sessions', { keyPath: 'sovereignId' });
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

async function loadIdbSession(sovereignId: string): Promise<StoredSession | null> {
  try {
    const db = await openIdb();
    return new Promise((res, rej) => {
      const req = db.transaction('sessions', 'readonly').objectStore('sessions').get(sovereignId);
      req.onsuccess = () => res(req.result ?? null);
      req.onerror = () => rej(req.error);
    });
  } catch { return null; }
}

async function saveIdbSession(session: StoredSession): Promise<void> {
  try {
    const db = await openIdb();
    await new Promise<void>((res, rej) => {
      const tx = db.transaction('sessions', 'readwrite');
      tx.objectStore('sessions').put(session);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  } catch { /* non-fatal */ }
}

async function deleteIdbSession(sovereignId: string): Promise<void> {
  try {
    const db = await openIdb();
    await new Promise<void>((res, rej) => {
      const tx = db.transaction('sessions', 'readwrite');
      tx.objectStore('sessions').delete(sovereignId);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  } catch { /* non-fatal */ }
}

// ─── Sovereign File ID ────────────────────────────────────────────────────────

function sovereignId(file: File): string {
  // Axioma: ID único basado en identidad binaria superficial para Smart-Match
  return btoa(`${file.name}:${file.size}:${file.lastModified}`).replace(/[=+/]/g, '');
}

/**
 * PASO 5: Limpieza de sesiones antiguas (> 7 días)
 */
async function cleanupOldSessions(): Promise<void> {
  const db = await openIdb();
  const tx = db.transaction('sessions', 'readwrite');
  const store = tx.objectStore('sessions');
  const now = Date.now();
  const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

  return new Promise((res) => {
    store.openCursor().onsuccess = (e) => {
      const cursor = (e.target as IDBRequest).result;
      if (cursor) {
        if (now - cursor.value.savedAt > SEVEN_DAYS) cursor.delete();
        cursor.continue();
      } else {
        res();
      }
    };
  });
}

// ─── HTTP Pipeline Adapter ────────────────────────────────────────────────────

function makePortAdapter(
  slug: string, 
  formValues: Record<string, unknown>,
  resumableUri?: string // ← Paso 1: Recibir URI de Drive
): PipelineUploadAdapter {
  return {
    async uploadChunk(chunk: Uint8Array, descriptor: ChunkDescriptor, sessionId: string, context: UploadContext): Promise<MediaOperationResult<{ etag?: string }>> {
      const start = Date.now();
      try {
        const headers: Record<string, string> = {
          'content-type': 'application/octet-stream',
          'x-session-id': sessionId,
          'x-chunk-index': String(descriptor.index),
          'x-chunk-hash': descriptor.hash,
        };

        // PASO 1: Inyectar headers de sesión resumible si existen
        if (resumableUri) {
          headers['x-resumable-uri'] = resumableUri;
          headers['x-byte-range-start'] = String(descriptor.offset);
          headers['x-file-size'] = String(context.fileSize);
        }

        const res = await fetch(`/api/p/${slug}/upload`, {
          method: 'POST',
          headers,
          body: chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength) as ArrayBuffer,
        });
        if (!res.ok) {
          const msg = await res.text().catch(() => `HTTP ${res.status}`);
          return {
            ok: false,
            error: { code: 'CHUNK_UPLOAD_FAILED', message: msg, chunkIndex: descriptor.index, recoveryHint: 'Check network and retry.' },
            durationMs: Date.now() - start,
          };
        }
        return { ok: true, data: {}, durationMs: Date.now() - start };
      } catch (err) {
        return {
          ok: false,
          error: { code: 'CHUNK_UPLOAD_FAILED', message: String(err), chunkIndex: descriptor.index, recoveryHint: 'Check network connectivity.' },
          durationMs: Date.now() - start,
        };
      }
    },
    async finalizeSession(sessionId: string, manifest: IntegrityManifest): Promise<MediaOperationResult<{ url?: string }>> {
      const start = Date.now();
      try {
        const res = await fetch(`/api/p/${slug}/finalize`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sessionId, manifest, formValues }),
        });
        if (!res.ok) {
          return {
            ok: false,
            error: { code: 'CHUNK_UPLOAD_FAILED', message: `Finalize HTTP ${res.status}`, recoveryHint: 'Retry finalization.' },
            durationMs: Date.now() - start,
          };
        }
        const data = await res.json();
        return { ok: true, data, durationMs: Date.now() - start };
      } catch (err) {
        return {
          ok: false,
          error: { code: 'CHUNK_UPLOAD_FAILED', message: String(err), recoveryHint: 'Retry finalization.' },
          durationMs: Date.now() - start,
        };
      }
    },
  };
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function fmtSpeed(bps: number): string {
  return `${(bps / (1024 ** 2)).toFixed(1)} MB/s`;
}

function estimatedTime(entry: FileEntry): string {
  if (!entry.bytesPerSec || entry.bytesPerSec === 0) return '—';
  
  // PASO 6: Usar el tamaño de chunk real del manifiesto
  const chunkSize = entry.manifest?.chunkSize || 4 * 1024 * 1024;
  const remaining = (entry.totalChunks - entry.uploadedChunks) * chunkSize;
  
  const secs = remaining / entry.bytesPerSec;
  if (secs < 60) return `${Math.ceil(secs)}s`;
  return `${Math.ceil(secs / 60)}m`;
}

const STATUS_COLOR: Record<FileStatus, string> = {
  queued:    'bg-zinc-700 text-zinc-300',
  hashing:   'bg-amber-900/60 text-amber-300',
  analyzing: 'bg-purple-900/60 text-purple-300',
  uploading: 'bg-cyan-900/60 text-cyan-300',
  verifying: 'bg-blue-900/60 text-blue-300',
  done:      'bg-emerald-900/60 text-emerald-400',
  error:     'bg-red-900/60 text-red-400',
  paused:    'bg-yellow-900/60 text-yellow-300',
};

const STATUS_LABEL: Record<FileStatus, string> = {
  queued:    'EN COLA',
  hashing:   'VERIFICANDO',
  analyzing: 'ANALIZANDO',
  uploading: 'SUBIENDO',
  verifying: 'VERIFICANDO',
  done:      'OK EN SILO',
  error:     'ERROR',
  paused:    'PAUSADO',
};

// ─── Sovereign Card ───────────────────────────────────────────────────────────

function SovereignCard({
  entry,
  onRemove,
  onRetry, // ← Paso 7: Prop de reintento
}: {
  entry: FileEntry;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
}) {
  const pct = entry.totalChunks > 0
    ? Math.round((entry.uploadedChunks / entry.totalChunks) * 100)
    : 0;

  const isActive = entry.status === 'uploading';
  const isDone = entry.status === 'done';
  const isError = entry.status === 'error';

  return (
    <div
      className={[
        'rounded-xl border p-4 space-y-3 transition-all duration-300',
        isDone  ? 'border-emerald-500/40 bg-emerald-950/20' :
        isError ? 'border-red-500/30 bg-red-950/20' :
        isActive ? 'border-cyan-500/40 bg-cyan-950/10' :
                  'border-zinc-700/50 bg-zinc-900/40',
      ].join(' ')}
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        {/* Thumbnail */}
        <div className="shrink-0 size-12 rounded-lg overflow-hidden bg-zinc-800 flex items-center justify-center border border-zinc-700/50">
          {entry.thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={entry.thumbnail} alt="" className="size-full object-cover" />
          ) : (
            <FileIcon mimeType={entry.file.type} />
          )}
        </div>

        {/* Name + meta */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-zinc-100 truncate">{entry.file.name}</p>
          <p className="text-xs font-mono text-zinc-500 mt-0.5">
            {fmtBytes(entry.file.size)}
            {entry.metadata?.video?.codec && ` · ${entry.metadata.video.codec}`}
            {entry.metadata?.exif?.make && ` · ${entry.metadata.exif.make}`}
          </p>
          {entry.metadata?.exif?.capturedAt && (
            <p className="text-xs text-zinc-600 font-mono">{entry.metadata.exif.capturedAt}</p>
          )}
        </div>

        {/* Status badge */}
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider ${STATUS_COLOR[entry.status]}`}>
          {STATUS_LABEL[entry.status]}
        </span>
      </div>

      {/* Progress */}
      {entry.totalChunks > 0 && (
        <div className="space-y-1">
          <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${isDone ? 'bg-emerald-500' : isError ? 'bg-red-500' : 'bg-cyan-500'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500">
            <span>CHUNK {entry.uploadedChunks}/{entry.totalChunks}</span>
            <span className="flex items-center gap-2">
              {entry.bytesPerSec ? (
                <>
                  <span className="text-cyan-500">{fmtSpeed(entry.bytesPerSec)}</span>
                  <span>ETA {estimatedTime(entry)}</span>
                </>
              ) : (
                <span>{pct}%</span>
              )}
            </span>
          </div>
        </div>
      )}

      {/* Error message */}
      {isError && entry.errorMessage && (
        <div className="rounded-lg border border-red-500/20 bg-red-950/30 p-2.5 space-y-0.5">
          <p className="text-xs text-red-400">{entry.errorMessage}</p>
          {entry.recoveryHint && (
            <p className="text-[10px] text-zinc-500">{entry.recoveryHint}</p>
          )}
        </div>
      )}

      {/* Done handshake */}
      {isDone && (
        <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-medium">
          <CheckIcon />
          Persistido en el Silo · SHA-256: <span className="font-mono text-zinc-500 truncate">{entry.manifest?.globalHash.slice(0, 16)}</span>
        </div>
      )}

      {/* Footer controls */}
      {!isDone && (
        <div className="flex items-center justify-end gap-2 pt-1 border-t border-zinc-800">
          <button
            onClick={() => onRemove(entry.sovereignId)}
            disabled={entry.status === 'uploading' || entry.status === 'verifying'}
            className="text-xs text-zinc-600 hover:text-red-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Eliminar
          </button>
          
          {/* PASO 7: Botón de Reintento Automático */}
          {entry.status === 'error' && (
            <button
              onClick={() => onRetry(entry.sovereignId)}
              className="text-xs text-cyan-500 hover:text-cyan-400 font-medium"
            >
              ↩ Reintentar
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function FileIcon({ mimeType }: { mimeType: string }) {
  if (mimeType.startsWith('video/')) return <span className="text-cyan-500 text-lg">▶</span>;
  if (mimeType.startsWith('image/')) return <span className="text-purple-400 text-lg">◼</span>;
  if (mimeType.startsWith('audio/')) return <span className="text-amber-400 text-lg">♪</span>;
  return <span className="text-zinc-500 text-xs font-mono">FILE</span>;
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="size-3.5" stroke="currentColor" strokeWidth={2}>
      <path d="M3 8.5L6.5 12L13 5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Dynamic schema form (zero-hardcoding) ────────────────────────────────────

function SchemaForm({
  schema,
  values,
  onChange,
  disabled,
}: {
  schema: PortFieldSchema[];
  values: Record<string, unknown>;
  onChange: (key: string, val: unknown) => void;
  disabled: boolean;
}) {
  if (!schema.length) return null;
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Metadatos de la entrega</p>
      {schema.map(field => (
        <div key={field.key} className="space-y-1">
          <label className="text-xs font-medium text-zinc-400">
            {field.label}
            {field.required && <span className="text-cyan-500 ml-0.5">*</span>}
          </label>
          {field.type === 'select' && field.options?.length ? (
            <select
              value={String(values[field.key] ?? '')}
              onChange={e => onChange(field.key, e.target.value)}
              disabled={disabled}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 focus:border-cyan-500 focus:outline-none"
            >
              <option value="">— seleccionar —</option>
              {field.options.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : (
            <input
              type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'}
              value={String(values[field.key] ?? '')}
              onChange={e => onChange(field.key, e.target.value)}
              disabled={disabled}
              placeholder={`Ingresar ${field.label.toLowerCase()}`}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 focus:border-cyan-500 focus:outline-none"
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Alert panel ──────────────────────────────────────────────────────────────

function AlertPanel({ alerts, onDismiss }: { alerts: string[]; onDismiss: (msg: string) => void }) {
  if (!alerts.length) return null;
  return (
    <div className="space-y-2">
      {alerts.map(msg => (
        <div key={msg} className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-2.5">
          <span className="text-amber-400 text-sm mt-0.5">⚠</span>
          <p className="flex-1 text-xs text-amber-300">{msg}</p>
          <button onClick={() => onDismiss(msg)} className="text-zinc-600 hover:text-zinc-400 text-xs">✕</button>
        </div>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export interface IngestionClientProps {
  slug: string;
  portLabel: string;
  schema: PortFieldSchema[];
  config: PortConfig;
}

export function IngestionClient({ slug, portLabel, schema, config }: IngestionClientProps) {
  const [state, dispatch] = useReducer(reducer, {
    files: [],
    formValues: {},
    reactor: 'idle',
    alerts: [],
  });

  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const processingQueue = useRef<string[]>([]);
  const activeId = useRef<string | null>(null);
  const wakeLock = useRef<WakeLockSentinel | null>(null);
  const integrityEngine = useRef(new IntegrityEngine());
  const pipeline = useRef(new SovereignPipeline());

  // PASO 4: Refs para evitar Stale Closures en callbacks asíncronos
  const filesRef = useRef(state.files);
  const formValuesRef = useRef(state.formValues);
  
  useEffect(() => { filesRef.current = state.files; }, [state.files]);
  useEffect(() => { formValuesRef.current = state.formValues; }, [state.formValues]);

  // Limpieza de IndexedDB al cargar
  useEffect(() => { cleanupOldSessions(); }, []);

  // ── Screen Wake Lock ──────────────────────────────────────────────────────
  const acquireWakeLock = useCallback(async () => {
    if (!('wakeLock' in navigator)) return;
    try {
      wakeLock.current = await (navigator as Navigator & { wakeLock: { request(t: string): Promise<WakeLockSentinel> } }).wakeLock.request('screen');
    } catch { /* not fatal */ }
  }, []);

  const releaseWakeLock = useCallback(() => {
    wakeLock.current?.release().catch(() => {});
    wakeLock.current = null;
  }, []);

  // ── Tab visibility detection ──────────────────────────────────────────────
  useEffect(() => {
    const handler = () => {
      if (document.hidden) {
        dispatch({ type: 'SET_REACTOR', mode: 'alert' });
        releaseWakeLock();
      } else if (isProcessing) {
        dispatch({ type: 'SET_REACTOR', mode: 'active' });
        acquireWakeLock();
        dispatch({ type: 'ADD_ALERT', msg: '⚡ Volviste. Los uploads continúan en curso.' });
      }
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [isProcessing, acquireWakeLock, releaseWakeLock]);

  // Re-acquire wake lock when tab becomes visible again
  useEffect(() => {
    if (state.reactor === 'active') acquireWakeLock();
    if (state.reactor === 'idle' || state.reactor === 'complete') releaseWakeLock();
  }, [state.reactor, acquireWakeLock, releaseWakeLock]);

  // ── File processing ───────────────────────────────────────────────────────
  const processFile = useCallback(async (sovereignFileId: string) => {
    // PASO 4: Usar refs para asegurar datos frescos
    const currentFiles = filesRef.current;
    const currentFormValues = formValuesRef.current;

    dispatch({ type: 'PATCH_FILE', sovereignId: sovereignFileId, patch: { status: 'hashing' } });

    const entry = currentFiles.find(f => f.sovereignId === sovereignFileId);
    if (!entry) return;

    // Build manifest
    const manifestResult = await integrityEngine.current.buildManifest(entry.file);

    if (!manifestResult.ok) {
      dispatch({
        type: 'PATCH_FILE', sovereignId: sovereignFileId,
        patch: { status: 'error', errorMessage: manifestResult.error?.message, recoveryHint: manifestResult.error?.recoveryHint },
      });
      return;
    }

    const manifest = manifestResult.data!;
    dispatch({
      type: 'PATCH_FILE', sovereignId: sovereignFileId,
      patch: { manifest, totalChunks: manifest.chunks.length, status: 'analyzing' },
    });

    // Metadata extraction (best-effort via Worker)
    try {
      const { WorkerBridge } = await import('@/workers/media-worker');
      const bridge = WorkerBridge.getInstance();
      const sample = await entry.file.slice(0, Math.min(entry.file.size, 10 * 1024 * 1024)).arrayBuffer();
      const metaResult = await bridge.extractMetadata(manifest.fileId, sample, entry.file.type);
      if (metaResult.ok && metaResult.data) {
        dispatch({ type: 'PATCH_FILE', sovereignId: sovereignFileId, patch: { metadata: metaResult.data } });
      }
    } catch { /* Worker failure is non-fatal */ }

    dispatch({ type: 'PATCH_FILE', sovereignId: sovereignFileId, patch: { status: 'uploading' } });

    // PASO 5: Smart-Match con Persistencia de Formulario
    const stored = await loadIdbSession(sovereignFileId);
    let resumableUri = stored?.resumableUri;

    // PASO 1: Si no hay sesión previa, crear una nueva en el servidor
    if (!resumableUri) {
      try {
        const sessionRes = await fetch(`/api/p/${slug}/session`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            fileName: entry.file.name,
            mimeType: entry.file.type,
            fileSize: entry.file.size,
            formValues: currentFormValues
          }),
        });
        const sessionData = await sessionRes.json();
        if (sessionRes.ok) {
          resumableUri = sessionData.resumableUri;
          await saveIdbSession({
            sovereignId: sovereignFileId,
            sessionId: manifest.fileId,
            resumableUri,
            uploadedChunks: [],
            manifest,
            formValues: currentFormValues,
            savedAt: Date.now()
          });
        }
      } catch (e) {
        console.error('Failed to init resumable session', e);
      }
    } else if (stored?.formValues) {
      // Opcional: Avisar que se restauraron los metadatos
      dispatch({ type: 'ADD_ALERT', msg: `↩ Datos de formulario restaurados para "${entry.file.name}".` });
    }

    const adapter = makePortAdapter(slug, currentFormValues, resumableUri);
    let pipelineInstance = pipeline.current;

    if (stored?.uploadedChunks.length) {
      const resumedSession = pipelineInstance.getOrCreateSession(manifest);
      stored.uploadedChunks.forEach(i => resumedSession.uploadedChunks.add(i));
      dispatch({ type: 'ADD_ALERT', msg: `↩ Reanudando "${entry.file.name}" desde chunk ${stored.uploadedChunks.length}.` });
    }

    const uploadResult = await pipelineInstance.run(
      entry.file,
      manifest,
      adapter,
      async (uploaded) => {
        const elapsed = (Date.now() - speedSampleStart) / 1000;
        speedSampleBytes += manifest.chunkSize;
        const bps = elapsed > 0 ? speedSampleBytes / elapsed : 0;

        // Reset speed sample every 5 chunks
        if (uploaded % 5 === 0) {
          speedSampleStart = Date.now();
          speedSampleBytes = 0;
        }

        dispatch({
          type: 'PATCH_FILE', sovereignId: sovereignFileId,
          patch: { uploadedChunks: uploaded, totalChunks: total, bytesPerSec: bps },
        });

        // Update IndexedDB session
        const currentUploaded = Array.from({ length: uploaded }, (_, i) => i);
        await saveIdbSession({ sovereignId: sovereignFileId, sessionId: manifest.fileId, uploadedChunks: currentUploaded, manifest });
      }
    );

    if (!uploadResult.ok) {
      dispatch({
        type: 'PATCH_FILE', sovereignId: sovereignFileId,
        patch: {
          status: 'error',
          errorMessage: uploadResult.error?.message,
          recoveryHint: uploadResult.error?.recoveryHint,
        },
      });
      return;
    }

    dispatch({ type: 'PATCH_FILE', sovereignId: sovereignFileId, patch: { status: 'verifying' } });

    // Small delay to let server process
    await new Promise(r => setTimeout(r, 600));

    dispatch({ type: 'PATCH_FILE', sovereignId: sovereignFileId, patch: { status: 'done', uploadedChunks: manifest.chunks.length } });
    await deleteIdbSession(sovereignFileId);
  }, [slug, state.files, state.formValues]);

  const drainQueue = useCallback(async () => {
    if (activeId.current !== null) return;
    const nextId = processingQueue.current.shift();
    if (!nextId) {
      setIsProcessing(false);
      dispatch({ type: 'SET_REACTOR', mode: 'complete' });
      releaseWakeLock();
      return;
    }
    activeId.current = nextId;
    await processFile(nextId);
    activeId.current = null;
    drainQueue();
  }, [processFile, releaseWakeLock]);

  const startUpload = useCallback(async () => {
    // Validate required form fields
    const missing = schema.filter(f => f.required && !state.formValues[f.key]);
    if (missing.length > 0) {
      dispatch({ type: 'ADD_ALERT', msg: `Campos requeridos sin completar: ${missing.map(f => f.label).join(', ')}` });
      return;
    }

    const queued = state.files.filter(f => f.status === 'queued' || f.status === 'paused' || f.status === 'error');
    if (!queued.length) return;

    setIsProcessing(true);
    dispatch({ type: 'SET_REACTOR', mode: 'active' });
    await acquireWakeLock();

    // Reset errors for retried files
    queued.forEach(f => {
      if (f.status === 'error') {
        dispatch({ type: 'PATCH_FILE', sovereignId: f.sovereignId, patch: { status: 'queued', errorMessage: undefined } });
      }
    });

    processingQueue.current.push(...queued.map(f => f.sovereignId));
    drainQueue();
  }, [schema, state.files, state.formValues, acquireWakeLock, drainQueue]);

  const onRetryFile = useCallback((id: string) => {
    dispatch({ type: 'PATCH_FILE', sovereignId: id, patch: { status: 'queued', errorMessage: undefined } });
    if (!isProcessing) {
      startUpload();
    } else {
      // If already processing, just push to the ref queue
      processingQueue.current.push(id);
    }
  }, [isProcessing, startUpload]);

  // ── File drop / add ───────────────────────────────────────────────────────
  const addFiles = useCallback(async (rawFiles: File[]) => {
    const totalBytes = rawFiles.reduce((s, f) => s + f.size, 0);
    const existingBytes = state.files.reduce((s, f) => s + f.file.size, 0);
    const grandTotal = totalBytes + existingBytes;

    // Volume warnings
    if (grandTotal > 10 * 1024 ** 3) {
      dispatch({ type: 'ADD_ALERT', msg: `🌙 Volumen total > 10 GB. Considera iniciar la subida en horario nocturno con conexión estable y cargador conectado.` });
    }
    if (grandTotal > 1024 ** 3) {
      dispatch({ type: 'ADD_ALERT', msg: `📡 ${fmtBytes(grandTotal)} en cola. Mantén la pestaña abierta y el dispositivo cargando durante la transmisión.` });
    }

    const entries: FileEntry[] = await Promise.all(
      rawFiles.map(async file => {
        const svId = sovereignId(file);
        const stored = await loadIdbSession(svId);

        // Generate thumbnail for images
        let thumbnail: string | null = null;
        if (file.type.startsWith('image/') && file.size < 20 * 1024 * 1024) {
          thumbnail = URL.createObjectURL(file);
        }

        return {
          sovereignId: svId,
          file,
          status: 'queued' as FileStatus,
          thumbnail,
          uploadedChunks: stored?.uploadedChunks.length ?? 0,
          totalChunks: stored?.manifest?.chunks.length ?? 0,
          manifest: stored?.manifest,
        };
      })
    );

    dispatch({ type: 'ADD_FILES', entries });
  }, [state.files]);

  const onDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) addFiles(files);
  }, [addFiles]);

  const onFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length) addFiles(files);
    e.target.value = '';
  }, [addFiles]);

  // ── Derived state ─────────────────────────────────────────────────────────
  const totalQueued = state.files.reduce((s, f) => s + f.file.size, 0);
  const doneCount = state.files.filter(f => f.status === 'done').length;
  const totalCount = state.files.length;
  const globalPct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  const reactorClasses = {
    idle:     'border-zinc-700/60',
    active:   'border-cyan-500/70 shadow-[0_0_30px_rgba(6,182,212,0.15)] animate-[reactor-pulse_2s_ease-in-out_infinite]',
    alert:    'border-amber-500/70 shadow-[0_0_30px_rgba(245,158,11,0.2)] animate-[reactor-alert_1s_ease-in-out_infinite]',
    complete: 'border-emerald-500/60 shadow-[0_0_20px_rgba(16,185,129,0.1)]',
  };

  return (
    <>
      <style>{`
        @keyframes reactor-pulse {
          0%, 100% { box-shadow: 0 0 20px rgba(6,182,212,0.15); border-color: rgba(6,182,212,0.5); }
          50% { box-shadow: 0 0 50px rgba(6,182,212,0.35); border-color: rgba(6,182,212,0.9); }
        }
        @keyframes reactor-alert {
          0%, 100% { box-shadow: 0 0 20px rgba(245,158,11,0.2); border-color: rgba(245,158,11,0.5); }
          50% { box-shadow: 0 0 50px rgba(245,158,11,0.45); border-color: rgba(245,158,11,1); }
        }
      `}</style>

      <div className="min-h-screen bg-[#06070d] text-zinc-200 p-4 md:p-8">
        {/* Header */}
        <div className="max-w-3xl mx-auto mb-6 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-mono text-cyan-600 uppercase tracking-widest mb-1">INDRA SOVEREIGN · PUERTO DE INGESTA</p>
            <h1 className="text-xl font-bold text-zinc-100">{portLabel}</h1>
          </div>
          {totalQueued > 0 && (
            <p className="text-xs font-mono text-zinc-500">{fmtBytes(totalQueued)} total</p>
          )}
        </div>

        {/* Reactor container */}
        <div className={`max-w-3xl mx-auto rounded-2xl border-2 transition-all duration-700 ${reactorClasses[state.reactor]} bg-zinc-900/50 backdrop-blur-sm`}>

          {/* Alert panel */}
          {state.alerts.length > 0 && (
            <div className="px-5 pt-5">
              <AlertPanel alerts={state.alerts} onDismiss={msg => dispatch({ type: 'DISMISS_ALERT', msg })} />
            </div>
          )}

          {/* Drop zone */}
          <div className="p-5">
            <div
              onDrop={onDrop}
              onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              className={[
                'rounded-xl border-2 border-dashed transition-all duration-200 py-10 flex flex-col items-center gap-3 cursor-pointer',
                isDragging
                  ? 'border-cyan-400 bg-cyan-950/20'
                  : 'border-zinc-700 hover:border-zinc-600 hover:bg-zinc-800/30',
              ].join(' ')}
              onClick={() => document.getElementById('file-input')?.click()}
            >
              <div className="size-12 rounded-full bg-zinc-800 flex items-center justify-center border border-zinc-700">
                <span className="text-2xl text-zinc-400">{isDragging ? '⬇' : '↑'}</span>
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-zinc-300">
                  {isDragging ? 'Suelta los archivos' : 'Arrastra archivos aquí'}
                </p>
                <p className="text-xs text-zinc-600 mt-0.5">
                  {config.allowedMimeTypes?.join(', ') || 'Todos los formatos'} · Sin límite de tamaño
                </p>
              </div>
              <input
                id="file-input"
                type="file"
                multiple
                className="sr-only"
                onChange={onFileInput}
                accept={config.allowedMimeTypes?.join(',') || undefined}
              />
            </div>
          </div>

          {/* Schema form */}
          {schema.length > 0 && (
            <div className="px-5 pb-5">
              <SchemaForm
                schema={schema}
                values={state.formValues}
                onChange={(key, val) => dispatch({ type: 'SET_FORM', key, value: val })}
                disabled={isProcessing}
              />
            </div>
          )}

          {/* File queue */}
          {state.files.length > 0 && (
            <div className="px-5 pb-5 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Cola de archivos ({totalCount})
                </p>
                {!isProcessing && (
                  <button
                    onClick={() => dispatch({ type: 'CLEAR_ALL' })}
                    className="text-xs text-zinc-600 hover:text-red-400 transition-colors"
                  >
                    Limpiar sesión
                  </button>
                )}
              </div>

              {state.files.map(entry => (
                <SovereignCard
                  key={entry.sovereignId}
                  entry={entry}
                  onRemove={id => dispatch({ type: 'REMOVE_FILE', sovereignId: id })}
                  onRetry={onRetryFile}
                />
              ))}
            </div>
          )}

          {/* Global progress + action button */}
          {state.files.length > 0 && (
            <div className="px-5 pb-5 space-y-3">
              {/* Global progress bar */}
              {isProcessing && (
                <div className="space-y-1">
                  <div className="h-px bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-cyan-600 to-cyan-400 transition-all duration-500"
                      style={{ width: `${globalPct}%` }}
                    />
                  </div>
                  <p className="text-[10px] font-mono text-zinc-600 text-right">
                    PROGRESO GLOBAL {doneCount}/{totalCount} · {globalPct}%
                  </p>
                </div>
              )}

              {!isProcessing && state.reactor !== 'complete' && (
                <button
                  onClick={startUpload}
                  disabled={state.files.filter(f => f.status === 'queued').length === 0}
                  className="w-full rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 text-sm transition-colors flex items-center justify-center gap-2"
                >
                  <span>⚡</span>
                  Iniciar Subida Soberana
                </button>
              )}

              {state.reactor === 'complete' && (
                <div className="flex items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-950/20 py-3 text-sm text-emerald-400 font-medium">
                  <CheckIcon />
                  Todos los archivos persistidos en el Silo
                </div>
              )}

              {state.reactor === 'alert' && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-3 text-xs text-amber-300 text-center">
                  ⚡ Reactor en Alerta — La pestaña perdió el foco. Regresa para reanudar los uploads.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
