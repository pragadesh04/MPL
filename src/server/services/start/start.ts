import 'server-only';
import { and, eq, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { confirmNameSchema } from '@/features/identity/schemas';
import type { ReadyToStartResult } from '@/lib/rules/validateReadyToStart';
import type { TournamentStatus } from '@/lib/schemas/enums';
import { getDb, withTransaction, type Db } from '../../db/client';
import { joinRequests, tournaments } from '../../db/schema';
import { dbNow } from '../../db/sql';
import { AppError, badRequest, conflict } from '../../errors';
import { publishInbox } from '../../realtime/publisher';
import { initializeAuction } from '../auction/initializeAuction';
import { writeAudit } from '../audit';
import { publishStatus } from '../people/roster-events';
import { lockTournament } from '../roster';
import { requireRole } from '../roles';
import { computeReadiness } from './readiness';

/**
 * Review & Start (PLAN §1 "Rule", §3.5, §7.2 step 5, §9 item 16). One transaction under the
 * tournament lock: re-run every §3.5 check, lock settings, close registration, expire pending
 * Player ID requests, set the status, audit, then call Lane B's `initializeAuction` stub.
 */

/** The status Start moves to (PLAN §1 lifecycle: READY ──► AUCTION_LIVE). */
export const STARTED_STATUS: TournamentStatus = 'AUCTION_LIVE';

export async function getReadiness(
  userId: string | null,
  tournamentId: string,
  db: Db = getDb(),
): Promise<ReadyToStartResult> {
  await requireRole(userId, tournamentId, 'tournament:view-admin', db);
  return computeReadiness(db, tournamentId);
}

export async function startTournament(
  userId: string,
  tournamentId: string,
  input: z.input<typeof confirmNameSchema>,
  db: Db = getDb(),
): Promise<{ status: TournamentStatus }> {
  const { confirmName } = confirmNameSchema.parse(input);
  await requireRole(userId, tournamentId, 'stage:advance', db);
  return withTransaction(async (tx, onCommit) => {
    const tour = await lockTournament(tx, tournamentId);
    if (tour.status !== 'DRAFT' && tour.status !== 'READY') {
      throw conflict('This tournament has already started');
    }
    if (tour.name.trim().toLowerCase() !== confirmName.trim().toLowerCase()) {
      throw badRequest('Type the tournament name exactly to confirm');
    }
    const readiness = await computeReadiness(tx, tournamentId);
    if (!readiness.ok) {
      throw new AppError('RULE_VIOLATION', 'Not ready to start yet: fix the failing checks', {
        reason: 'NOT_READY',
        failing: readiness.checks.filter((c) => !c.ok).map((c) => c.id),
      });
    }

    await tx
      .update(tournaments)
      .set({
        status: STARTED_STATUS,
        registrationOpen: false,
        startedAt: sql`now()`,
        lockedAt: sql`now()`,
      })
      .where(eq(tournaments.id, tournamentId));

    const expired = await tx
      .update(joinRequests)
      .set({ status: 'EXPIRED', respondedAt: sql`now()` })
      .where(and(eq(joinRequests.tournamentId, tournamentId), eq(joinRequests.status, 'PENDING')))
      .returning({ id: joinRequests.id, toUserId: joinRequests.toUserId });
    const now = await dbNow(tx);
    for (const r of expired) {
      onCommit(() =>
        publishInbox(r.toUserId, tournamentId, now, 'request.cancelled', { requestId: r.id }),
      );
    }

    await writeAudit(tx, {
      tournamentId,
      actorUserId: userId,
      action: 'tournament.started',
      before: { status: tour.status },
      after: { status: STARTED_STATUS, expiredRequests: expired.length },
    });

    // Cross-lane seam (PLAN §13.1 rule 3): Lane B fills this in. No network calls inside.
    await initializeAuction(tx, tournamentId);

    await publishStatus(tx, tournamentId, onCommit);
    return { status: STARTED_STATUS };
  }, db);
}
