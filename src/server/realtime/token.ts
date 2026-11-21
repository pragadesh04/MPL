import 'server-only';
import type * as Ably from 'ably';
import { and, eq, ne, notInArray } from 'drizzle-orm';
import type { TournamentRole } from '@/lib/schemas/domain';
import { getReadDb, type Db } from '../db/client';
import { leaders, memberships, players, tournaments } from '../db/schema';
import { AppError, notFound } from '../errors';
import {
  buildLiveScreenCapability,
  buildUserCapability,
  type TournamentAccessSummary,
} from './capability';
import { ablyRest, isRealtimeEnabled } from './publisher';

/** Token lifetime (PLAN §6.3: 1 hour, renewed automatically by the SDK). */
export const TOKEN_TTL_MS = 60 * 60 * 1000;

/**
 * Every tournament the user takes part in with an approved role (same rules as
 * `loadTournamentRole`, in three small queries). Archived tournaments are skipped.
 */
export async function listUserTournamentAccess(
  userId: string,
  db: Db = getReadDb(),
): Promise<TournamentAccessSummary[]> {
  const live = notInArray(tournaments.status, ['COMPLETED', 'CANCELLED']);
  const [ms, ls, ps] = await Promise.all([
    db
      .select({ tournamentId: memberships.tournamentId, role: memberships.role })
      .from(memberships)
      .innerJoin(tournaments, eq(tournaments.id, memberships.tournamentId))
      .where(and(eq(memberships.userId, userId), live)),
    db
      .select({ tournamentId: leaders.tournamentId })
      .from(leaders)
      .innerJoin(tournaments, eq(tournaments.id, leaders.tournamentId))
      .where(and(eq(leaders.userId, userId), eq(leaders.approval, 'APPROVED'), live)),
    db
      .select({ tournamentId: players.tournamentId })
      .from(players)
      .innerJoin(tournaments, eq(tournaments.id, players.tournamentId))
      .where(
        and(
          eq(players.userId, userId),
          notInArray(players.status, ['PENDING_APPROVAL', 'REJECTED']),
          live,
        ),
      ),
  ]);

  const byId = new Map<string, TournamentRole[]>();
  const add = (id: string, role: TournamentRole): void => {
    byId.set(id, [...(byId.get(id) ?? []), role]);
  };
  for (const m of ms) add(m.tournamentId, m.role);
  for (const l of ls) add(l.tournamentId, 'CAPTAIN');
  for (const p of ps) add(p.tournamentId, 'SOLDIER');
  return [...byId].map(([tournamentId, roles]) => ({ tournamentId, roles }));
}

function ensureEnabled(): void {
  if (!isRealtimeEnabled()) {
    throw new AppError('SERVICE_UNAVAILABLE', 'Real-time is not configured (ABLY_API_KEY missing)');
  }
}

/** Ably TokenRequest for a logged-in user (subscribe-only, limited to their tournaments). */
export async function createUserTokenRequest(userId: string): Promise<Ably.TokenRequest> {
  ensureEnabled();
  const access = await listUserTournamentAccess(userId);
  return ablyRest().auth.createTokenRequest({
    clientId: userId,
    ttl: TOKEN_TTL_MS,
    capability: buildUserCapability(userId, access),
  });
}

/** Ably TokenRequest for the public big screen `/live/:liveCode` (only while enabled). */
export async function createLiveScreenTokenRequest(
  liveCode: string,
  db: Db = getReadDb(),
): Promise<Ably.TokenRequest> {
  ensureEnabled();
  const [t] = await db
    .select({ id: tournaments.id })
    .from(tournaments)
    .where(
      and(
        eq(tournaments.liveCode, liveCode),
        eq(tournaments.liveScreenEnabled, true),
        ne(tournaments.status, 'CANCELLED'),
      ),
    )
    .limit(1);
  if (!t) throw notFound();
  return ablyRest().auth.createTokenRequest({
    clientId: `live:${t.id}`,
    ttl: TOKEN_TTL_MS,
    capability: buildLiveScreenCapability(t.id),
  });
}
