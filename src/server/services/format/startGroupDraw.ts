import 'server-only';
import type { Tx } from '../../db/client';
import { cryptoRandom, performGroupDraw } from './groupDraw';

/**
 * CROSS-LANE STUB (PLAN §13.1 rule 3). Signature is FINAL — do not change it without an
 * integration note.
 *
 * Lane B ends allocation (B7) by setting the tournament status to `GROUP_DRAW` and bumping the
 * roster version. From there Lane C owns the flow: the group-draw screen calls this inside a
 * transaction to draw groups (pots, random or manual), generate round-robin fixtures and match
 * numbers, and set the status to `GROUP_STAGE` (C2).
 *
 * Implemented (Lane C, C2): a RANDOM draw from the seeding pots inside the caller's transaction,
 * creating groups, fixtures, the placeholder knockout tree and match numbers, then GROUP_STAGE
 * (or KNOCKOUT for a 2-team final). It bumps the roster version but publishes nothing, because the
 * caller owns the transaction's commit: publish `groups.updated` + `tournament.status` after commit.
 *
 * The organiser screen (/t/[id]/groups) uses `drawGroups` instead, which also offers manual
 * placement and publishes. Don't call this automatically right after allocation, or the organiser
 * loses the choice of random vs manual and the draw ceremony.
 */
export async function startGroupDraw(tx: Tx, tournamentId: string): Promise<void> {
  await performGroupDraw(tx, tournamentId, { mode: 'RANDOM' }, cryptoRandom, null);
}
