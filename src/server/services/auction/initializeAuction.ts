import 'server-only';
import { and, eq, sql } from 'drizzle-orm';
import { parseSettings } from '@/lib/schemas/settings';
import type { Tx } from '../../db/client';
import { auctionState, leaders, tournaments } from '../../db/schema';
import { notFound } from '../../errors';
import { writeAudit } from '../audit';
import { requeue, secureRandom } from './pool';

/**
 * CROSS-LANE STUB (PLAN §13.1 rule 3), filled in by Lane B (B2). Signature is FINAL.
 *
 * Called by Lane A inside the Start Tournament transaction (A9), after settings are locked,
 * registration is closed, pending requests are expired and the status is set (AUCTION_LIVE).
 * Makes no network calls and publishes nothing (it runs inside the caller's transaction).
 *
 * - Starting purses: every approved captain starts with `purse_remaining = purse_total`.
 * - Pool order: every soldier in the pool gets `auction_order` 1…n per `settings.playerOrder`
 *   (random by default, with a CSPRNG shuffle).
 * - `auction_state`: round 1, version 0, nothing on the block, no break running. The first
 *   soldier opens when the controlling organiser presses "Start auction" (the `next` command);
 *   captains see the pre-auction lobby until then (§7.8).
 *
 * Idempotent: if the auction was already initialised it changes nothing.
 */
export async function initializeAuction(tx: Tx, tournamentId: string): Promise<void> {
  const [existing] = await tx
    .select({ id: auctionState.tournamentId })
    .from(auctionState)
    .where(eq(auctionState.tournamentId, tournamentId));
  if (existing) return;

  const [tournament] = await tx
    .select({ settings: tournaments.settings })
    .from(tournaments)
    .where(eq(tournaments.id, tournamentId));
  if (!tournament) throw notFound();
  const settings = parseSettings(tournament.settings);

  await tx
    .update(leaders)
    .set({ purseRemaining: sql`${leaders.purseTotal}` })
    .where(and(eq(leaders.tournamentId, tournamentId), eq(leaders.approval, 'APPROVED')));

  const poolSize = await requeue(tx, tournamentId, ['POOL'], settings.playerOrder, secureRandom);

  await tx.insert(auctionState).values({ tournamentId, round: 1, version: 0 });

  await writeAudit(tx, {
    tournamentId,
    actorUserId: null,
    action: 'auction.initialized',
    after: { poolSize, playerOrder: settings.playerOrder },
  });
}
