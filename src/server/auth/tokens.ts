import 'server-only';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Single-use secrets for organiser invites and password resets (PLAN §2.4, §2.5): a random
 * 32-byte token goes in the link, only its SHA-256 is stored.
 */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Constant-time comparison of two strings. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** [0, 1) from crypto, for rule functions that take an injectable `random`. */
export function cryptoRandom(): number {
  return randomBytes(4).readUInt32BE(0) / 0x1_0000_0000;
}
