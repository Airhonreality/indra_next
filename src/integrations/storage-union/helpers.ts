import { db } from '@/lib/db';
import { integrations, storageConnections } from '@/core/db/schema';
import { eq, and } from 'drizzle-orm';
import { registry } from '@/core/registry';
import '@/integrations/register-all';
import { IntegrationAdapter, IBlobCapable } from '@/core/types/integration';
import crypto from 'crypto';
import { decryptServerPayload } from '@/lib/server-crypto';

/**
 * Decrypts MEGA credentials from client header (Deprecated fallback).
 * Supports AES-256-GCM (using sessionToken/userId as key), Base64, and plain JSON.
 */
export function decryptMegaCredentials(encryptedData: string, sessionToken: string): any {
  try {
    const parts = encryptedData.split(':');
    if (parts.length !== 3) {
      try {
        const decoded = Buffer.from(encryptedData, 'base64').toString('utf8');
        return JSON.parse(decoded);
      } catch {
        return JSON.parse(encryptedData);
      }
    }

    // Derive a 256-bit key from the session token using PBKDF2Sync matching crypto-vault
    const key = crypto.pbkdf2Sync(
      sessionToken,
      'indra-sovereign-mega-salt-2026',
      100000,
      32,
      'sha256'
    );
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const ciphertext = Buffer.from(parts[2], 'hex');

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final()
    ]).toString('utf8');

    return JSON.parse(decrypted);
  } catch (err: any) {
    console.error('[decryptMegaCredentials] Decryption failed:', err);
    throw new Error('FAILED_TO_DECRYPT_MEGA_CREDENTIALS');
  }
}

// MEGA deshabilitado globalmente: su API puede bloquear la cuenta del usuario ante
// llamadas repetidas/mal manejadas (rate limiting / re-auth) y el adapter no implementa
// el backoff que su propio comentario dice tener. Ver docs/research/INVS Mega storage.md
// (códigos -16 API_EBLOCKED, -4 API_ERATELIMIT, -3 API_EAGAIN) y
// docs/plans/26_PLAN_puente-daemon-nube-hospedada.md. Re-habilitar solo cuando
// src/integrations/mega/adapter.ts implemente manejo real de esos códigos.
const MEGA_ADAPTER_DISABLED = true;

/**
 * Instantiates all active and capable storage upstreams for a given user.
 * Now queries Neon Postgres dedicated tables and decrypts credentials server-side.
 */
export async function getActiveUpstreams(
  userId: string,
  megaCredentials?: any
): Promise<(IntegrationAdapter & Partial<IBlobCapable>)[]> {
  // 1. Obtener integraciones tradicionales (Notion, Drive)
  const activeIntegrations = await db
    .select()
    .from(integrations)
    .where(
      and(
        eq(integrations.userId, userId),
        eq(integrations.isActive, true)
      )
    );

  // 2. Obtener conexiones de almacenamiento dedicadas (MEGA)
  const activeStorage = await db
    .select()
    .from(storageConnections)
    .where(
      and(
        eq(storageConnections.userId, userId),
        eq(storageConnections.isActive, true)
      )
    );

  const upstreams: (IntegrationAdapter & Partial<IBlobCapable>)[] = [];
  const instantiatedTypes = new Set<string>();

  // Procesar integraciones tradicionales (Notion, Drive)
  for (const integration of activeIntegrations) {
    try {
      instantiatedTypes.add(integration.type);
      if (integration.type !== 'mega') {
        const adapter = registry.resolveAdapter(integration.type, integration.connectionId);
        if (adapter) {
          upstreams.push(adapter as any);
        }
      }
    } catch (err) {
      console.error(`Failed to resolve adapter for ${integration.type}:`, err);
    }
  }

  // Procesar conexiones de almacenamiento dedicadas (MEGA encriptado en Postgres)
  for (const storage of activeStorage) {
    try {
      instantiatedTypes.add(storage.provider);
      if (storage.provider === 'mega') {
        if (MEGA_ADAPTER_DISABLED) {
          continue;
        }
        let creds = megaCredentials;
        if (!creds && storage.encryptedCredentials) {
          // Si no se pasaron en cabeceras, las desencriptamos del servidor
          creds = decryptServerPayload(storage.encryptedCredentials, userId);
        }
        if (creds) {
          const adapter = registry.resolveAdapter('mega', creds);
          if (adapter) {
            upstreams.push(adapter as any);
          }
        }
      } else if (storage.encryptedCredentials) {
        const creds = decryptServerPayload(storage.encryptedCredentials, userId);
        if (creds) {
          const adapter = registry.resolveAdapter(storage.provider, creds);
          if (adapter) upstreams.push(adapter as any);
        }
      }
    } catch (err) {
      console.error(`Failed to resolve storage adapter for ${storage.provider}:`, err);
    }
  }

  // Google OAuth Family Fallback: a single Google authentication activates Drive, Sheets and YouTube
  const googleConn = activeIntegrations.find(i => i.type === 'google-drive');
  if (googleConn) {
    // 1. Google Sheets Fallback
    if (!instantiatedTypes.has('google-sheets')) {
      try {
        const sheetsAdapter = registry.resolveAdapter('google-sheets', googleConn.connectionId);
        if (sheetsAdapter) {
          upstreams.push(sheetsAdapter as any);
        }
      } catch (err) {
        // sheets adapter not registered or failed
      }
    }

    // 2. YouTube Fallback
    if (!instantiatedTypes.has('youtube')) {
      try {
        const youtubeAdapter = registry.resolveAdapter('youtube', googleConn.connectionId);
        if (youtubeAdapter) {
          upstreams.push(youtubeAdapter as any);
        }
      } catch (err) {
        // youtube adapter not registered or failed
      }
    }
  }

  return upstreams;
}
