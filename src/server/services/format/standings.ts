import 'server-only';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { computeStandings, type StandingRow } from '@/lib/rules/computeStandings';
import type { Db } from '../../db/client';
import { auditLog, groups, groupTeams, matches, matchGames } from '../../db/schema';

/** Audit action that stores an organiser tie-break draw: after = { groupId, order: teamId[] }. */
export const TIEBREAK_AUDIT_ACTION = 'standings.tiebreak_drawn';

export interface GroupStanding {
  groupId: string;
  name: string;
  teamIds: string[];
  standings: StandingRow[];
  /** Every group match is DONE. */
  complete: boolean;
}

/** Latest organiser tie-break draw per group (team ids, best first). */
export async function loadDrawOrders(db: Db, tournamentId: string): Promise<Map<string, string[]>> {
  const rows = await db
    .select({ after: auditLog.after })
    .from(auditLog)
    .where(and(eq(auditLog.tournamentId, tournamentId), eq(auditLog.action, TIEBREAK_AUDIT_ACTION)))
    .orderBy(desc(auditLog.id));
  const out = new Map<string, string[]>();
  for (const { after } of rows) {
    const groupId = typeof after?.groupId === 'string' ? after.groupId : null;
    const order = Array.isArray(after?.order)
      ? after.order.filter((x): x is string => typeof x === 'string')
      : [];
    if (groupId && !out.has(groupId)) out.set(groupId, order);
  }
  return out;
}

/**
 * Standings of every group, computed from results (never stored, §4.3). Works inside a
 * transaction so result writes and knockout generation see their own changes.
 */
export async function loadGroupStandings(
  db: Db,
  tournamentId: string,
  pointsForWin: number,
): Promise<GroupStanding[]> {
  const [groupRows, memberRows, matchRows, drawOrders] = await Promise.all([
    db
      .select()
      .from(groups)
      .where(eq(groups.tournamentId, tournamentId))
      .orderBy(asc(groups.sortOrder), asc(groups.name)),
    db
      .select()
      .from(groupTeams)
      .where(eq(groupTeams.tournamentId, tournamentId))
      .orderBy(asc(groupTeams.pot)),
    db
      .select()
      .from(matches)
      .where(and(eq(matches.tournamentId, tournamentId), eq(matches.stage, 'GROUP')))
      .orderBy(asc(matches.matchNumber)),
    loadDrawOrders(db, tournamentId),
  ]);
  const gameRows =
    matchRows.length === 0
      ? []
      : await db
          .select()
          .from(matchGames)
          .where(
            inArray(
              matchGames.matchId,
              matchRows.map((m) => m.id),
            ),
          )
          .orderBy(asc(matchGames.gameNo));

  return groupRows.map((g) => {
    const teamIds = memberRows.filter((m) => m.groupId === g.id).map((m) => m.teamId);
    const own = matchRows.filter((m) => m.groupId === g.id);
    const standings = computeStandings({
      teamIds,
      matches: own.map((m) => ({
        matchId: m.id,
        teamAId: m.teamAId ?? '',
        teamBId: m.teamBId ?? '',
        status: m.status,
        winnerTeamId: m.winnerTeamId,
        games: gameRows.filter((x) => x.matchId === m.id),
      })),
      pointsForWin,
      drawOrder: drawOrders.get(g.id),
    });
    return {
      groupId: g.id,
      name: g.name,
      teamIds,
      standings,
      complete: own.length > 0 && own.every((m) => m.status === 'DONE'),
    };
  });
}

/** A complete group still has teams level on every tie-break in or next to the qualifying places. */
export function needsTiebreakDraw(group: GroupStanding, advance: number): boolean {
  return group.complete && group.standings.some((r) => r.needsDraw && r.position <= advance);
}
