import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 12 bytes standard IV for GCM

/**
 * Deriva una clave única de 256 bits para cada usuario usando PBKDF2.
 * Combina la clave maestra ENCRYPTION_SECRET con el userId único como salt
 * para lograr aislamiento criptográfico absoluto a nivel de base de datos.
 */
function deriveUserKey(userId: string): Buffer {
  const secret = process.env.ENCRYPTION_SECRET || 'fallback-master-secret-key-indra-2026-development-only';
  
  if (!process.env.ENCRYPTION_SECRET) {
    console.warn('[Crypto] Warning: ENCRYPTION_SECRET is not configured. Using fallback secret for development.');
  }

  // Usamos el userId único como salt para que la clave derivada sea única por usuario
  const salt = Buffer.from(userId, 'utf-8');
  return crypto.pbkdf2Sync(
    secret,
    salt,
    100000, // 100k iteraciones
    32, // 32 bytes (256 bits)
    'sha256'
  );
}

/**
 * Encripta un objeto JSON (por ejemplo, credenciales de MEGA) en el servidor.
 * Retorna una cadena con formato "ivHex:authTagHex:ciphertextHex".
 */
export function encryptServerPayload(payload: any, userId: string): string {
  const key = deriveUserKey(userId);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  const text = JSON.stringify(payload);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag().toString('hex');
  const ivHex = iv.toString('hex');
  
  return `${ivHex}:${authTag}:${encrypted}`;
}

/**
 * Desencripta una cadena cifrada en el servidor usando la clave derivada por usuario.
 */
export function decryptServerPayload(encryptedStr: string, userId: string): any {
  const parts = encryptedStr.split(':');
  if (parts.length !== 3) {
    throw new Error('Malformed encrypted payload format. Expected 3 segments.');
  }

  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const ciphertext = Buffer.from(parts[2], 'hex');

  const key = deriveUserKey(userId);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, undefined, 'utf8');
  decrypted += decipher.final('utf8');

  return JSON.parse(decrypted);
}
