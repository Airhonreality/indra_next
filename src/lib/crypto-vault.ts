/**
 * 🔒 Sovereign Client-side Cryptographic Vault
 * ──────────────────────────────────────────
 * Implements native AES-256-GCM encryption and decryption on the client.
 * Derives cryptographic keys in-browser using PBKDF2 with the user's session ID (userId) as seed,
 * completely satisfying ADR-STORAGE-004.
 */

// Helper to convert Uint8Array to Hex string without external dependencies
function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Helper to convert Hex string to Uint8Array without external dependencies
function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

// Derive a secure CryptoKey from the user's unique userId
async function deriveKey(userId: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const baseKey = await window.crypto.subtle.importKey(
    'raw',
    encoder.encode(userId),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  const salt = encoder.encode('indra-sovereign-mega-salt-2026');
  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts a JSON payload (e.g. MEGA email/password) on the client.
 * Returns formatted AES-GCM string: "ivHex:authTagHex:ciphertextHex"
 */
export async function encryptPayload(payload: any, userId: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(JSON.stringify(payload));
  const key = await deriveKey(userId);
  
  // IV of 12 bytes is standard for AES-GCM
  const iv = window.crypto.getRandomValues(new Uint8Array(12));

  const encryptedBuffer = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as any },
    key,
    data as any
  );

  const encryptedBytes = new Uint8Array(encryptedBuffer);

  // Web Crypto AES-GCM appends the 16-byte authentication tag at the end of the ciphertext
  const authTag = encryptedBytes.slice(-16);
  const ciphertext = encryptedBytes.slice(0, -16);

  const ivHex = toHex(iv);
  const authTagHex = toHex(authTag);
  const ciphertextHex = toHex(ciphertext);

  return `${ivHex}:${authTagHex}:${ciphertextHex}`;
}

/**
 * Decrypts a previously encrypted client-side payload.
 */
export async function decryptPayload(encryptedStr: string, userId: string): Promise<any> {
  const parts = encryptedStr.split(':');
  if (parts.length !== 3) {
    throw new Error('Malformed encrypted payload format. Expected 3 colon-separated segments.');
  }

  const iv = fromHex(parts[0]);
  const authTag = fromHex(parts[1]);
  const ciphertext = fromHex(parts[2]);

  // Combine ciphertext and auth tag back for Web Crypto API
  const combined = new Uint8Array(ciphertext.length + authTag.length);
  combined.set(ciphertext);
  combined.set(authTag, ciphertext.length);

  const key = await deriveKey(userId);

  const decryptedBuffer = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as any },
    key,
    combined as any
  );

  const decoder = new TextDecoder();
  return JSON.parse(decoder.decode(decryptedBuffer));
}
