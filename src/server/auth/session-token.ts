/**
 * JWT encode/decode for the session cookie, without Next.js imports (testable, usable from
 * scripts). The token holds ONLY the user id (`sub`), never a "current tournament" (PLAN §5).
 */
import { jwtVerify, SignJWT } from 'jose';

export const SESSION_COOKIE = 'mpl_session';
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function key(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function signSessionToken(userId: string, secret: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(key(secret));
}

/** The user id, or null for a missing, expired, tampered or malformed token. */
export async function verifySessionToken(
  token: string | undefined | null,
  secret: string,
): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(secret), { algorithms: ['HS256'] });
    return typeof payload.sub === 'string' && payload.sub.length > 0 ? payload.sub : null;
  } catch {
    return null;
  }
}
