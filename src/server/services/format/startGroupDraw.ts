import 'server-only';
import type { Tx } from '../../db/client';
import { notImplemented } from '../../errors';

/**
 * CROSS-LANE STUB (PLAN §13.1 rule 3). Signature is FINAL — do not change it without an
 * integration note.
 *
 * Lane B ends allocation (B7) by setting the tournament status to `GROUP_DRAW` and bumping the
 * roster version. From there Lane C owns the flow: the group-draw screen calls this inside a
 * transaction to draw groups (pots, random or manual), generate round-robin fixtures and match
 * numbers, and set the status to `GROUP_STAGE` (C2).
 *
 * Phase 0 placeholder: throws NOT_IMPLEMENTED (501).
 */
export async function startGroupDraw(tx: Tx, tournamentId: string): Promise<void> {
  void tx;
  void tournamentId;
  throw notImplemented('startGroupDraw (Lane C, C2)');
}
