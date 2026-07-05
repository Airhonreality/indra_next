import React, { useState, useEffect } from 'react';
import { Shield, Key, Eye, EyeOff, Check, Loader2, Trash2, Plus, Database } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface CredentialVaultProps {
  userId: string;
  onSaved?: () => void;
}

export function CredentialVault({ userId, onSaved }: CredentialVaultProps) {
  // Tabs: 'mega' | 's3'
  const [activeTab, setActiveTab] = useState<'mega' | 's3'>('mega');
  
  // MEGA fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  // Cloudflare R2 / S3 fields
  const [bucket, setBucket] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [accessKeyId, setAccessKeyId] = useState('');
  const [secretAccessKey, setSecretAccessKey] = useState('');
  
  const [showPassword, setShowPassword] = useState(false);
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [connections, setConnections] = useState<any[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);

  // Fetch all connections from server
  const fetchConnections = async () => {
    try {
      const res = await fetch('/api/integrations');
      if (!res.ok) throw new Error('Failed to fetch integrations');
      const data = await res.json();
      
      const storageConns = data.integrations?.filter((i: any) => i.type === 'mega' || i.type === 's3') || [];
      setConnections(storageConns);
    } catch (err) {
      console.error('[CredentialVault] Failed to retrieve server connections:', err);
    }
  };

  useEffect(() => {
    fetchConnections();
  }, []);

  const handleSaveMega = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setLoading(true);
    try {
      const res = await fetch('/api/integrations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'mega',
          label: `MEGA [${email}]`,
          config: {
            email,
            password
          }
        })
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to save MEGA credentials');
      }

      setEmail('');
      setPassword('');
      setShowPassword(false);
      setShowAddForm(false);
      setLoading(false);
      
      await fetchConnections();
      if (onSaved) onSaved();
    } catch (err) {
      console.error('[CredentialVault] Failed to save MEGA in Postgres:', err);
      alert('Error al conectar con MEGA. Verifica tus credenciales.');
      setLoading(false);
    }
  };

  const handleSaveS3 = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bucket || !endpoint || !accessKeyId || !secretAccessKey) return;

    setLoading(true);
    try {
      const res = await fetch('/api/integrations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 's3',
          label: `Cloudflare R2 [${bucket}]`,
          config: {
            bucket,
            endpoint,
            accessKeyId,
            secretAccessKey
          }
        })
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to save Cloudflare R2 credentials');
      }

      setBucket('');
      setEndpoint('');
      setAccessKeyId('');
      setSecretAccessKey('');
      setShowSecretKey(false);
      setShowAddForm(false);
      setLoading(false);
      
      await fetchConnections();
      if (onSaved) onSaved();
    } catch (err) {
      console.error('[CredentialVault] Failed to save S3 in Postgres:', err);
      alert('Error al conectar con Cloudflare R2. Verifica tus credenciales.');
      setLoading(false);
    }
  };

  const handleDisconnect = async (id: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/integrations/${id}`, {
        method: 'DELETE'
      });

      if (!res.ok) throw new Error('Failed to disconnect');

      setLoading(false);
      await fetchConnections();
      if (onSaved) onSaved();
    } catch (err) {
      console.error('[CredentialVault] Failed to delete connection:', err);
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border/40 bg-background/20 backdrop-blur-md p-5 space-y-4 shadow-xl relative overflow-hidden">
      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-[60px] pointer-events-none" />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Shield className="size-4 text-primary animate-pulse" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
            Bóveda Criptográfica Soberana
          </h3>
        </div>
        {connections.length > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowAddForm(!showAddForm)}
            className="h-7 px-2 text-[9px] uppercase tracking-wider rounded-lg border-primary/20 text-primary hover:bg-primary/10"
          >
            <Plus className="size-3 mr-1" /> {showAddForm ? 'Ocultar' : 'Agregar Conexión'}
          </Button>
        )}
      </div>

      {/* Connected Accounts List */}
      {connections.length > 0 ? (
        <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
          {connections.map((conn) => (
            <div
              key={conn.id}
              className={`p-3 rounded-xl border flex items-center justify-between gap-3 animate-in fade-in duration-300 ${
                conn.type === 'mega' 
                  ? 'border-red-500/20 bg-red-950/10' 
                  : 'border-amber-500/20 bg-amber-950/10'
              }`}
            >
              <div className="flex items-center gap-2.5 overflow-hidden">
                <Check className={`size-4 shrink-0 ${conn.type === 'mega' ? 'text-red-500' : 'text-amber-500'}`} />
                <div className="overflow-hidden">
                  <span className={`block text-[8px] font-bold uppercase tracking-wider leading-tight ${
                    conn.type === 'mega' ? 'text-red-500' : 'text-amber-500'
                  }`}>
                    {conn.type === 'mega' ? 'MEGA' : 'Cloudflare R2'} - Cifrado Activo (Postgres)
                  </span>
                  <span className="text-[11px] font-mono text-zinc-300 truncate block" title={conn.type === 'mega' ? conn.config?.email : conn.config?.bucket}>
                    {conn.type === 'mega' ? conn.config?.email : `bucket: ${conn.config?.bucket}`}
                  </span>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={loading}
                onClick={() => handleDisconnect(conn.id)}
                className="size-8 rounded-full text-zinc-500 hover:text-red-500 hover:bg-red-500/10 shrink-0"
                title="Desconectar cuenta"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        !showAddForm && (
          <p className="text-[10px] text-zinc-500 italic">No hay bóvedas de almacenamiento cifradas conectadas actualmente.</p>
        )
      )}

      {/* Connection Selection Tabs */}
      {(showAddForm || connections.length === 0) && (
        <div className="space-y-4 border-t border-border/20 pt-4">
          <div className="flex rounded-lg bg-muted/30 p-1 border border-border/20">
            <button
              type="button"
              onClick={() => setActiveTab('mega')}
              className={`flex-1 py-1.5 rounded-md text-[9px] uppercase tracking-wider font-bold transition-all ${
                activeTab === 'mega' 
                  ? 'bg-background text-red-500 shadow-sm border border-border/10' 
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              MEGA
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('s3')}
              className={`flex-1 py-1.5 rounded-md text-[9px] uppercase tracking-wider font-bold transition-all ${
                activeTab === 's3' 
                  ? 'bg-background text-amber-500 shadow-sm border border-border/10' 
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Cloudflare R2
            </button>
          </div>

          {/* Form MEGA */}
          {activeTab === 'mega' && (
            <form onSubmit={handleSaveMega} className="space-y-3 animate-in slide-in-from-top-2 duration-300">
              <p className="text-[9px] text-zinc-500 leading-normal">
                MEGA no utiliza OAuth. Ingresa tus credenciales de acceso para persistir tu almacenamiento soberano de forma segura.
              </p>
              <div className="p-2 rounded-lg bg-red-950/15 border border-red-500/20 text-[9px] text-red-400 space-y-1 leading-normal">
                <span className="font-bold block uppercase tracking-wider text-[8px] text-red-500">🛡️ Límite de Seguridad Activo</span>
                Se ha activado un límite estricto de 2GB por archivo en streaming y descargas para proteger tus cuentas gratuitas contra bloqueos por cuota. Se recomienda utilizar cuentas Premium para evitar restricciones de MEGA.
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  required
                  placeholder="correo@ejemplo.com"
                  className="w-full rounded-lg border border-border/40 bg-muted/20 px-3 py-2 text-[11px] placeholder-zinc-600 focus:border-red-500/60 focus:outline-none transition-all font-mono"
                />
              </div>

              <div className="space-y-1 relative">
                <label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Contraseña</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                    required
                    placeholder="••••••••••••"
                    className="w-full rounded-lg border border-border/40 bg-muted/20 pl-3 pr-9 py-2 text-[11px] placeholder-zinc-600 focus:border-red-500/60 focus:outline-none transition-all font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                  >
                    {showPassword ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                  </button>
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                {connections.length > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setShowAddForm(false)}
                    className="flex-1 text-[9px] uppercase tracking-wider h-9 rounded-xl border border-border/40"
                  >
                    Cancelar
                  </Button>
                )}
                <Button
                  type="submit"
                  disabled={loading || !email || !password}
                  className="flex-1 bg-red-600 hover:bg-red-500 text-white font-bold text-[9px] uppercase tracking-wider h-9 rounded-xl transition-all shadow-lg"
                >
                  {loading ? <Loader2 className="size-3.5 animate-spin mx-auto" /> : 'Conectar MEGA'}
                </Button>
              </div>
            </form>
          )}

          {/* Form Cloudflare R2 / S3 */}
          {activeTab === 's3' && (
            <form onSubmit={handleSaveS3} className="space-y-3 animate-in slide-in-from-top-2 duration-300">
              <p className="text-[9px] text-zinc-500 leading-normal">
                Cloudflare R2 no utiliza OAuth. Ingresa tus llaves privadas de acceso de AWS S3 / R2 para habilitar tu silo de almacenamiento privado. Las llaves se encriptan al instante.
              </p>
              
              <div className="p-2 rounded-lg bg-amber-950/15 border border-amber-500/20 text-[9px] text-amber-400 space-y-1 leading-normal">
                <span className="font-bold block uppercase tracking-wider text-[8px] text-amber-500">⚡ Recompensa de Cero Egress</span>
                Almacenamiento ultra rápido de imágenes y videos pesados. Cero cobros por descarga o transferencia de datos.
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Nombre del Bucket</label>
                  <input
                    type="text"
                    value={bucket}
                    onChange={(e) => setBucket(e.target.value)}
                    disabled={loading}
                    required
                    placeholder="mi-bucket"
                    className="w-full rounded-lg border border-border/40 bg-muted/20 px-3 py-2 text-[11px] placeholder-zinc-600 focus:border-amber-500/60 focus:outline-none transition-all font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Endpoint URL</label>
                  <input
                    type="url"
                    value={endpoint}
                    onChange={(e) => setEndpoint(e.target.value)}
                    disabled={loading}
                    required
                    placeholder="https://...r2.cloudflarestorage.com"
                    className="w-full rounded-lg border border-border/40 bg-muted/20 px-3 py-2 text-[11px] placeholder-zinc-600 focus:border-amber-500/60 focus:outline-none transition-all font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Access Key ID</label>
                <input
                  type="text"
                  value={accessKeyId}
                  onChange={(e) => setAccessKeyId(e.target.value)}
                  disabled={loading}
                  required
                  placeholder="f1e6b3..."
                  className="w-full rounded-lg border border-border/40 bg-muted/20 px-3 py-2 text-[11px] placeholder-zinc-600 focus:border-amber-500/60 focus:outline-none transition-all font-mono"
                />
              </div>

              <div className="space-y-1 relative">
                <label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Secret Access Key</label>
                <div className="relative">
                  <input
                    type={showSecretKey ? 'text' : 'password'}
                    value={secretAccessKey}
                    onChange={(e) => setSecretAccessKey(e.target.value)}
                    disabled={loading}
                    required
                    placeholder="••••••••••••••••••••••••••••••••••••••••"
                    className="w-full rounded-lg border border-border/40 bg-muted/20 pl-3 pr-9 py-2 text-[11px] placeholder-zinc-600 focus:border-amber-500/60 focus:outline-none transition-all font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecretKey(!showSecretKey)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                  >
                    {showSecretKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                  </button>
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                {connections.length > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setShowAddForm(false)}
                    className="flex-1 text-[9px] uppercase tracking-wider h-9 rounded-xl border border-border/40"
                  >
                    Cancelar
                  </Button>
                )}
                <Button
                  type="submit"
                  disabled={loading || !bucket || !endpoint || !accessKeyId || !secretAccessKey}
                  className="flex-1 bg-amber-600 hover:bg-amber-500 text-white font-bold text-[9px] uppercase tracking-wider h-9 rounded-xl transition-all shadow-lg"
                >
                  {loading ? <Loader2 className="size-3.5 animate-spin mx-auto" /> : 'Conectar Cloudflare R2'}
                </Button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

export default CredentialVault;


