'use client';

import React, { useState, useEffect } from 'react';
import { Shield, Key, Eye, EyeOff, Check, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface CredentialVaultProps {
  userId: string;
  onSaved?: () => void;
}

export function CredentialVault({ userId, onSaved }: CredentialVaultProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [savedEmail, setSavedEmail] = useState('');
  const [megaIntegrationId, setMegaIntegrationId] = useState<string | null>(null);

  // Check connection status from server (Neon Postgres)
  const checkVault = async () => {
    try {
      const res = await fetch('/api/integrations');
      if (!res.ok) throw new Error('Failed to fetch integrations');
      const data = await res.json();
      
      const megaConn = data.integrations?.find((i: any) => i.type === 'mega');
      if (megaConn) {
        setIsConnected(true);
        setSavedEmail(megaConn.config?.email || '');
        setMegaIntegrationId(megaConn.id);
      } else {
        setIsConnected(false);
        setSavedEmail('');
        setMegaIntegrationId(null);
      }
    } catch (err) {
      console.error('[CredentialVault] Failed to retrieve server connections:', err);
    }
  };

  useEffect(() => {
    checkVault();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
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
          label: 'MEGA Sovereign Storage',
          config: {
            email,
            password
          }
        })
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to save credentials');
      }

      const data = await res.json();
      setIsConnected(true);
      setSavedEmail(email);
      setMegaIntegrationId(data.integration?.id || null);
      setEmail('');
      setPassword('');
      setLoading(false);
      if (onSaved) onSaved();
    } catch (err) {
      console.error('[CredentialVault] Failed to save in Postgres vault:', err);
      alert('Error al conectar con MEGA. Verifica tus credenciales.');
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!megaIntegrationId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/integrations/${megaIntegrationId}`, {
        method: 'DELETE'
      });

      if (!res.ok) throw new Error('Failed to disconnect');

      setIsConnected(false);
      setSavedEmail('');
      setMegaIntegrationId(null);
      setLoading(false);
      if (onSaved) onSaved();
    } catch (err) {
      console.error('[CredentialVault] Failed to delete connection:', err);
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border/40 bg-background/20 backdrop-blur-md p-5 space-y-4 shadow-xl">
      <div className="flex items-center gap-2.5">
        <Shield className="size-4 text-red-500 animate-pulse" />
        <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
          Bóveda Criptográfica MEGA
        </h3>
      </div>

      {isConnected ? (
        <div className="space-y-3 animate-in fade-in duration-300">
          <div className="p-3.5 rounded-xl border border-emerald-500/20 bg-emerald-950/15 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <Check className="size-4 text-emerald-500 shrink-0" />
              <div className="overflow-hidden">
                <span className="block text-[8px] font-bold uppercase tracking-wider text-emerald-500 leading-tight">
                  Conexión Activa (Neon Postgres)
                </span>
                <span className="text-[11px] font-mono text-zinc-300 truncate block" title={savedEmail}>
                  {savedEmail}
                </span>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={loading}
              onClick={handleDisconnect}
              className="size-8 rounded-full text-zinc-500 hover:text-red-500 hover:bg-red-500/10 shrink-0"
              title="Desconectar cuenta"
            >
              {loading ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Trash2 className="size-3.5" />
              )}
            </Button>
          </div>
          <p className="text-[9px] text-zinc-500 leading-normal">
            Tus credenciales están almacenadas de forma segura y encriptadas (AES-256-GCM) en Neon Postgres, garantizando aislamiento multi-tenant absoluto.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-3 animate-in fade-in duration-300">
          <p className="text-[9px] text-zinc-500 leading-normal">
            MEGA no utiliza OAuth. Ingresa tus credenciales de acceso para persistir tu almacenamiento soberano de forma segura.
          </p>

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

          <Button
            type="submit"
            disabled={loading || !email || !password}
            className="w-full bg-red-600 hover:bg-red-500 text-white font-bold text-[9px] uppercase tracking-wider h-9 rounded-xl transition-all shadow-lg shadow-red-600/10 mt-1"
          >
            {loading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <>
                <Key className="size-3 mr-1.5" /> Conectar MEGA
              </>
            )}
          </Button>
        </form>
      )}
    </div>
  );
}
export default CredentialVault;

