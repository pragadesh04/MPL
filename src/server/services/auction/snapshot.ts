import 'server-only';
import { and, asc, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { nextValidBid } from '@/lib/rules/nextValidBid';
import type { AuctionSnapshot } from '@/lib/schemas/auction';
import { parseSettings } from '@/lib/schemas/settings';
import { getDb, type Db } from '../../db/client';
import { auctionState, bids, leaders, players, teams, tournaments } from '../../db/schema';
import { dbNow } from '../../db/sql';
import { notFound, ruleViolation } from '../../errors';
import { requireParticipant } from '../roles';
import { effectiveBasePrice, isSettleDue, parseLastResult } from './engine';
import { runAuctionWrite } from './run';

/**
 * `GET /api/tournaments/:id/auction` (PLAN §5 API, §6.3). The snapshot clients load first, after
 * every reconnect, on a version gap and as the 10 s heartbeat. It settles anything due first.
 *
 * Contract note: `AuctionSnapshot.current` has no player details, so the soldier on the block is
 * listed first in `pool` with status `ON_BLOCK` (integration note in docs/lanes/LANE-B.md).
 */

const RECENT_BIDS = 30;

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

/** Read the full snapshot in one repeatable-read transaction so its parts agree. */
export async function buildSnapshot(
  tournamentId: string,
  db: Db = getDb(),
): Promise<AuctionSnapshot> {
  return db.transaction(
    async (tx) => {
      const [head] = await tx
        .select({
          status: tournaments.status,
          settings: tournaments.settings,
          rosterVersion: tournaments.rosterVersion,
          state: auctionState,
        })
        .from(tournaments)
        .leftJoin(auctionState, eq(auctionState.tournamentId, tournaments.id))
        .where(eq(tournaments.id, tournamentId));
      if (!head) throw notFound();
      if (!head.state)
        throw ruleViolation('AUCTION_NOT_STARTED', 'The auction has not started yet');
      const state = head.state;
      const settings = parseSettings(head.settings);
      const now = await dbNow(tx);

      const teamRows = await tx
        .select({
          id: teams.id,
          leaderId: teams.leaderId,
          captainName: leaders.name,
          name: teams.name,
          shortName: teams.shortName,
          color: teams.color,
          logoUrl: teams.logoUrl,
          emoji: teams.emoji,
          sortOrder: teams.sortOrder,
          purseTotal: leaders.purseTotal,
          purseRemaining: leaders.purseRemaining,
        })
        .from(teams)
        .innerJoin(leaders, eq(leaders.id, teams.leaderId))
        .where(and(eq(teams.tournamentId, tournamentId), eq(leaders.approval, 'APPROVED')))
        .orderBy(asc(teams.sortOrder), asc(teams.name));

      const memberRows = await tx
        .select({
          playerId: players.id,
          teamId: players.teamId,
          name: players.name,
          ign: players.ign,
          photoUrl: players.photoUrl,
          price: players.soldPrice,
          acquiredVia: players.acquiredVia,
        })
        .from(players)
        .where(
          and(
            eq(players.tournamentId, tournamentId),
            inArray(players.status, ['SOLD', 'ALLOCATED']),
            isNotNull(players.teamId),
          ),
        )
        .orderBy(desc(players.soldPrice), asc(players.name));

      const waiting = await tx
        .select({
          id: players.id,
          name: players.name,
          ign: players.ign,
          photoUrl: players.photoUrl,
          basePrice: players.basePrice,
          status: players.status,
          auctionOrder: players.auctionOrder,
        })
        .from(players)
        .where(
          and(
            eq(players.tournamentId, tournamentId),
            inArray(players.status, ['ON_BLOCK', 'POOL', 'UNSOLD']),
          ),
        )
        .orderBy(
          sql`${players.status} <> 'ON_BLOCK'`,
          sql`${players.auctionOrder} asc nulls last`,
          asc(players.name),
        );

      const recent = await tx
        .select({
          id: bids.id,
          playerId: bids.playerId,
          teamId: bids.teamId,
          amount: bids.amount,
          isFallback: bids.isFallback,
          createdAt: bids.createdAt,
        })
        .from(bids)
        .where(eq(bids.tournamentId, tournamentId))
        .orderBy(desc(bids.id))
        .limit(RECENT_BIDS);

      const onBlock = waiting.find((p) => p.id === state.currentPlayerId) ?? null;
      const current =
        state.currentPlayerId && onBlock
          ? (() => {
              const basePrice = effectiveBasePrice(onBlock.basePrice, state.round, settings);
              return {
                playerId: onBlock.id,
                basePrice,
                originalBasePrice: onBlock.basePrice,
                isReauction: state.round > 1,
                currentBid: state.currentBid,
                currentTeamId: state.currentTeamId,
                nextBid: nextValidBid(
                  { basePrice, currentBid: state.currentBid },
                  settings.bidIncrements,
                ),
                endsAt: iso(state.endsAt),
              };
            })()
          : null;

      return {
        tournamentId,
        serverNow: now.toISOString(),
        version: state.version,
        rosterVersion: head.rosterVersion,
        status: head.status,
        round: state.round,
        current,
        nextAt: iso(state.nextAt),
        pausedRemainingMs: state.pausedRemainingMs,
        controllerUserId: state.controllerUserId,
        lastResult: parseLastResult(state.lastResult),
        teams: teamRows.map((t) => {
          const members = memberRows
            .filter((m) => m.teamId === t.id)
            .map((m) => ({
              playerId: m.playerId,
              name: m.name,
              ign: m.ign,
              photoUrl: m.photoUrl,
              price: m.price ?? 0,
              acquiredVia: m.acquiredVia ?? 'AUCTION',
            }));
          return {
            ...t,
            spent: t.purseTotal - t.purseRemaining,
            squadSize: 1 + members.length,
            members,
          };
        }),
        pool: waiting.filter((p) => p.status !== 'UNSOLD'),
        unsold: waiting.filter((p) => p.status === 'UNSOLD'),
        recentBids: recent.map((b) => ({ ...b, createdAt: b.createdAt.toISOString() })),
      };
    },
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  );
}

/**
 * Run settleDue only if something is due (cheap unlocked check first), so the many snapshot
 * reads and ticks don't all queue on the row lock. Returns the number of steps applied.
 */
export async function settleIfDue(tournamentId: string): Promise<number> {
  const [row] = await getDb()
    .select({
      status: tournaments.status,
      currentPlayerId: auctionState.currentPlayerId,
      endsAt: auctionState.endsAt,
      nextAt: auctionState.nextAt,
      now: sql<Date | string>`now()`,
    })
    .from(auctionState)
    .innerJoin(tournaments, eq(tournaments.id, auctionState.tournamentId))
    .where(eq(auctionState.tournamentId, tournamentId));
  if (!row) return 0;
  const now = row.now instanceof Date ? row.now : new Date(row.now);
  if (!isSettleDue(row.status, row, now)) return 0;
  const { settledSteps } = await runAuctionWrite({ tournamentId, actorUserId: null });
  return settledSteps;
}

/** Snapshot for a participant (404 for anyone without a role in this tournament). */
export async function getAuctionSnapshot(
  userId: string | null,
  tournamentId: string,
): Promise<AuctionSnapshot> {
  await requireParticipant(userId, tournamentId);
  await settleIfDue(tournamentId);
  return buildSnapshot(tournamentId);
}

/**
 * Big-screen access (`/live/:liveCode`, no login, §7.7): the live code must belong to this
 * tournament and the live screen must be enabled. Anything else is the generic 404.
 */
export async function assertLiveCode(tournamentId: string, liveCode: string): Promise<void> {
  const [row] = await getDb()
    .select({ id: tournaments.id })
    .from(tournaments)
    .where(
      and(
        eq(tournaments.id, tournamentId),
        eq(tournaments.liveCode, liveCode),
        eq(tournaments.liveScreenEnabled, true),
      ),
    );
  if (!row) throw notFound();
}

/** `POST …/auction/tick`: the idempotent nudge every client sends when a countdown hits 0. */
export async function tickAuction(
  access: { userId: string | null; liveCode?: string | null },
  tournamentId: string,
): Promise<AuctionSnapshot> {
  if (access.liveCode) await assertLiveCode(tournamentId, access.liveCode);
  else await requireParticipant(access.userId, tournamentId);
  await settleIfDue(tournamentId);
  return buildSnapshot(tournamentId);
}

/** Snapshot for the big screen. */
export async function getLiveAuctionSnapshot(
  tournamentId: string,
  liveCode: string,
): Promise<AuctionSnapshot> {
  await assertLiveCode(tournamentId, liveCode);
  await settleIfDue(tournamentId);
  return buildSnapshot(tournamentId);
}
