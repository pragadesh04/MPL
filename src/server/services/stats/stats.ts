import 'server-only';
import { and, desc, eq, ilike, sql } from 'drizzle-orm';
import { computeLeaderboards, type Leaderboards } from '@/features/format/leaderboards';
import type { FormatPageData } from '@/features/format/types';
import { getReadDb, type Db } from '../../db/client';
import { auditLog, matches, playerStats, users } from '../../db/schema';
import { getFormatPageData } from '../format/data';
import { requireRole } from '../roles';

/** Stats page (§7.13): any participant; leaderboards computed from per-match soldier stats. */
export async function getStats(
  userId: string | null,
  tournamentId: string,
  db: Db = getReadDb(),
): Promise<FormatPageData & { leaderboards: Leaderboards }> {
  const data = await getFormatPageData(userId, tournamentId, db);
  const lines = await db
    .select({
      playerId: playerStats.playerId,
      kills: playerStats.kills,
      deaths: playerStats.deaths,
      mvp: playerStats.mvp,
    })
    .from(playerStats)
    .innerJoin(matches, eq(matches.id, playerStats.matchId))
    .where(eq(matches.tournamentId, tournamentId));
  return { ...data, leaderboards: computeLeaderboards(data.players, lines) };
}

export interface AuditEntryView {
  id: number;
  action: string;
  actorName: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  reason: string | null;
  createdAt: string;
}

/**
 * Audit-log viewer (§7.13): organisers only (owner, co-admin, auctioneer); newest first, filter by
 * action prefix (e.g. "match.") and actor display name. Other roles get 403, outsiders 404.
 */
export async function getAuditLog(
  userId: string | null,
  tournamentId: string,
  filters: { action?: string | null; actor?: string | null; limit?: number } = {},
  db: Db = getReadDb(),
): Promise<{ entries: AuditEntryView[]; actions: string[] }> {
  await requireRole(userId, tournamentId, 'tournament:view-admin', db);
  const conds = [eq(auditLog.tournamentId, tournamentId)];
  if (filters.action)
    conds.push(ilike(auditLog.action, `${filters.action.replace(/[%_\\]/g, '')}%`));
  if (filters.actor)
    conds.push(ilike(users.displayName, `%${filters.actor.replace(/[%_\\]/g, '')}%`));
  const [rows, actions] = await Promise.all([
    db
      .select({
        id: auditLog.id,
        action: auditLog.action,
        actorName: users.displayName,
        before: auditLog.before,
        after: auditLog.after,
        reason: auditLog.reason,
        createdAt: auditLog.createdAt,
      })
      .from(auditLog)
      .leftJoin(users, eq(users.id, auditLog.actorUserId))
      .where(and(...conds))
      .orderBy(desc(auditLog.id))
      .limit(Math.min(filters.limit ?? 200, 500)),
    db
      .selectDistinct({ action: auditLog.action })
      .from(auditLog)
      .where(eq(auditLog.tournamentId, tournamentId))
      .orderBy(sql`1`),
  ]);
  return {
    entries: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
    actions: actions.map((a) => a.action),
  };
}
