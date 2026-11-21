import 'server-only';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { reauctionPrice } from '@/lib/rules/reauctionPrice';
import { breakEndsAt, lotEndsAt } from '@/lib/rules/timers';
import { afterRoundEnds, resolveUnsoldLot } from '@/lib/rules/unsoldPolicy';
import { lastResultSchema, type LastResult } from '@/lib/schemas/auction';
import type { TournamentStatus } from '@/lib/schemas/enums';
import type { AuctionEventType, EventDataMap, UpdateEventType } from '@/lib/schemas/realtime';
import { parseSettings, type TournamentSettings } from '@/lib/schemas/settings';
import type { Db, Tx } from '../../db/client';
import { dbNow } from '../../db/sql';
import {
  auctionState,
  leaders,
  players,
  teams,
  tournaments,
  type AuctionStateRow,
} from '../../db/schema';
import { notFound, ruleViolation } from '../../errors';
import { publishAuction, publishUpdate } from '../../realtime/publisher';
import { writeAudit } from '../audit';
import { bumpRosterVersion } from '../roster';
import { queueWebhookEvents, type OutgoingEvent } from '../webhooks/dispatch';
import { nextPoolPlayerId, requeue, secureRandom } from './pool';

/**
 * The auction engine: everything that happens inside the locked auction transaction
 * (PLAN §3.2–3.3, §6.2). All functions here take an `AuctionCtx` built by `loadAuctionCtx`, which
 * holds the row lock on `auction_state`, the Postgres clock and the events to publish after
 * COMMIT. Nothing here makes a network call (§9 item 28).
 *
 * Versioning: every `t:<id>:auction` event bumps `auction_state.version` by exactly one, so the
 * version is the event sequence clients check (`local + 1`). State changes that clients learn
 * about through `t:<id>:updates` (purses / squads after release, undo, assign) don't bump it.
 */

export interface PendingAuctionEvent {
  type: AuctionEventType;
  version: number;
  data: EventDataMap[AuctionEventType];
}

export interface AuctionCtx {
  tx: Tx;
  tournamentId: string;
  tournamentName: string;
  /** Postgres now() at the start of the transaction — the only clock. */
  now: Date;
  settings: TournamentSettings;
  status: TournamentStatus;
  /** Mutable copy of the locked auction_state row; written back by `persistAuctionCtx`. */
  state: AuctionStateRow;
  actorUserId: string | null;
  random: () => number;
  events: PendingAuctionEvent[];
  webhooks: OutgoingEvent[];
  stateDirty: boolean;
  statusChanged: boolean;
  /** Set when people / squads / purses changed: publish `people.updated` after commit. */
  rosterChanged: boolean;
}

/** Statuses in which the auction exists (auction_state row + console). */
export const AUCTION_STATUSES: readonly TournamentStatus[] = ['AUCTION_LIVE', 'AUCTION_PAUSED'];

/**
 * Lock `auction_state` (`SELECT … FOR UPDATE`) and load what the engine needs. Every auction
 * write for one tournament runs one at a time behind this lock; other tournaments aren't affected.
 */
export async function loadAuctionCtx(
  tx: Tx,
  tournamentId: string,
  actorUserId: string | null,
  random: () => number = secureRandom,
): Promise<AuctionCtx> {
  const [state] = await tx
    .select()
    .from(auctionState)
    .where(eq(auctionState.tournamentId, tournamentId))
    .for('update');
  if (!state) throw ruleViolation('AUCTION_NOT_STARTED', 'The auction has not started yet');
  const [tournament] = await tx
    .select({ name: tournaments.name, status: tournaments.status, settings: tournaments.settings })
    .from(tournaments)
    .where(eq(tournaments.id, tournamentId));
  if (!tournament) throw notFound();
  return {
    tx,
    tournamentId,
    tournamentName: tournament.name,
    now: await dbNow(tx),
    settings: parseSettings(tournament.settings),
    status: tournament.status,
    state: { ...state },
    actorUserId,
    random,
    events: [],
    webhooks: [],
    stateDirty: false,
    statusChanged: false,
    rosterChanged: false,
  };
}

/** Record an auction event with the next version number. */
export function emit<T extends AuctionEventType>(
  ctx: AuctionCtx,
  type: T,
  data: EventDataMap[T],
): void {
  ctx.state.version += 1;
  ctx.stateDirty = true;
  ctx.events.push({ type, version: ctx.state.version, data });
}

export function setStatus(ctx: AuctionCtx, status: TournamentStatus): void {
  if (ctx.status === status) return;
  ctx.status = status;
  ctx.statusChanged = true;
}

export function touchState(ctx: AuctionCtx): void {
  ctx.stateDirty = true;
}

// ─── Reads inside the transaction ─────────────────────────────────────────────────────────

export interface CtxTeam {
  teamId: string;
  leaderId: string;
  name: string;
  shortName: string;
  color: string;
  sortOrder: number;
  purseTotal: number;
  purseRemaining: number;
  /** 1 (captain) + soldiers in the squad. */
  squadSize: number;
}

export async function loadTeams(tx: Db, tournamentId: string): Promise<CtxTeam[]> {
  const rows = await tx
    .select({
      teamId: teams.id,
      leaderId: teams.leaderId,
      name: teams.name,
      shortName: teams.shortName,
      color: teams.color,
      sortOrder: teams.sortOrder,
      purseTotal: leaders.purseTotal,
      purseRemaining: leaders.purseRemaining,
    })
    .from(teams)
    .innerJoin(leaders, eq(leaders.id, teams.leaderId))
    .where(and(eq(teams.tournamentId, tournamentId), eq(leaders.approval, 'APPROVED')));
  const counts = await tx
    .select({ teamId: players.teamId, n: sql<number>`count(*)::int` })
    .from(players)
    .where(
      and(eq(players.tournamentId, tournamentId), inArray(players.status, ['SOLD', 'ALLOCATED'])),
    )
    .groupBy(players.teamId);
  const byTeam = new Map(counts.map((c) => [c.teamId, Number(c.n)]));
  return rows
    .map((r) => ({ ...r, squadSize: 1 + (byTeam.get(r.teamId) ?? 0) }))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

export interface CtxPlayer {
  id: string;
  name: string;
  ign: string | null;
  photoUrl: string | null;
  basePrice: number;
  status: string;
  teamId: string | null;
  soldPrice: number | null;
  acquiredVia: string | null;
}

/** One soldier of THIS tournament (tenant-scoped), or 404. */
export async function loadPlayer(
  tx: Db,
  tournamentId: string,
  playerId: string,
): Promise<CtxPlayer> {
  const [row] = await tx
    .select({
      id: players.id,
      name: players.name,
      ign: players.ign,
      photoUrl: players.photoUrl,
      basePrice: players.basePrice,
      status: players.status,
      teamId: players.teamId,
      soldPrice: players.soldPrice,
      acquiredVia: players.acquiredVia,
    })
    .from(players)
    .where(and(eq(players.id, playerId), eq(players.tournamentId, tournamentId)));
  if (!row) throw notFound();
  return row;
}

export async function countPlayers(
  tx: Db,
  tournamentId: string,
  status: 'POOL' | 'UNSOLD',
): Promise<number> {
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(players)
    .where(and(eq(players.tournamentId, tournamentId), eq(players.status, status)));
  return Number(row?.n ?? 0);
}

/** Effective opening price this round: the re-auction price from round 2 on (§3.1). */
export function effectiveBasePrice(
  original: number,
  round: number,
  settings: TournamentSettings,
): number {
  return round > 1 ? reauctionPrice(original, settings) : original;
}

export function parseLastResult(raw: unknown): LastResult | null {
  const parsed = lastResultSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

// ─── Lots ─────────────────────────────────────────────────────────────────────────────────

/**
 * Put a soldier on the block now: the chosen POOL soldier, or the next one in pool order.
 * Returns false when the pool is empty.
 */
export async function openLot(ctx: AuctionCtx, playerId?: string): Promise<boolean> {
  const id = playerId ?? (await nextPoolPlayerId(ctx.tx, ctx.tournamentId));
  if (!id) return false;
  const player = await loadPlayer(ctx.tx, ctx.tournamentId, id);
  if (player.status !== 'POOL') {
    throw ruleViolation('NOT_IN_POOL', `${player.name} is not in the waiting pool`);
  }
  await ctx.tx.update(players).set({ status: 'ON_BLOCK' }).where(eq(players.id, id));

  const firstLotOfAuction = ctx.state.round === 1 && ctx.state.lastResult === null;
  const basePrice = effectiveBasePrice(player.basePrice, ctx.state.round, ctx.settings);
  const endsAt = lotEndsAt(ctx.now, ctx.settings);
  ctx.state.currentPlayerId = id;
  ctx.state.currentBid = null;
  ctx.state.currentTeamId = null;
  ctx.state.endsAt = endsAt;
  ctx.state.nextAt = null;
  ctx.state.pausedRemainingMs = null;

  const data = {
    playerId: id,
    round: ctx.state.round,
    basePrice,
    originalBasePrice: player.basePrice,
    isReauction: ctx.state.round > 1,
    endsAt: endsAt.toISOString(),
  };
  emit(ctx, 'lot.opened', data);
  if (firstLotOfAuction) ctx.webhooks.push({ event: 'auction.started', data: { round: 1 } });
  ctx.webhooks.push({
    event: 'lot.opened',
    data: { ...data, playerName: player.name, playerIgn: player.ign, photoUrl: player.photoUrl },
  });
  return true;
}

export type CloseMode = 'TIMER' | 'SOLD_BY_ORGANISER' | 'UNSOLD_BY_ORGANISER';

/**
 * Close the current lot (§3.3): SOLD to the highest bidder (purse, squad, audit in this
 * transaction), or no bid → `unsoldPolicy`. Then start the break, or end the round when the
 * pool is empty.
 */
export async function closeLot(ctx: AuctionCtx, mode: CloseMode): Promise<LastResult> {
  const playerId = ctx.state.currentPlayerId;
  if (!playerId) throw ruleViolation('NO_LOT', 'No soldier on the block');
  const player = await loadPlayer(ctx.tx, ctx.tournamentId, playerId);
  const teamsNow = await loadTeams(ctx.tx, ctx.tournamentId);
  const bid = ctx.state.currentBid;
  const leader = teamsNow.find((t) => t.teamId === ctx.state.currentTeamId);
  const playerInfo = { playerName: player.name, playerIgn: player.ign, photoUrl: player.photoUrl };
  const actor = mode === 'TIMER' ? null : ctx.actorUserId;
  let result: LastResult;

  // Re-checked at close: an organiser action during the lot (Assign) could have filled the squad.
  const canBuy =
    mode !== 'UNSOLD_BY_ORGANISER' &&
    bid !== null &&
    leader !== undefined &&
    leader.purseRemaining >= bid &&
    leader.squadSize < ctx.settings.maxPlayersPerTeam;

  if (canBuy) {
    await ctx.tx
      .update(leaders)
      .set({ purseRemaining: sql`${leaders.purseRemaining} - ${bid}` })
      .where(eq(leaders.id, leader.leaderId));
    await ctx.tx
      .update(players)
      .set({ status: 'SOLD', teamId: leader.teamId, soldPrice: bid, acquiredVia: 'AUCTION' })
      .where(eq(players.id, playerId));
    const closedBy = mode === 'TIMER' ? 'TIMER' : 'ORGANISER';
    result = {
      playerId,
      result: 'SOLD',
      teamId: leader.teamId,
      price: bid,
      reason: closedBy === 'ORGANISER' ? 'CLOSED_BY_ORGANISER' : null,
    };
    await writeAudit(ctx.tx, {
      tournamentId: ctx.tournamentId,
      actorUserId: actor,
      action: 'auction.sold',
      before: { purseRemaining: leader.purseRemaining },
      after: { playerId, teamId: leader.teamId, price: bid, round: ctx.state.round, closedBy },
    });
    ctx.webhooks.push({
      event: 'lot.sold',
      data: {
        playerId,
        ...playerInfo,
        teamId: leader.teamId,
        teamName: leader.name,
        teamShortName: leader.shortName,
        teamColor: leader.color,
        price: bid,
        purseRemaining: leader.purseRemaining - bid,
        closedBy,
      },
    });
  } else {
    const outcome =
      mode === 'UNSOLD_BY_ORGANISER'
        ? ({ type: 'UNSOLD_LIST', reason: 'CLOSED_BY_ORGANISER' } as const)
        : bid !== null
          ? ({ type: 'UNSOLD_LIST', reason: 'BIDDER_INELIGIBLE' } as const)
          : resolveUnsoldLot({ settings: ctx.settings, teams: teamsNow, random: ctx.random });
    if (outcome.type === 'RANDOM_SQUAD') {
      const team = teamsNow.find((t) => t.teamId === outcome.teamId)!;
      await ctx.tx
        .update(players)
        .set({
          status: 'ALLOCATED',
          teamId: team.teamId,
          soldPrice: 0,
          acquiredVia: 'RANDOM_SQUAD',
        })
        .where(eq(players.id, playerId));
      result = {
        playerId,
        result: 'UNSOLD',
        teamId: team.teamId,
        price: 0,
        reason: 'RANDOM_SQUAD',
      };
      ctx.webhooks.push({
        event: 'lot.unsold',
        data: {
          playerId,
          ...playerInfo,
          reason: 'RANDOM_SQUAD',
          teamId: team.teamId,
          teamName: team.name,
          teamShortName: team.shortName,
          teamColor: team.color,
        },
      });
    } else {
      await ctx.tx.update(players).set({ status: 'UNSOLD' }).where(eq(players.id, playerId));
      result = { playerId, result: 'UNSOLD', teamId: null, price: null, reason: outcome.reason };
      ctx.webhooks.push({
        event: 'lot.unsold',
        data: { playerId, ...playerInfo, reason: outcome.reason },
      });
    }
    await writeAudit(ctx.tx, {
      tournamentId: ctx.tournamentId,
      actorUserId: actor,
      action: outcome.type === 'RANDOM_SQUAD' ? 'auction.random_squad' : 'auction.unsold',
      after: { ...result, round: ctx.state.round, lastBid: bid },
    });
  }

  ctx.state.currentPlayerId = null;
  ctx.state.currentBid = null;
  ctx.state.currentTeamId = null;
  ctx.state.endsAt = null;
  ctx.state.lastResult = result;
  ctx.rosterChanged = true;

  if ((await countPlayers(ctx.tx, ctx.tournamentId, 'POOL')) > 0) {
    ctx.state.nextAt = breakEndsAt(ctx.now, ctx.settings);
  } else {
    await endRound(ctx);
  }
  emit(ctx, 'lot.closed', { ...result, nextAt: ctx.state.nextAt?.toISOString() ?? null });
  return result;
}

/** The waiting pool is empty: re-auction round, allocation, or wait for an organiser (§3.3). */
export async function endRound(ctx: AuctionCtx): Promise<void> {
  const unsoldCount = await countPlayers(ctx.tx, ctx.tournamentId, 'UNSOLD');
  const action = afterRoundEnds({ settings: ctx.settings, round: ctx.state.round, unsoldCount });
  switch (action.type) {
    case 'REAUCTION_ROUND': {
      await requeue(ctx.tx, ctx.tournamentId, ['UNSOLD'], ctx.settings.playerOrder, ctx.random);
      ctx.state.round = action.round;
      ctx.state.nextAt = breakEndsAt(ctx.now, ctx.settings);
      await writeAudit(ctx.tx, {
        tournamentId: ctx.tournamentId,
        actorUserId: null,
        action: 'auction.round_started',
        after: { round: action.round, soldiers: unsoldCount },
      });
      break;
    }
    case 'WAIT_FOR_ADMIN':
      ctx.state.nextAt = null;
      break;
    case 'ALLOCATE':
    case 'COMPLETE':
      await finishAuction(ctx, unsoldCount);
      break;
  }
  touchState(ctx);
}

/** Every round is done: the tournament moves to ALLOCATION (§1). */
export async function finishAuction(ctx: AuctionCtx, unsoldCount: number): Promise<void> {
  ctx.state.nextAt = null;
  setStatus(ctx, 'ALLOCATION');
  await writeAudit(ctx.tx, {
    tournamentId: ctx.tournamentId,
    actorUserId: ctx.actorUserId,
    action: 'auction.completed',
    after: { unsoldCount, rounds: ctx.state.round },
  });
  ctx.webhooks.push({ event: 'auction.completed', data: { unsoldCount } });
}

/**
 * After an organiser action that empties the unsold list (Assign) while nothing is running:
 * if the pool and the unsold list are both empty, the auction is complete.
 */
export async function finishIfDone(ctx: AuctionCtx): Promise<void> {
  if (ctx.state.currentPlayerId || ctx.state.nextAt) return;
  if (!AUCTION_STATUSES.includes(ctx.status)) return;
  const pool = await countPlayers(ctx.tx, ctx.tournamentId, 'POOL');
  const unsold = await countPlayers(ctx.tx, ctx.tournamentId, 'UNSOLD');
  if (pool === 0 && unsold === 0) await finishAuction(ctx, 0);
}

// ─── settleDue ────────────────────────────────────────────────────────────────────────────

const MAX_SETTLE_STEPS = 10;

/**
 * Apply every time-based step that is due by Postgres now() (§6.2): an expired lot closes
 * (SOLD / UNSOLD), an expired break opens the next soldier. Runs at the start of every auction
 * read and write and on /tick, inside the lock, so exactly one caller applies each step.
 *
 * Steps that follow a close are timed from `now`, never from the old deadline: an auction nobody
 * watched resumes with a fresh break instead of racing through every remaining lot unbid.
 */
export async function settleDue(ctx: AuctionCtx): Promise<number> {
  let steps = 0;
  while (steps < MAX_SETTLE_STEPS && ctx.status === 'AUCTION_LIVE') {
    const { currentPlayerId, endsAt, nextAt } = ctx.state;
    if (currentPlayerId) {
      if (!endsAt || endsAt.getTime() > ctx.now.getTime()) break;
      await closeLot(ctx, 'TIMER');
    } else if (nextAt && nextAt.getTime() <= ctx.now.getTime()) {
      if (!(await openLot(ctx))) {
        ctx.state.nextAt = null;
        await endRound(ctx);
      }
    } else {
      break;
    }
    steps++;
  }
  return steps;
}

/** Pure check (no lock) used to skip the write transaction when nothing is due. */
export function isSettleDue(
  status: TournamentStatus,
  state: Pick<AuctionStateRow, 'currentPlayerId' | 'endsAt' | 'nextAt'>,
  now: Date,
): boolean {
  if (status !== 'AUCTION_LIVE') return false;
  if (state.currentPlayerId) return !state.endsAt || state.endsAt.getTime() <= now.getTime();
  return state.nextAt !== null && state.nextAt.getTime() <= now.getTime();
}

// ─── Persist + publish ────────────────────────────────────────────────────────────────────

export interface CommittedEffects {
  tournamentId: string;
  now: Date;
  events: PendingAuctionEvent[];
  webhooks: OutgoingEvent[];
  update: { version: number; type: UpdateEventType; data: EventDataMap[UpdateEventType] } | null;
}

/** Write the context back (state row, status, roster version). Still inside the transaction. */
export async function persistAuctionCtx(ctx: AuctionCtx): Promise<CommittedEffects> {
  if (ctx.stateDirty) {
    const { tournamentId: _id, updatedAt: _u, ...rest } = ctx.state;
    void _id;
    void _u;
    await ctx.tx
      .update(auctionState)
      .set({ ...rest, updatedAt: ctx.now })
      .where(eq(auctionState.tournamentId, ctx.tournamentId));
  }
  if (ctx.statusChanged) {
    await ctx.tx
      .update(tournaments)
      .set({ status: ctx.status })
      .where(eq(tournaments.id, ctx.tournamentId));
  }
  let update: CommittedEffects['update'] = null;
  if (ctx.statusChanged || ctx.rosterChanged) {
    const version = await bumpRosterVersion(ctx.tx, ctx.tournamentId);
    update = ctx.statusChanged
      ? { version, type: 'tournament.status', data: { status: ctx.status } }
      : { version, type: 'people.updated', data: { kind: 'PLAYER' } };
  }
  return {
    tournamentId: ctx.tournamentId,
    now: ctx.now,
    events: [...ctx.events],
    webhooks: [...ctx.webhooks],
    update,
  };
}

/** After COMMIT only: Ably events in version order, the updates event, then webhooks. */
export async function publishCommitted(effects: CommittedEffects): Promise<void> {
  for (const e of effects.events) {
    await publishAuction(effects.tournamentId, e.version, effects.now, e.type, e.data);
  }
  if (effects.update) {
    await publishUpdate(
      effects.tournamentId,
      effects.update.version,
      effects.now,
      effects.update.type,
      effects.update.data,
    );
  }
  queueWebhookEvents(effects.tournamentId, effects.webhooks);
}
