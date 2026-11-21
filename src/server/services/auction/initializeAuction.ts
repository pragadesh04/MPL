import 'server-only';
import type { Tx } from '../../db/client';
import { auctionState } from '../../db/schema';

/**
 * CROSS-LANE STUB (PLAN §13.1 rule 3). Signature is FINAL — do not change it without an
 * integration note.
 *
 * Called by Lane A inside the Start Tournament transaction (A9), after settings are locked,
 * registration is closed, pending requests are expired and the status is set. Must not make
 * network calls (it runs inside the transaction).
 *
 * Lane B (B2) replaces the body: create `auction_state`, assign the pool order
 * (`players.auction_order`, per `settings.playerOrder`), set starting purses, and whatever else
 * the auction needs.
 *
 * Phase 0 placeholder: creates an empty `auction_state` row (version 0) so Lane A can test Start
 * end to end. Idempotent.
 */
export async function initializeAuction(tx: Tx, tournamentId: string): Promise<void> {
  await tx.insert(auctionState).values({ tournamentId }).onConflictDoNothing();
}
