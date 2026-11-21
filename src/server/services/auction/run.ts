import 'server-only';
import { eq } from 'drizzle-orm';
import type { Tx } from '../../db/client';
import { withTransaction } from '../../db/client';
import { processedCommands } from '../../db/schema';
import { AppError, isAppError, ruleViolation } from '../../errors';
import {
  loadAuctionCtx,
  persistAuctionCtx,
  publishCommitted,
  settleDue,
  type AuctionCtx,
} from './engine';

/**
 * The one pipeline every auction write goes through (PLAN §6.2):
 *
 *   BEGIN
 *     SELECT … FROM auction_state … FOR UPDATE          (loadAuctionCtx)
 *     settleDue                                          (expired lot / break)
 *     SAVEPOINT
 *       INSERT processed_commands (commandId)            (idempotency: a retry is a no-op)
 *       command                                          (validate, then write)
 *     RELEASE / ROLLBACK TO SAVEPOINT
 *     UPDATE auction_state / tournaments, bump roster_version
 *   COMMIT
 *   publish to Ably, queue webhooks                       (only after COMMIT)
 *
 * A command that fails with an AppError is rolled back to the savepoint, but whatever settleDue
 * did still commits and publishes, then the error is thrown. That's how a late bid "settles the
 * lot first, then is rejected as too late".
 */

export interface AuctionWriteOptions {
  tournamentId: string;
  actorUserId: string | null;
  /** Client idempotency key; a repeated id returns `{ duplicate: true }` without acting. */
  commandId?: string;
  /** Injectable randomness (RANDOM_SQUAD, re-auction shuffles); defaults to a CSPRNG. */
  random?: () => number;
  command?: (ctx: AuctionCtx, info: { settledSteps: number }) => Promise<void>;
}

export interface AuctionWriteResult {
  duplicate: boolean;
  settledSteps: number;
  version: number;
}

export const outbid = (version: number): AppError =>
  new AppError('OUTBID', 'Someone bid first. The latest state has been loaded.', { version });

export const tooLate = (): AppError =>
  new AppError('TOO_LATE', 'Time ran out for that soldier before your bid arrived');

export const staleVersion = (version: number): AppError =>
  new AppError('CONFLICT', 'The auction moved on. The latest state has been loaded.', {
    reason: 'STALE_VERSION',
    version,
  });

/** Claim `commandId` for this tournament. False when it was already processed. */
async function claimCommand(tx: Tx, tournamentId: string, commandId: string): Promise<boolean> {
  const inserted = await tx
    .insert(processedCommands)
    .values({ commandId, tournamentId, result: { ok: true } })
    .onConflictDoNothing()
    .returning({ id: processedCommands.commandId });
  if (inserted.length > 0) return true;
  const [existing] = await tx
    .select({ tournamentId: processedCommands.tournamentId })
    .from(processedCommands)
    .where(eq(processedCommands.commandId, commandId));
  // A command id is a client-generated UUID; reuse across tournaments is a client bug.
  if (existing && existing.tournamentId !== tournamentId) {
    throw ruleViolation('COMMAND_ID_REUSED', 'That command id was already used');
  }
  return false;
}

type Saved = Pick<
  AuctionCtx,
  'state' | 'status' | 'stateDirty' | 'statusChanged' | 'rosterChanged'
> & { events: number; webhooks: number };

function save(ctx: AuctionCtx): Saved {
  return {
    state: { ...ctx.state },
    status: ctx.status,
    stateDirty: ctx.stateDirty,
    statusChanged: ctx.statusChanged,
    rosterChanged: ctx.rosterChanged,
    events: ctx.events.length,
    webhooks: ctx.webhooks.length,
  };
}

function restore(ctx: AuctionCtx, saved: Saved): void {
  ctx.state = saved.state;
  ctx.status = saved.status;
  ctx.stateDirty = saved.stateDirty;
  ctx.statusChanged = saved.statusChanged;
  ctx.rosterChanged = saved.rosterChanged;
  ctx.events.length = saved.events;
  ctx.webhooks.length = saved.webhooks;
}

export async function runAuctionWrite(opts: AuctionWriteOptions): Promise<AuctionWriteResult> {
  const outcome: { failure?: AppError } = {};
  const result = await withTransaction(async (tx, onCommit) => {
    const ctx = await loadAuctionCtx(tx, opts.tournamentId, opts.actorUserId, opts.random);
    const settledSteps = await settleDue(ctx);
    let duplicate = false;

    const command = opts.command;
    if (command) {
      const saved = save(ctx);
      try {
        await tx.transaction(async (sp) => {
          ctx.tx = sp;
          if (opts.commandId && !(await claimCommand(sp, opts.tournamentId, opts.commandId))) {
            duplicate = true;
            return;
          }
          await command(ctx, { settledSteps });
        });
      } catch (err) {
        restore(ctx, saved);
        if (!isAppError(err)) throw err;
        outcome.failure = err;
      } finally {
        ctx.tx = tx;
      }
    }

    const effects = await persistAuctionCtx(ctx);
    onCommit(() => publishCommitted(effects));
    return { duplicate, settledSteps, version: ctx.state.version };
  });
  if (outcome.failure) throw outcome.failure;
  return result;
}
