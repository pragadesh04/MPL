import 'server-only';
import { notFound, redirect } from 'next/navigation';
import type { Permission } from '@/lib/schemas/domain';
import { getSessionUserId } from '@/server/auth/session';
import { isAppError } from '@/server/errors';
import { requireRole, type TournamentAccess } from '@/server/services/roles';

/**
 * Server Component guard for Lane A tournament pages. No session → /login (with `next`); no role,
 * a role without the permission, or an unknown tournament → the generic 404 page (PLAN §2.0:
 * never reveal that someone else's tournament exists).
 */
export async function pageAccess(
  tournamentId: string,
  permission: Permission,
  path: string,
): Promise<TournamentAccess> {
  const userId = await getSessionUserId();
  if (!userId) redirect(`/login?next=${encodeURIComponent(path)}`);
  try {
    return await requireRole(userId, tournamentId, permission);
  } catch (err) {
    if (isAppError(err) && (err.status === 404 || err.status === 403)) notFound();
    throw err;
  }
}

/** Run a service read in a page; turn 404 / 403 into the not-found page. */
export async function orNotFound<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (isAppError(err) && (err.status === 404 || err.status === 403)) notFound();
    throw err;
  }
}

export async function requirePageUser(path: string): Promise<string> {
  const userId = await getSessionUserId();
  if (!userId) redirect(`/login?next=${encodeURIComponent(path)}`);
  return userId;
}
