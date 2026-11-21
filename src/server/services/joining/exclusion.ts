import 'server-only';
import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { leaders, players } from '../../db/schema';
import { conflict } from '../../errors';

export interface ExistingSpot {
  kind: 'LEADER' | 'PLAYER';
  id: string;
  /** True for key sign-ups still waiting for approval. */
  pending: boolean;
  rejected: boolean;
}

/**
 * The user's existing captain / soldier row in this tournament, if any. Call it inside the
 * transaction that locked the tournament row (`lockTournament`), so joins happen one at a time
 * and nobody ends up as both captain and soldier (PLAN §2.3 "Common rules", §9 item 17).
 */
export async function findExistingSpot(
  tx: Db,
  tournamentId: string,
  userId: string,
): Promise<ExistingSpot | null> {
  const [leader] = await tx
    .select({ id: leaders.id, approval: leaders.approval })
    .from(leaders)
    .where(and(eq(leaders.tournamentId, tournamentId), eq(leaders.userId, userId)))
    .limit(1);
  if (leader) {
    return {
      kind: 'LEADER',
      id: leader.id,
      pending: leader.approval === 'PENDING',
      rejected: leader.approval === 'REJECTED',
    };
  }
  const [player] = await tx
    .select({ id: players.id, status: players.status })
    .from(players)
    .where(and(eq(players.tournamentId, tournamentId), eq(players.userId, userId)))
    .limit(1);
  if (player) {
    return {
      kind: 'PLAYER',
      id: player.id,
      pending: player.status === 'PENDING_APPROVAL',
      rejected: player.status === 'REJECTED',
    };
  }
  return null;
}

export function alreadyInTournament(spot: ExistingSpot): Error {
  if (spot.rejected) return conflict('The organiser turned down your earlier sign-up');
  if (spot.pending) return conflict('You already signed up and are waiting for approval');
  return conflict(
    `You're already in this tournament as ${spot.kind === 'LEADER' ? 'a captain' : 'a soldier'}`,
  );
}

/** Throws 409 when the user already has a spot in the tournament. */
export async function assertNotInTournament(
  tx: Db,
  tournamentId: string,
  userId: string,
): Promise<void> {
  const spot = await findExistingSpot(tx, tournamentId, userId);
  if (spot) throw alreadyInTournament(spot);
}
