import 'server-only';
import { and, eq, sql } from 'drizzle-orm';
import type { ReadyToStartResult } from '@/lib/rules/validateReadyToStart';
import { getDb, type Db } from '../../db/client';
import { leaders } from '../../db/schema';
import { requireRole } from '../roles';
import { computeReadiness } from '../start/readiness';
import { loadDetail, rosterCounts, type RosterCounts, type TournamentDetail } from './tournaments';

export interface SetupOverview {
  tournament: TournamentDetail;
  counts: RosterCounts;
  /** Sum of approved captains' purses. */
  totalPurse: number;
  readiness: ReadyToStartResult;
}

/** Everything the setup wizard pages need (organisers only). */
export async function getSetupOverview(
  userId: string | null,
  tournamentId: string,
  db: Db = getDb(),
): Promise<SetupOverview> {
  const access = await requireRole(userId, tournamentId, 'tournament:view-admin', db);
  const [tournament, counts, readiness, purse] = await Promise.all([
    loadDetail(tournamentId, access.roles, db),
    rosterCounts(db, tournamentId),
    computeReadiness(db, tournamentId),
    db
      .select({ total: sql<number>`coalesce(sum(${leaders.purseTotal}), 0)` })
      .from(leaders)
      .where(and(eq(leaders.tournamentId, tournamentId), eq(leaders.approval, 'APPROVED'))),
  ]);
  return { tournament, counts, readiness, totalPurse: Number(purse[0]?.total ?? 0) };
}
