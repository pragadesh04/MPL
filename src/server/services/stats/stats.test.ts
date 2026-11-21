import { asc, eq } from 'drizzle-orm';
import { setupTestDb } from '@/test/db';
import { matches } from '@/server/db/schema';
import { drawGroups } from '../format/groupDraw';
import { makeFormatTournament, seededRandom } from '../format/test-fixtures';
import { updateMatch } from '../matches/results';
import { getAuditLog, getStats } from './stats';

const t = setupTestDb();

describe('stats and audit log', () => {
  it('leaderboards come from recorded soldier stats; audit is organisers only', async () => {
    const f = await makeFormatTournament(t.db, { teams: 4, soldiersPerTeam: 2 });
    const other = await makeFormatTournament(t.db, { teams: 2 });
    await drawGroups(f.ownerId, f.tournament.id, { mode: 'RANDOM' }, seededRandom(1));
    const [m] = await t.db
      .select()
      .from(matches)
      .where(eq(matches.tournamentId, f.tournament.id))
      .orderBy(asc(matches.matchNumber))
      .limit(1);
    const squad = f.squadPlayerIds[f.teamIds.indexOf(m!.teamAId!)]!;
    await updateMatch(f.ownerId, f.tournament.id, m!.id, {
      action: 'result',
      games: [{ killsA: 20, killsB: 4 }],
      playerStats: [
        { playerId: squad[0]!, kills: 11, deaths: 2, mvp: true },
        { playerId: squad[1]!, kills: 9, deaths: 2, mvp: false },
      ],
    });

    const stats = await getStats(f.soldierUserIds[0]!, f.tournament.id);
    expect(stats.leaderboards.kills.map((r) => [r.player.id, r.value])).toEqual([
      [squad[0], 11],
      [squad[1], 9],
    ]);
    expect(stats.leaderboards.mvps[0]!.player.id).toBe(squad[0]);
    await expect(getStats(other.ownerId, f.tournament.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });

    const audit = await getAuditLog(f.auctioneerId, f.tournament.id);
    expect(audit.entries.map((e) => e.action)).toEqual(['match.result_recorded', 'groups.drawn']);
    expect(audit.actions).toEqual(['groups.drawn', 'match.result_recorded']);
    expect(
      (await getAuditLog(f.ownerId, f.tournament.id, { action: 'match.' })).entries,
    ).toHaveLength(1);
    expect(
      (await getAuditLog(f.ownerId, f.tournament.id, { actor: 'no such person' })).entries,
    ).toHaveLength(0);
    await expect(getAuditLog(f.captainUserIds[0]!, f.tournament.id)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(getAuditLog(other.ownerId, f.tournament.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
