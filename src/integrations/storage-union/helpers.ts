import { db } from '@/lib/db';
import { integrations } from '@/core/db/schema';
import { eq, and } from 'drizzle-orm';
import { registry } from '@/core/registry';
import '@/integrations/register-all';
import { IntegrationAdapter, IBlobCapable } from '@/core/types/integration';
import crypto from 'crypto';

/**
 * Decrypts MEGA credentials from client header.
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

/**
 * Instantiates all active and capable storage upstreams for a given user.
 */
export async function getActiveUpstreams(
  userId: string,
  megaCredentials?: any
): Promise<(IntegrationAdapter & Partial<IBlobCapable>)[]> {
  const activeIntegrations = await db
    .select()
    .from(integrations)
    .where(
      and(
        eq(integrations.userId, userId),
        eq(integrations.isActive, true)
      )
    );

  const upstreams: (IntegrationAdapter & Partial<IBlobCapable>)[] = [];
  const instantiatedTypes = new Set<string>();

  for (const integration of activeIntegrations) {
    try {
      instantiatedTypes.add(integration.type);
      if (integration.type === 'mega') {
        if (megaCredentials) {
          const adapter = registry.resolveAdapter('mega', megaCredentials);
          if (adapter) {
            upstreams.push(adapter as any);
          }
        }
      } else {
        const adapter = registry.resolveAdapter(integration.type, integration.connectionId);
        if (adapter) {
          upstreams.push(adapter as any);
        }
      }
    } catch (err) {
      console.error(`Failed to resolve adapter for ${integration.type}:`, err);
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
