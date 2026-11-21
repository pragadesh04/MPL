import 'server-only';
import { eq } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { getReadDb } from '../db/client';
import { users } from '../db/schema';
import { env } from '../env';
import { unauthenticated } from '../errors';
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  signSessionToken,
  verifySessionToken,
} from './session-token';

/**
 * Session cookie helpers (PLAN §5 Access control): an httpOnly JWT holding only `userId`.
 * `setSession` / `clearSession` work in Route Handlers and Server Actions; the getters also work
 * in Server Components.
 */

export async function setSession(userId: string): Promise<void> {
  const token = await signSessionToken(userId, env().JWT_SECRET);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env().NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

/** The logged-in user id, or null. Does not hit the database. */
export async function getSessionUserId(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return verifySessionToken(token, env().JWT_SECRET);
}

/** Throws 401 when not logged in. */
export async function requireSessionUserId(): Promise<string> {
  const userId = await getSessionUserId();
  if (!userId) throw unauthenticated();
  return userId;
}

export interface SessionUser {
  id: string;
  username: string;
  displayName: string;
  ign: string | null;
  photoUrl: string | null;
  isOrganiser: boolean;
  playerCode: string;
  organiserKey: string | null;
}

/** The logged-in user public profile (never the password hash), or null. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const userId = await getSessionUserId();
  if (!userId) return null;
  const [row] = await getReadDb()
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      ign: users.ign,
      photoUrl: users.photoUrl,
      isOrganiser: users.isOrganiser,
      playerCode: users.playerCode,
      organiserKey: users.organiserKey,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row ?? null;
}
