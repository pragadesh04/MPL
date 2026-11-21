import 'server-only';
import { and, desc, eq, sql } from 'drizzle-orm';
import { remainingMs } from '@/lib/rules/timers';
import type { Permission } from '@/lib/schemas/domain';
import type {
  AuctionCommand,
  AuctionCommandType,
  AuctionWriteResponse,
} from '@/lib/schemas/auction';
import { auditLog, bids, leaders, players, teams } from '../../db/schema';
import { notFound, ruleViolation } from '../../errors';
import { writeAudit } from '../audit';
import { requireRole } from '../roles';
import { ensureController, takeControl } from './control';
import {
  AUCTION_STATUSES,
  closeLot,
  countPlayers,
  emit,
  finishIfDone,
  loadPlayer,
  loadTeams,
  openLot,
  parseLastResult,
  setStatus,
  touchState,
  type AuctionCtx,
} from './engine';
import { maxPoolOrder, minPoolOrder, requeue } from './pool';
import { runAuctionWrite, staleVersion } from './run';
import { buildSnapshot } from './snapshot';

/**
 * `POST /api/tournaments/:id/auction/commands` (PLAN §3.3, §5 API, §7.6, §7.6a). Each command
 * runs in the shared pipeline (lock → settle → savepoint → commit → publish), so every one is a
 * single transaction with its audit entry, and a repeated `commandId` is a no-op.
 *
 * - Console commands (`next`, `sold`, `unsold`, `pause`, `resume`, `undo`, `start-round`) need the
 *   console lock and an up-to-date `expectedVersion` (they act on the lot the organiser sees).
 * - Roster commands (`release`, `auction-again`, `assign`) and `take-control` / `reset` act on
 *   fresh rows and don't depend on the lot, so they skip the version check.
 */

const PERMISSION: Record<AuctionCommandType, Permission> = {
  next: 'auction:control',
  sold: 'auction:control',
  unsold: 'auction:control',
  pause: 'auction:control',
  resume: 'auction:control',
  undo: 'auction:control',
  'take-control': 'auction:control',
  'start-round': 'auction:control',
  release: 'auction:roster',
  'auction-again': 'auction:roster',
  assign: 'auction:roster',
  reset: 'auction:reset',
};

const CONSOLE_COMMANDS: ReadonlySet<AuctionCommandType> = new Set([
  'next',
  'sold',
  'unsold',
  'pause',
  'resume',
  'undo',
  'start-round',
]);

function requireLive(ctx: AuctionCtx): void {
  if (ctx.status === 'AUCTION_PAUSED') {
    throw ruleViolation('AUCTION_PAUSED', 'The auction is paused. Resume it first.');
  }
  if (ctx.status !== 'AUCTION_LIVE')
    throw ruleViolation('AUCTION_NOT_LIVE', 'The auction is not live');
}

function requireAuction(ctx: AuctionCtx): void {
  if (!AUCTION_STATUSES.includes(ctx.status)) {
    throw ruleViolation('AUCTION_NOT_LIVE', 'The auction is not running');
  }
}

function requireNoLot(ctx: AuctionCtx): void {
  if (ctx.state.currentPlayerId) {
    throw ruleViolation('LOT_RUNNING', 'A soldier is on the block. Close the lot first.');
  }
}

const NO_POOL_MESSAGE = 'No soldiers in the pool. Use Auction again on unsold soldiers first.';

async function audit(
  ctx: AuctionCtx,
  action: string,
  after: Record<string, unknown>,
  extra: { before?: Record<string, unknown>; reason?: string | null } = {},
): Promise<void> {
  await writeAudit(ctx.tx, {
    tournamentId: ctx.tournamentId,
    actorUserId: ctx.actorUserId,
    action,
    after,
    before: extra.before ?? null,
    reason: extra.reason ?? null,
  });
}

/** Refund what a squad member cost and put them back at the end (or front) of the pool. */
async function returnToPool(
  ctx: AuctionCtx,
  playerId: string,
  position: 'front' | 'back',
): Promise<{ teamId: string; price: number }> {
  const player = await loadPlayer(ctx.tx, ctx.tournamentId, playerId);
  if (!player.teamId || (player.status !== 'SOLD' && player.status !== 'ALLOCATED')) {
    throw ruleViolation('NOT_IN_SQUAD', `${player.name} is not in a squad`);
  }
  const price = player.soldPrice ?? 0;
  const [team] = await ctx.tx
    .select({ leaderId: teams.leaderId })
    .from(teams)
    .where(and(eq(teams.id, player.teamId), eq(teams.tournamentId, ctx.tournamentId)));
  if (!team) throw notFound();
  if (price > 0) {
    await ctx.tx
      .update(leaders)
      .set({ purseRemaining: sql`${leaders.purseRemaining} + ${price}` })
      .where(eq(leaders.id, team.leaderId));
  }
  const order =
    position === 'front'
      ? (await minPoolOrder(ctx.tx, ctx.tournamentId)) - 1
      : (await maxPoolOrder(ctx.tx, ctx.tournamentId)) + 1;
  await ctx.tx
    .update(players)
    .set({ status: 'POOL', teamId: null, soldPrice: null, acquiredVia: null, auctionOrder: order })
    .where(eq(players.id, playerId));
  if (parseLastResult(ctx.state.lastResult)?.playerId === playerId) {
    ctx.state.lastResult = null;
    touchState(ctx);
  }
  ctx.rosterChanged = true;
  return { teamId: player.teamId, price };
}

/** The most recent auction sale that still stands (not undone or released since). */
async function findLastSale(
  ctx: AuctionCtx,
): Promise<{ playerId: string; teamId: string; price: number } | null> {
  const entries = await ctx.tx
    .select({ after: auditLog.after })
    .from(auditLog)
    .where(and(eq(auditLog.tournamentId, ctx.tournamentId), eq(auditLog.action, 'auction.sold')))
    .orderBy(desc(auditLog.id))
    .limit(50);
  for (const entry of entries) {
    const after = entry.after ?? {};
    const { playerId, teamId, price } = after as {
      playerId?: unknown;
      teamId?: unknown;
      price?: unknown;
    };
    if (typeof playerId !== 'string' || typeof teamId !== 'string' || typeof price !== 'number')
      continue;
    const player = await loadPlayer(ctx.tx, ctx.tournamentId, playerId);
    if (
      player.status === 'SOLD' &&
      player.acquiredVia === 'AUCTION' &&
      player.teamId === teamId &&
      player.soldPrice === price
    ) {
      return { playerId, teamId, price };
    }
  }
  return null;
}

async function execute(ctx: AuctionCtx, userId: string, cmd: AuctionCommand): Promise<void> {
  switch (cmd.type) {
    case 'next': {
      requireLive(ctx);
      requireNoLot(ctx);
      if (!(await openLot(ctx, cmd.playerId))) throw ruleViolation('NO_POOL', NO_POOL_MESSAGE);
      if (cmd.playerId) await audit(ctx, 'auction.picked', { playerId: cmd.playerId });
      return;
    }
    case 'sold': {
      requireLive(ctx);
      if (!ctx.state.currentPlayerId) throw ruleViolation('NO_LOT', 'No soldier on the block');
      if (ctx.state.currentBid === null) {
        throw ruleViolation('NO_BIDS', 'Nobody has bid yet. Use Mark unsold instead.');
      }
      await closeLot(ctx, 'SOLD_BY_ORGANISER');
      return;
    }
    case 'unsold': {
      requireLive(ctx);
      if (!ctx.state.currentPlayerId) throw ruleViolation('NO_LOT', 'No soldier on the block');
      await closeLot(ctx, 'UNSOLD_BY_ORGANISER');
      return;
    }
    case 'pause': {
      requireLive(ctx);
      const deadline = ctx.state.currentPlayerId ? ctx.state.endsAt : ctx.state.nextAt;
      const pausedRemainingMs = deadline ? remainingMs(deadline, ctx.now) : 0;
      ctx.state.pausedRemainingMs = pausedRemainingMs;
      setStatus(ctx, 'AUCTION_PAUSED');
      emit(ctx, 'auction.paused', { pausedRemainingMs });
      ctx.webhooks.push({ event: 'auction.paused', data: { pausedRemainingMs } });
      await audit(ctx, 'auction.paused', { pausedRemainingMs });
      return;
    }
    case 'resume': {
      if (ctx.status !== 'AUCTION_PAUSED') {
        throw ruleViolation('NOT_PAUSED', 'The auction is not paused');
      }
      const left = ctx.state.pausedRemainingMs ?? 0;
      const resumeAt = new Date(ctx.now.getTime() + left);
      if (ctx.state.currentPlayerId) ctx.state.endsAt = resumeAt;
      else if (ctx.state.nextAt) ctx.state.nextAt = resumeAt;
      ctx.state.pausedRemainingMs = null;
      setStatus(ctx, 'AUCTION_LIVE');
      const data = {
        endsAt: ctx.state.currentPlayerId ? resumeAt.toISOString() : null,
        nextAt: !ctx.state.currentPlayerId && ctx.state.nextAt ? resumeAt.toISOString() : null,
      };
      emit(ctx, 'auction.resumed', data);
      ctx.webhooks.push({ event: 'auction.resumed', data: {} });
      await audit(ctx, 'auction.resumed', data);
      return;
    }
    case 'undo': {
      requireAuction(ctx);
      const sale = await findLastSale(ctx);
      if (!sale) throw ruleViolation('NOTHING_TO_UNDO', 'There is no sale to undo');
      await returnToPool(ctx, sale.playerId, 'front');
      await audit(ctx, 'auction.undo', sale, { reason: cmd.reason });
      return;
    }
    case 'take-control': {
      if (!AUCTION_STATUSES.includes(ctx.status) && ctx.status !== 'ALLOCATION') {
        throw ruleViolation('AUCTION_NOT_LIVE', 'The auction is not running');
      }
      await takeControl(ctx, userId);
      return;
    }
    case 'start-round': {
      requireLive(ctx);
      requireNoLot(ctx);
      if ((await countPlayers(ctx.tx, ctx.tournamentId, 'POOL')) === 0) {
        throw ruleViolation('NO_POOL', NO_POOL_MESSAGE);
      }
      ctx.state.round += 1;
      touchState(ctx);
      await audit(ctx, 'auction.round_started', { round: ctx.state.round, manual: true });
      await openLot(ctx);
      return;
    }
    case 'release': {
      requireAuction(ctx);
      const released = await returnToPool(ctx, cmd.playerId, 'back');
      await audit(
        ctx,
        'auction.released',
        { playerId: cmd.playerId, ...released },
        { reason: cmd.reason ?? null },
      );
      return;
    }
    case 'auction-again': {
      requireAuction(ctx);
      const player = await loadPlayer(ctx.tx, ctx.tournamentId, cmd.playerId);
      if (player.status !== 'UNSOLD') {
        throw ruleViolation('NOT_UNSOLD', `${player.name} is not on the unsold list`);
      }
      await ctx.tx
        .update(players)
        .set({ status: 'POOL', auctionOrder: (await maxPoolOrder(ctx.tx, ctx.tournamentId)) + 1 })
        .where(eq(players.id, cmd.playerId));
      ctx.rosterChanged = true;
      await audit(ctx, 'auction.requeued', { playerId: cmd.playerId });
      return;
    }
    case 'assign': {
      requireAuction(ctx);
      const player = await loadPlayer(ctx.tx, ctx.tournamentId, cmd.playerId);
      if (player.status !== 'UNSOLD' && player.status !== 'POOL') {
        throw ruleViolation('NOT_ASSIGNABLE', `${player.name} can't be assigned now`);
      }
      const team = (await loadTeams(ctx.tx, ctx.tournamentId)).find((t) => t.teamId === cmd.teamId);
      if (!team) throw notFound();
      if (team.squadSize >= ctx.settings.maxPlayersPerTeam) {
        throw ruleViolation('SQUAD_FULL', `${team.name} is full`);
      }
      await ctx.tx
        .update(players)
        .set({ status: 'ALLOCATED', teamId: team.teamId, soldPrice: 0, acquiredVia: 'ADMIN_PICK' })
        .where(eq(players.id, cmd.playerId));
      ctx.rosterChanged = true;
      await audit(ctx, 'auction.assigned', {
        playerId: cmd.playerId,
        teamId: team.teamId,
        price: 0,
      });
      await finishIfDone(ctx);
      return;
    }
    case 'reset': {
      if (!AUCTION_STATUSES.includes(ctx.status) && ctx.status !== 'ALLOCATION') {
        throw ruleViolation('AUCTION_NOT_LIVE', 'The auction can no longer be reset');
      }
      if (cmd.confirmName.trim().toLowerCase() !== ctx.tournamentName.trim().toLowerCase()) {
        throw ruleViolation('CONFIRM_MISMATCH', 'Type the tournament name exactly to confirm');
      }
      await ctx.tx.delete(bids).where(eq(bids.tournamentId, ctx.tournamentId));
      const soldiers = await requeue(
        ctx.tx,
        ctx.tournamentId,
        ['POOL', 'ON_BLOCK', 'SOLD', 'ALLOCATED', 'UNSOLD'],
        ctx.settings.playerOrder,
        ctx.random,
      );
      await ctx.tx
        .update(leaders)
        .set({ purseRemaining: sql`${leaders.purseTotal}` })
        .where(and(eq(leaders.tournamentId, ctx.tournamentId), eq(leaders.approval, 'APPROVED')));
      Object.assign(ctx.state, {
        currentPlayerId: null,
        currentBid: null,
        currentTeamId: null,
        endsAt: null,
        nextAt: null,
        round: 1,
        pausedRemainingMs: null,
        lastResult: null,
      });
      setStatus(ctx, 'AUCTION_LIVE');
      ctx.rosterChanged = true;
      await audit(ctx, 'auction.reset', { soldiers });
      // No dedicated reset event in the contract: control.changed makes every client refetch.
      emit(ctx, 'control.changed', { controllerUserId: ctx.state.controllerUserId });
      return;
    }
  }
}

export async function runAuctionCommand(
  userId: string | null,
  tournamentId: string,
  cmd: AuctionCommand,
  opts: { random?: () => number } = {},
): Promise<AuctionWriteResponse> {
  const access = await requireRole(userId, tournamentId, PERMISSION[cmd.type]);
  await runAuctionWrite({
    tournamentId,
    actorUserId: access.userId,
    commandId: cmd.commandId,
    random: opts.random,
    command: async (ctx) => {
      if (CONSOLE_COMMANDS.has(cmd.type)) {
        if (ctx.state.version !== cmd.expectedVersion) throw staleVersion(ctx.state.version);
        await ensureController(ctx, access.userId);
      }
      await execute(ctx, access.userId, cmd);
    },
  });
  return { snapshot: await buildSnapshot(tournamentId) };
}
