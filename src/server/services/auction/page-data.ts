import 'server-only';
import { and, eq, inArray } from 'drizzle-orm';
import { can } from '@/lib/permissions';
import type { AuctionSnapshot } from '@/lib/schemas/auction';
import type { AuctionViewer, RosterPerson } from '@/features/auction/shared/types';
import type { TournamentStatus } from '@/lib/schemas/enums';
import { parseSettings, type TournamentSettings } from '@/lib/schemas/settings';
import { getDb } from '../../db/client';
import { leaders, memberships, players, teams, tournaments, users } from '../../db/schema';
import { notFound } from '../../errors';

export type { AuctionViewer, RosterPerson };
import { requireParticipant, requireRole } from '../roles';
import { assertLiveCode, getAuctionSnapshot, getLiveAuctionSnapshot } from './snapshot';

/**
 * Data the auction screens need on first render (Server Components), on top of the snapshot.
 * Everything is scoped to one tournament and resolved from the session's role in it.
 */

export interface AuctionPageData {
  tournament: { id: string; name: string; liveCode: string; status: TournamentStatus };
  settings: TournamentSettings;
  snapshot: AuctionSnapshot;
  viewer: AuctionViewer;
  /** Organisers' display names (controller banner, "entered by"). */
  organisers: { userId: string; name: string; role: string }[];
  /** teamId → captain's user id, for the presence dots. */
  captainUserIds: Record<string, string | null>;
}

async function loadExtras(tournamentId: string) {
  const db = getDb();
  const [tour] = await db
    .select({
      id: tournaments.id,
      name: tournaments.name,
      liveCode: tournaments.liveCode,
      status: tournaments.status,
      settings: tournaments.settings,
    })
    .from(tournaments)
    .where(eq(tournaments.id, tournamentId));
  if (!tour) throw notFound();
  const organisers = await db
    .select({ userId: memberships.userId, name: users.displayName, role: memberships.role })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.tournamentId, tournamentId));
  const captains = await db
    .select({ teamId: teams.id, userId: leaders.userId })
    .from(teams)
    .innerJoin(leaders, eq(leaders.id, teams.leaderId))
    .where(eq(teams.tournamentId, tournamentId));
  return {
    tournament: { id: tour.id, name: tour.name, liveCode: tour.liveCode, status: tour.status },
    settings: parseSettings(tour.settings),
    organisers,
    captainUserIds: Object.fromEntries(captains.map((c) => [c.teamId, c.userId])),
  };
}

export async function getAuctionPageData(
  userId: string | null,
  tournamentId: string,
): Promise<AuctionPageData> {
  const access = await requireParticipant(userId, tournamentId);
  const snapshot = await getAuctionSnapshot(access.userId, tournamentId);
  const extras = await loadExtras(tournamentId);
  return {
    ...extras,
    snapshot,
    viewer: {
      userId: access.userId,
      roles: access.roles,
      teamId: access.teamId,
      playerId: access.playerId,
      canControl: can(access.roles, 'auction:control'),
      canRoster: can(access.roles, 'auction:roster'),
      canReset: can(access.roles, 'auction:reset'),
      canEditLiveSettings: can(access.roles, 'settings:edit'),
      isOrganiser: can(access.roles, 'tournament:view-admin'),
    },
  };
}

/** Big screen (`/live/:liveCode/auction`): no session, live screen must be enabled. */
export async function getLiveAuctionPageData(
  liveCode: string,
): Promise<Omit<AuctionPageData, 'viewer' | 'organisers'>> {
  const [row] = await getDb()
    .select({ id: tournaments.id })
    .from(tournaments)
    .where(eq(tournaments.liveCode, liveCode));
  if (!row) throw notFound();
  await assertLiveCode(row.id, liveCode);
  const snapshot = await getLiveAuctionSnapshot(row.id, liveCode);
  const { organisers: _o, ...extras } = await loadExtras(row.id);
  void _o;
  return { ...extras, snapshot };
}

/** Command post "Registered (n)" table (§7.6a). Organisers only. */
export async function getCommandPostRoster(
  userId: string | null,
  tournamentId: string,
): Promise<RosterPerson[]> {
  await requireRole(userId, tournamentId, 'tournament:view-admin');
  const db = getDb();
  const captainRows = await db
    .select({
      id: leaders.id,
      name: leaders.name,
      ign: leaders.ign,
      username: users.username,
      photoUrl: leaders.photoUrl,
      teamId: teams.id,
      approval: leaders.approval,
    })
    .from(leaders)
    .leftJoin(users, eq(users.id, leaders.userId))
    .leftJoin(teams, eq(teams.leaderId, leaders.id))
    .where(and(eq(leaders.tournamentId, tournamentId), eq(leaders.approval, 'APPROVED')));
  const soldierRows = await db
    .select({
      id: players.id,
      name: players.name,
      ign: players.ign,
      username: users.username,
      photoUrl: players.photoUrl,
      teamId: players.teamId,
      status: players.status,
      price: players.soldPrice,
      acquiredVia: players.acquiredVia,
    })
    .from(players)
    .leftJoin(users, eq(users.id, players.userId))
    .where(
      and(
        eq(players.tournamentId, tournamentId),
        inArray(players.status, ['POOL', 'ON_BLOCK', 'SOLD', 'UNSOLD', 'ALLOCATED']),
      ),
    );
  return [
    ...captainRows.map((c) => ({
      kind: 'CAPTAIN' as const,
      id: c.id,
      name: c.name,
      ign: c.ign,
      username: c.username,
      photoUrl: c.photoUrl,
      teamId: c.teamId,
      status: 'CAPTAIN',
      price: null,
      acquiredVia: null,
    })),
    ...soldierRows.map((s) => ({ kind: 'SOLDIER' as const, ...s })),
  ].sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
}
