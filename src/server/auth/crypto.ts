import 'server-only';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * AES-256-GCM authenticated encryption, output as URL-safe Base64 of `iv | ciphertext | authTag`
 * (PLAN §2.2). Used for personal invite links (INVITE_LINK_SECRET, Lane A) and for webhook URLs
 * and signing secrets at rest (APP_ENCRYPTION_KEY, Lane B).
 *
 * The 256-bit key is SHA-256(secret), so any secret of 32+ chars works. A tampered or invented
 * value fails authentication and `decrypt` returns null; callers answer with the generic 404.
 */
const IV_BYTES = 12;
const TAG_BYTES = 16;

function deriveKey(secret: string): Buffer {
  return createHash('sha256').update(secret, 'utf8').digest();
}

export function encrypt(plaintext: string, secret: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(secret), iv);
  const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, body, cipher.getAuthTag()]).toString('base64url');
}

export function decrypt(token: string, secret: string): string | null {
  try {
    const raw = Buffer.from(token, 'base64url');
    if (raw.length < IV_BYTES + TAG_BYTES + 1) return null;
    const iv = raw.subarray(0, IV_BYTES);
    const tag = raw.subarray(raw.length - TAG_BYTES);
    const body = raw.subarray(IV_BYTES, raw.length - TAG_BYTES);
    const decipher = createDecipheriv('aes-256-gcm', deriveKey(secret), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

export function encryptJson(value: unknown, secret: string): string {
  return encrypt(JSON.stringify(value), secret);
}

/** Parsed JSON, or null when the token is invalid. Validate the result with Zod. */
export function decryptJson(token: string, secret: string): unknown {
  const text = decrypt(token, secret);
  if (text === null) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}
