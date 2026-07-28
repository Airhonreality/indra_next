import React, { useEffect, useState } from 'react';
import { Shield, Eye, EyeOff, Check, Loader2, Trash2, Plus, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';

export type StorageTab = 'mega' | 's3' | 'claro';

type StoredConnection = {
  id: string;
  type: string;
  label: string;
  config?: {
    email?: string;
    bucket?: string;
    baseUrl?: string;
    username?: string;
  };
};

interface CredentialVaultProps {
  userId: string;
  onSaved?: () => void;
  defaultTab?: StorageTab;
  open?: boolean;
}

export function CredentialVault({ onSaved, defaultTab, open }: CredentialVaultProps) {
  const [activeTab, setActiveTab] = useState<StorageTab>(defaultTab ?? 'mega');

  const [megaEmail, setMegaEmail] = useState('');
  const [megaPassword, setMegaPassword] = useState('');

  const [s3Bucket, setS3Bucket] = useState('');
  const [s3Endpoint, setS3Endpoint] = useState('');
  const [s3AccessKeyId, setS3AccessKeyId] = useState('');
  const [s3SecretAccessKey, setS3SecretAccessKey] = useState('');

  const [claroBaseUrl, setClaroBaseUrl] = useState('https://www.clarodrive.com');
  const [claroUsername, setClaroUsername] = useState('');
  const [claroAppPassword, setClaroAppPassword] = useState('');

  const [showMegaPassword, setShowMegaPassword] = useState(false);
  const [showS3SecretKey, setShowS3SecretKey] = useState(false);
  const [showClaroPassword, setShowClaroPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [connections, setConnections] = useState<StoredConnection[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [claroFlowMessage, setClaroFlowMessage] = useState('');
  const [claroFlowError, setClaroFlowError] = useState('');
  const [claroFlowUrl, setClaroFlowUrl] = useState('');

  const fetchConnections = async () => {
    try {
      const res = await fetch('/api/integrations');
      if (!res.ok) throw new Error('Failed to fetch integrations');
      const data = await res.json();
      const storageConns = (data.integrations || []).filter(
        (item: StoredConnection) => item.type === 'mega' || item.type === 's3' || item.type === 'claro'
      );
      setConnections(storageConns);
    } catch (err) {
      console.error('[CredentialVault] Failed to retrieve server connections:', err);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchConnections();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!defaultTab) return;
    const timer = window.setTimeout(() => {
      setActiveTab(defaultTab);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [defaultTab]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      setShowAddForm(true);
      if (defaultTab) {
        setActiveTab(defaultTab);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [defaultTab, open]);

  const handleSaveMega = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!megaEmail || !megaPassword) return;

    setLoading(true);
    try {
      const res = await fetch('/api/integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'mega',
          label: `MEGA [${megaEmail}]`,
          config: { email: megaEmail, password: megaPassword },
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to save MEGA credentials');
      }

      setMegaEmail('');
      setMegaPassword('');
      setShowMegaPassword(false);
      setShowAddForm(false);
      await fetchConnections();
      onSaved?.();
    } catch (err) {
      console.error('[CredentialVault] Failed to save MEGA in Postgres:', err);
      alert('Error al conectar con MEGA. Verifica tus credenciales.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveS3 = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!s3Bucket || !s3Endpoint || !s3AccessKeyId || !s3SecretAccessKey) return;

    setLoading(true);
    try {
      const res = await fetch('/api/integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 's3',
          label: `Cloudflare R2 [${s3Bucket}]`,
          config: {
            bucket: s3Bucket,
            endpoint: s3Endpoint,
            accessKeyId: s3AccessKeyId,
            secretAccessKey: s3SecretAccessKey,
          },
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to save Cloudflare R2 credentials');
      }

      setS3Bucket('');
      setS3Endpoint('');
      setS3AccessKeyId('');
      setS3SecretAccessKey('');
      setShowS3SecretKey(false);
      setShowAddForm(false);
      await fetchConnections();
      onSaved?.();
    } catch (err) {
      console.error('[CredentialVault] Failed to save S3 in Postgres:', err);
      alert('Error al conectar con Cloudflare R2. Verifica tus credenciales.');
    } finally {
      setLoading(false);
    }
  };

  const persistClaroConnection = async (input: {
    baseUrl: string;
    username: string;
    password: string;
  }) => {
    const res = await fetch('/api/integrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'claro',
        label: `Claro Drive [${input.username}]`,
        config: {
          baseUrl: input.baseUrl,
          username: input.username,
          password: input.password,
        },
      }),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to save Claro Drive credentials');
    }

    setClaroBaseUrl('https://www.clarodrive.com');
    setClaroUsername('');
    setClaroAppPassword('');
    setShowClaroPassword(false);
    setShowAddForm(false);
    await fetchConnections();
    onSaved?.();
  };

  const handleSaveClaro = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!claroBaseUrl || !claroUsername || !claroAppPassword) return;

    setLoading(true);
    setClaroFlowError('');
    setClaroFlowMessage('Guardando credenciales Claro Drive...');
    try {
      await persistClaroConnection({
        baseUrl: claroBaseUrl,
        username: claroUsername,
        password: claroAppPassword,
      });
      setClaroFlowMessage('Claro Drive conectado correctamente.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al conectar con Claro Drive';
      console.error('[CredentialVault] Failed to save Claro Drive in Postgres:', err);
      setClaroFlowError(message);
      alert('Error al conectar con Claro Drive. Verifica tus credenciales.');
    } finally {
      setLoading(false);
    }
  };

  const pollClaroLoginFlow = async (params: {
    endpoint: string;
    token: string;
    baseUrl: string;
  }) => {
    const maxAttempts = 60;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const response = await fetch('/api/integrations/claro/login/poll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: params.endpoint,
          token: params.token,
          baseUrl: params.baseUrl,
        }),
      });

      if (response.status === 202) {
        setClaroFlowMessage(`Esperando confirmación del SMS en Claro Drive... intento ${attempt + 1}/${maxAttempts}`);
        await new Promise((resolve) => window.setTimeout(resolve, 2500));
        continue;
      }

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || 'No se pudo completar el login de Claro Drive');
      }

      const payload = await response.json();
      if (!payload?.appPassword || !payload?.loginName || !payload?.server) {
        throw new Error('El flujo de Claro no devolvió appPassword, loginName o server.');
      }

      return payload;
    }

    throw new Error('El login de Claro expiró esperando la validación SMS.');
  };

  const handleStartClaroLoginFlow = async () => {
    if (!claroBaseUrl) return;

    setLoading(true);
    setClaroFlowError('');
    setClaroFlowMessage('Iniciando login interactivo de Claro Drive...');
    try {
      const res = await fetch('/api/integrations/claro/login/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl: claroBaseUrl }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        const extra = Array.isArray(payload?.details)
          ? payload.details.map((item: { url?: string; status?: number; details?: string }) => {
              return `${item.url ?? 'unknown'} -> ${item.status ?? 'n/a'} ${item.details ? `| ${item.details}` : ''}`;
            }).join(' ; ')
          : typeof payload?.details === 'string'
            ? payload.details
            : '';
        throw new Error([payload?.error || 'No se pudo iniciar el flujo de Claro Drive', extra].filter(Boolean).join(' | '));
      }

      const payload = await res.json();
      if (!payload?.login || !payload?.poll?.token || !payload?.poll?.endpoint || !payload?.server) {
        throw new Error('El flujo de login de Claro no devolvió login o token.');
      }

      setClaroFlowUrl(payload.login);
      setClaroFlowMessage('Se abrió el portal oficial. Completa el SMS para continuar.');

      const popup = window.open(payload.login, '_blank', 'noopener,noreferrer');
      if (!popup) {
        setClaroFlowMessage('Abre manualmente el portal oficial y completa el SMS.');
      }

      const loginResult = await pollClaroLoginFlow({
        endpoint: payload.poll.endpoint,
        token: payload.poll.token,
        baseUrl: payload.server,
      });

      setClaroFlowMessage('SMS validado. Guardando la sesión de Claro Drive...');
      await persistClaroConnection({
        baseUrl: loginResult.server,
        username: loginResult.loginName,
        password: loginResult.appPassword,
      });
      setClaroFlowMessage('Claro Drive conectado por login interactivo.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al iniciar el login de Claro';
      console.error('[CredentialVault] Failed to start Claro login flow:', err);
      setClaroFlowError(message);
      alert(`No se pudo iniciar el login de Claro Drive: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async (id: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/integrations/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to disconnect');
      await fetchConnections();
      onSaved?.();
    } catch (err) {
      console.error('[CredentialVault] Failed to delete connection:', err);
    } finally {
      setLoading(false);
    }
  };

  const connectionTone = (type: string) => {
    if (type === 'mega') return 'red';
    if (type === 'claro') return 'sky';
    return 'amber';
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/40 bg-background/20 p-5 shadow-xl backdrop-blur-md space-y-4">
      <div className="pointer-events-none absolute right-0 top-0 h-32 w-32 rounded-full bg-primary/5 blur-[60px]" />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Shield className="size-4 animate-pulse text-primary" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">Sovereign credential vault</h3>
        </div>
        {connections.length > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowAddForm(!showAddForm)}
            className="h-7 rounded-lg border-primary/20 px-2 text-[9px] uppercase tracking-wider text-primary hover:bg-primary/10"
          >
            <Plus className="mr-1 size-3" /> {showAddForm ? 'Hide' : 'Add connection'}
          </Button>
        )}
      </div>

      <p className="text-[10px] leading-relaxed text-muted-foreground">
        Este vault administra sólo silos de credenciales directas: MEGA, Cloudflare R2 y Claro Drive. Las cuentas OAuth de Google, Microsoft y Notion se conectan desde sus tarjetas de familia.
      </p>

      {connections.length > 0 ? (
        <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
          {connections.map((conn) => {
            const tone = connectionTone(conn.type);
            return (
              <div
                key={conn.id}
                className={`flex items-center justify-between gap-3 rounded-xl border p-3 animate-in fade-in duration-300 ${
                  tone === 'red'
                    ? 'border-red-500/20 bg-red-950/10'
                    : tone === 'sky'
                      ? 'border-sky-500/20 bg-sky-950/10'
                      : 'border-amber-500/20 bg-amber-950/10'
                }`}
              >
                <div className="flex items-center gap-2.5 overflow-hidden">
                  <Check className={`size-4 shrink-0 ${tone === 'red' ? 'text-red-500' : tone === 'sky' ? 'text-sky-500' : 'text-amber-500'}`} />
                  <div className="overflow-hidden">
                    <span className={`block text-[8px] font-bold uppercase tracking-wider leading-tight ${
                      tone === 'red' ? 'text-red-500' : tone === 'sky' ? 'text-sky-500' : 'text-amber-500'
                    }`}>
                      {conn.type === 'mega' ? 'MEGA' : conn.type === 'claro' ? 'Claro Drive' : 'Cloudflare R2'} - encrypted storage
                    </span>
                    <span
                      className="block truncate font-mono text-[11px] text-zinc-300"
                      title={
                        conn.type === 'mega'
                          ? conn.config?.email
                          : conn.type === 'claro'
                            ? `${conn.config?.username} @ ${conn.config?.baseUrl || 'https://www.clarodrive.com'}`
                            : conn.config?.bucket
                      }
                    >
                      {conn.type === 'mega'
                        ? conn.config?.email
                        : conn.type === 'claro'
                          ? `${conn.config?.username} @ ${conn.config?.baseUrl || 'https://www.clarodrive.com'}`
                          : `bucket: ${conn.config?.bucket}`}
                    </span>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={loading}
                  onClick={() => handleDisconnect(conn.id)}
                  className="size-8 shrink-0 rounded-full text-zinc-500 hover:bg-red-500/10 hover:text-red-500"
                  title="Disconnect account"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      ) : (
        !showAddForm && (
          <p className="text-[10px] italic text-zinc-500">No encrypted storage vaults are connected yet.</p>
        )
      )}

      {(showAddForm || connections.length === 0) && (
        <div className="space-y-4 border-t border-border/20 pt-4">
          <div className="flex rounded-lg border border-border/20 bg-muted/30 p-1">
            <button
              type="button"
              onClick={() => setActiveTab('mega')}
              className={`flex-1 rounded-md py-1.5 text-[9px] font-bold uppercase tracking-wider transition-all ${
                activeTab === 'mega'
                  ? 'border border-border/10 bg-background text-red-500 shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              MEGA
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('s3')}
              className={`flex-1 rounded-md py-1.5 text-[9px] font-bold uppercase tracking-wider transition-all ${
                activeTab === 's3'
                  ? 'border border-border/10 bg-background text-amber-500 shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Cloudflare R2
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('claro')}
              className={`flex-1 rounded-md py-1.5 text-[9px] font-bold uppercase tracking-wider transition-all ${
                activeTab === 'claro'
                  ? 'border border-border/10 bg-background text-sky-500 shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Claro Drive
            </button>
          </div>

          {activeTab === 'mega' && (
            <form onSubmit={handleSaveMega} className="space-y-3 animate-in slide-in-from-top-2 duration-300">
              <p className="text-[9px] leading-normal text-zinc-500">
                MEGA uses direct credentials. Save the login data to persist the silo securely.
              </p>
              <div className="space-y-1 rounded-lg border border-red-500/20 bg-red-950/15 p-2 text-[9px] leading-normal text-red-400">
                <span className="block text-[8px] font-bold uppercase tracking-wider text-red-500">Security limit active</span>
                A strict 2GB per file streaming and download limit is enforced to protect free accounts from quota lockouts.
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Email</label>
                <input
                  type="email"
                  value={megaEmail}
                  onChange={(e) => setMegaEmail(e.target.value)}
                  disabled={loading}
                  required
                  placeholder="user@example.com"
                  className="w-full rounded-lg border border-border/40 bg-muted/20 px-3 py-2 font-mono text-[11px] placeholder-zinc-600 transition-all focus:border-red-500/60 focus:outline-none"
                />
              </div>

              <div className="relative space-y-1">
                <label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Password</label>
                <div className="relative">
                  <input
                    type={showMegaPassword ? 'text' : 'password'}
                    value={megaPassword}
                    onChange={(e) => setMegaPassword(e.target.value)}
                    disabled={loading}
                    required
                    placeholder="********"
                    className="w-full rounded-lg border border-border/40 bg-muted/20 py-2 pl-3 pr-9 font-mono text-[11px] placeholder-zinc-600 transition-all focus:border-red-500/60 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowMegaPassword(!showMegaPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                  >
                    {showMegaPassword ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                  </button>
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                {connections.length > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setShowAddForm(false)}
                    className="h-9 flex-1 rounded-xl border border-border/40 text-[9px] uppercase tracking-wider"
                  >
                    Cancel
                  </Button>
                )}
                <Button
                  type="submit"
                  disabled={loading || !megaEmail || !megaPassword}
                  className="h-9 flex-1 rounded-xl bg-red-600 font-bold text-[9px] uppercase tracking-wider text-white shadow-lg transition-all hover:bg-red-500"
                >
                  {loading ? <Loader2 className="mx-auto size-3.5 animate-spin" /> : 'Connect MEGA'}
                </Button>
              </div>
            </form>
          )}

          {activeTab === 's3' && (
            <form onSubmit={handleSaveS3} className="space-y-3 animate-in slide-in-from-top-2 duration-300">
              <p className="text-[9px] leading-normal text-zinc-500">
                Cloudflare R2 uses direct S3 keys. Save the bucket and credentials to enable the storage silo.
              </p>
              <div className="space-y-1 rounded-lg border border-amber-500/20 bg-amber-950/15 p-2 text-[9px] leading-normal text-amber-400">
                <span className="block text-[8px] font-bold uppercase tracking-wider text-amber-500">Zero egress note</span>
                Storage is encrypted at rest in Postgres and the keys are never shown again in plaintext.
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Bucket</label>
                  <input
                    type="text"
                    value={s3Bucket}
                    onChange={(e) => setS3Bucket(e.target.value)}
                    disabled={loading}
                    required
                    placeholder="my-bucket"
                    className="w-full rounded-lg border border-border/40 bg-muted/20 px-3 py-2 font-mono text-[11px] placeholder-zinc-600 transition-all focus:border-amber-500/60 focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Endpoint URL</label>
                  <input
                    type="url"
                    value={s3Endpoint}
                    onChange={(e) => setS3Endpoint(e.target.value)}
                    disabled={loading}
                    required
                    placeholder="https://...r2.cloudflarestorage.com"
                    className="w-full rounded-lg border border-border/40 bg-muted/20 px-3 py-2 font-mono text-[11px] placeholder-zinc-600 transition-all focus:border-amber-500/60 focus:outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Access Key ID</label>
                <input
                  type="text"
                  value={s3AccessKeyId}
                  onChange={(e) => setS3AccessKeyId(e.target.value)}
                  disabled={loading}
                  required
                  placeholder="..."
                  className="w-full rounded-lg border border-border/40 bg-muted/20 px-3 py-2 font-mono text-[11px] placeholder-zinc-600 transition-all focus:border-amber-500/60 focus:outline-none"
                />
              </div>

              <div className="relative space-y-1">
                <label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Secret Access Key</label>
                <div className="relative">
                  <input
                    type={showS3SecretKey ? 'text' : 'password'}
                    value={s3SecretAccessKey}
                    onChange={(e) => setS3SecretAccessKey(e.target.value)}
                    disabled={loading}
                    required
                    placeholder="********"
                    className="w-full rounded-lg border border-border/40 bg-muted/20 py-2 pl-3 pr-9 font-mono text-[11px] placeholder-zinc-600 transition-all focus:border-amber-500/60 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowS3SecretKey(!showS3SecretKey)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                  >
                    {showS3SecretKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                  </button>
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                {connections.length > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setShowAddForm(false)}
                    className="h-9 flex-1 rounded-xl border border-border/40 text-[9px] uppercase tracking-wider"
                  >
                    Cancel
                  </Button>
                )}
                <Button
                  type="submit"
                  disabled={loading || !s3Bucket || !s3Endpoint || !s3AccessKeyId || !s3SecretAccessKey}
                  className="h-9 flex-1 rounded-xl bg-amber-600 font-bold text-[9px] uppercase tracking-wider text-white shadow-lg transition-all hover:bg-amber-500"
                >
                  {loading ? <Loader2 className="mx-auto size-3.5 animate-spin" /> : 'Connect Cloudflare R2'}
                </Button>
              </div>
            </form>
          )}

          {activeTab === 'claro' && (
            <form onSubmit={handleSaveClaro} className="space-y-3 animate-in slide-in-from-top-2 duration-300">
              <p className="text-[9px] leading-normal text-zinc-500">
                Claro Drive can be connected with an app password, or through the official SMS login flow if the portal gives you a reusable app password after validation.
              </p>
              <div className="space-y-1 rounded-lg border border-sky-500/20 bg-sky-950/15 p-2 text-[9px] leading-normal text-sky-400">
                <span className="block text-[8px] font-bold uppercase tracking-wider text-sky-500">Login flow v2</span>
                Open the official portal, complete the SMS challenge, and let Indra poll for the app password returned by Claro.
              </div>

              {(claroFlowMessage || claroFlowError) && (
                <div className={claroFlowError ? 'space-y-1 rounded-lg border border-red-500/20 bg-red-950/15 p-2 text-[9px] leading-normal text-red-400' : 'space-y-1 rounded-lg border border-emerald-500/20 bg-emerald-950/15 p-2 text-[9px] leading-normal text-emerald-400'}>
                  <span className="block text-[8px] font-bold uppercase tracking-wider">
                    {claroFlowError ? 'Login error' : 'Login status'}
                  </span>
                  <span>{claroFlowError || claroFlowMessage}</span>
                </div>
              )}

              {claroFlowUrl && (
                <a
                  href={claroFlowUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[9px] uppercase tracking-wider text-sky-400 hover:text-sky-300"
                >
                  <ExternalLink className="size-3" />
                  Open Claro login again
                </a>
              )}

              <div className="space-y-1">
                <label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Server URL</label>
                <input
                  type="url"
                  value={claroBaseUrl}
                  onChange={(e) => setClaroBaseUrl(e.target.value)}
                  disabled={loading}
                  required
                  placeholder="https://www.clarodrive.com"
                  className="w-full rounded-lg border border-border/40 bg-muted/20 px-3 py-2 font-mono text-[11px] placeholder-zinc-600 transition-all focus:border-sky-500/60 focus:outline-none"
                />
              </div>

              <div className="flex gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    void handleStartClaroLoginFlow();
                  }}
                  disabled={loading || !claroBaseUrl}
                  className="h-9 flex-1 rounded-xl border-sky-500/30 text-[9px] uppercase tracking-wider text-sky-500"
                >
                  {loading ? <Loader2 className="mx-auto size-3.5 animate-spin" /> : 'Iniciar sesión con SMS'}
                </Button>
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Username</label>
                <input
                  type="text"
                  value={claroUsername}
                  onChange={(e) => setClaroUsername(e.target.value)}
                  disabled={loading}
                  required
                  placeholder="email or phone"
                  className="w-full rounded-lg border border-border/40 bg-muted/20 px-3 py-2 font-mono text-[11px] placeholder-zinc-600 transition-all focus:border-sky-500/60 focus:outline-none"
                />
              </div>

              <div className="relative space-y-1">
                <label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">App Password</label>
                <div className="relative">
                  <input
                    type={showClaroPassword ? 'text' : 'password'}
                    value={claroAppPassword}
                    onChange={(e) => setClaroAppPassword(e.target.value)}
                    disabled={loading}
                    required
                    placeholder="********"
                    className="w-full rounded-lg border border-border/40 bg-muted/20 py-2 pl-3 pr-9 font-mono text-[11px] placeholder-zinc-600 transition-all focus:border-sky-500/60 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowClaroPassword(!showClaroPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                  >
                    {showClaroPassword ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                  </button>
                </div>
              </div>

              <a
                href="https://www.clarodrive.com/?country=mexico"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[9px] uppercase tracking-wider text-sky-400 hover:text-sky-300"
              >
                <ExternalLink className="size-3" />
                Open official web access
              </a>

              <div className="flex gap-2 pt-1">
                {connections.length > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setShowAddForm(false)}
                    className="h-9 flex-1 rounded-xl border border-border/40 text-[9px] uppercase tracking-wider"
                  >
                    Cancel
                  </Button>
                )}
                <Button
                  type="submit"
                  disabled={loading || !claroBaseUrl || !claroUsername || !claroAppPassword}
                  className="h-9 flex-1 rounded-xl bg-sky-600 font-bold text-[9px] uppercase tracking-wider text-white shadow-lg transition-all hover:bg-sky-500"
                >
                  {loading ? <Loader2 className="mx-auto size-3.5 animate-spin" /> : 'Connect Claro Drive'}
                </Button>
              </div>
              <p className="text-[9px] text-zinc-500">
                Manual mode still works if you already have an app password. The SMS flow just tries to obtain one from the official portal.
              </p>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

export default CredentialVault;
