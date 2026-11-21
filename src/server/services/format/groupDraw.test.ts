import { asc, eq } from 'drizzle-orm';
import { setupTestDb } from '@/test/db';
import { auditLog, groups, groupTeams, matches, tournaments } from '@/server/db/schema';
import { clearPublishedEvents, getPublishedEvents } from '@/server/realtime/publisher';
import { withTransaction } from '@/server/db/client';
import { drawGroups, undoGroupDraw } from './groupDraw';
import { startGroupDraw } from './startGroupDraw';
import { loadFormatData } from './data';
import { makeFormatTournament, seededRandom, setStatus } from './test-fixtures';

const t = setupTestDb();

async function statusOf(id: string): Promise<string> {
  const [row] = await t.db
    .select({ s: tournaments.status })
    .from(tournaments)
    .where(eq(tournaments.id, id));
  return row!.s;
}

describe('drawGroups', () => {
  beforeEach(() => clearPublishedEvents());

  it('8 teams: 2 groups of 4, 12 fixtures, the knockout tree with placeholders, M1–M15', async () => {
    const f = await makeFormatTournament(t.db, { teams: 8 });
    const res = await drawGroups(f.ownerId, f.tournament.id, { mode: 'RANDOM' }, seededRandom(1));
    expect(res).toEqual({ status: 'GROUP_STAGE', groupCount: 2, matchCount: 15 });
    expect(await statusOf(f.tournament.id)).toBe('GROUP_STAGE');

    const gs = await t.db
      .select()
      .from(groups)
      .where(eq(groups.tournamentId, f.tournament.id))
      .orderBy(asc(groups.sortOrder));
    expect(gs.map((g) => g.name)).toEqual(['A', 'B']);
    const members = await t.db
      .select()
      .from(groupTeams)
      .where(eq(groupTeams.tournamentId, f.tournament.id));
    expect(members).toHaveLength(8);
    // Pot 1 = the two biggest spenders (teams 0 and 1), one per group.
    const pot1 = members
      .filter((m) => m.pot === 1)
      .map((m) => m.teamId)
      .sort();
    expect(pot1).toEqual([f.teamIds[0], f.teamIds[1]].sort());

    const ms = await t.db
      .select()
      .from(matches)
      .where(eq(matches.tournamentId, f.tournament.id))
      .orderBy(asc(matches.matchNumber));
    expect(ms.map((m) => m.matchNumber)).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
    expect(ms.slice(0, 12).every((m) => m.stage === 'GROUP' && m.teamAId && m.teamBId)).toBe(true);
    const ko = ms.slice(12);
    expect(ko.map((m) => [m.round, m.slot])).toEqual([
      [1, 0],
      [1, 1],
      [2, 0],
    ]);
    expect(ko[0]!.sourceA).toEqual({ type: 'GROUP_POS', ref: `${gs[0]!.id}:1` });
    expect(ko[0]!.sourceB).toEqual({ type: 'GROUP_POS', ref: `${gs[1]!.id}:2` });
    expect(ko[0]!.nextMatchId).toBe(ko[2]!.id);
    expect(ko[2]!.sourceA).toEqual({ type: 'WINNER_OF', ref: ko[0]!.id });
    expect(ko[2]!.bestOf).toBe(5);
    expect(ko.every((m) => m.teamAId === null && m.teamBId === null)).toBe(true);

    const events = getPublishedEvents().map((e) => [e.channel, e.envelope.type]);
    expect(events).toEqual([
      [`t:${f.tournament.id}:updates`, 'groups.updated'],
      [`t:${f.tournament.id}:updates`, 'tournament.status'],
    ]);
    const [audit] = await t.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.tournamentId, f.tournament.id));
    expect(audit).toMatchObject({ action: 'groups.drawn', actorUserId: f.ownerId });
  });

  it('the format view shows placeholders from the moment of the draw', async () => {
    const f = await makeFormatTournament(t.db, { teams: 8 });
    await drawGroups(f.coAdminId, f.tournament.id, { mode: 'RANDOM' }, seededRandom(2));
    const data = await loadFormatData(f.tournament.id);
    const final = data.matches.find((m) => m.stageLabel === 'Final')!;
    expect([final.labelA, final.labelB]).toEqual(['Winner of M13', 'Winner of M14']);
    expect(data.matches[12]!.labelA).toBe('Group A #1');
    expect(data.tree.rounds.map((r) => r.name)).toEqual(['Semi-final', 'Final']);
    expect(data.groups.every((g) => g.standings.length === 4 && !g.complete)).toBe(true);
  });

  it('12 teams in 3 groups: byes for the best two group winners, no numbers on byes', async () => {
    const f = await makeFormatTournament(t.db, { teams: 12, settings: { groupCount: 3 } });
    const res = await drawGroups(f.ownerId, f.tournament.id, { mode: 'RANDOM' }, seededRandom(3));
    // 18 group matches + 8-slot bracket: 4 QF rows (2 byes) + 2 SF + final = 25 rows.
    expect(res.matchCount).toBe(25);
    const ms = await t.db.select().from(matches).where(eq(matches.tournamentId, f.tournament.id));
    const byes = ms.filter((m) => m.isBye);
    expect(byes).toHaveLength(2);
    expect(byes.every((m) => m.matchNumber === null)).toBe(true);
    const numbered = ms
      .filter((m) => m.matchNumber !== null)
      .map((m) => m.matchNumber!)
      .sort((a, b) => a - b);
    expect(numbered).toEqual(Array.from({ length: 23 }, (_, i) => i + 1));
  });

  it('manual placement: checked for balance and completeness, pots are empty', async () => {
    const f = await makeFormatTournament(t.db, { teams: 6 });
    const [a, b, c, d, e, g] = f.teamIds as [string, string, string, string, string, string];
    await expect(
      drawGroups(f.ownerId, f.tournament.id, { mode: 'MANUAL', groups: [[a, b, c, d, e, g]] }),
    ).rejects.toMatchObject({
      code: 'RULE_VIOLATION',
      details: { reason: 'GROUP_COUNT' },
    });
    await expect(
      drawGroups(f.ownerId, f.tournament.id, {
        mode: 'MANUAL',
        groups: [
          [a, b],
          [c, d, e, g],
        ],
      }),
    ).rejects.toMatchObject({
      details: { reason: 'UNBALANCED' },
    });
    await expect(
      drawGroups(f.ownerId, f.tournament.id, {
        mode: 'MANUAL',
        groups: [
          [a, b, c],
          [d, e, e],
        ],
      }),
    ).rejects.toMatchObject({
      details: { reason: 'EVERY_TEAM_ONCE' },
    });
    await drawGroups(f.ownerId, f.tournament.id, {
      mode: 'MANUAL',
      groups: [
        [a, c, e],
        [b, d, g],
      ],
    });
    const members = await t.db
      .select()
      .from(groupTeams)
      .where(eq(groupTeams.tournamentId, f.tournament.id));
    expect(members.every((m) => m.pot === null)).toBe(true);
    const data = await loadFormatData(f.tournament.id);
    expect(data.groups.map((x) => x.teams.map((m) => m.teamId).sort())).toEqual([
      [a, c, e].sort(),
      [b, d, g].sort(),
    ]);
  });

  it('2 teams: straight to the final, status KNOCKOUT', async () => {
    const f = await makeFormatTournament(t.db, { teams: 2 });
    const res = await drawGroups(f.ownerId, f.tournament.id, { mode: 'RANDOM' });
    expect(res).toEqual({ status: 'KNOCKOUT', groupCount: 0, matchCount: 1 });
    const [final] = await t.db
      .select()
      .from(matches)
      .where(eq(matches.tournamentId, f.tournament.id));
    expect(final).toMatchObject({
      matchNumber: 1,
      stage: 'KNOCKOUT',
      teamAId: f.teamIds[0],
      teamBId: f.teamIds[1],
      bestOf: 5,
      sourceA: null,
    });
    await expect(
      drawGroups(f.ownerId, f.tournament.id, { mode: 'MANUAL', groups: [[f.teamIds[0]!]] }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('refuses manual placement for a 2-team final and needs 2 teams at all', async () => {
    const two = await makeFormatTournament(t.db, { teams: 2 });
    await expect(
      drawGroups(two.ownerId, two.tournament.id, { mode: 'MANUAL', groups: [two.teamIds] }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    const one = await makeFormatTournament(t.db, { teams: 1 });
    await expect(
      drawGroups(one.ownerId, one.tournament.id, { mode: 'RANDOM' }),
    ).rejects.toMatchObject({ details: { reason: 'NOT_ENOUGH_TEAMS' } });
  });

  it('only at GROUP_DRAW, and only once', async () => {
    const f = await makeFormatTournament(t.db, { teams: 4, status: 'ALLOCATION' });
    await expect(drawGroups(f.ownerId, f.tournament.id, { mode: 'RANDOM' })).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    await setStatus(t.db, f.tournament.id, 'GROUP_DRAW');
    await drawGroups(f.ownerId, f.tournament.id, { mode: 'RANDOM' });
    await expect(drawGroups(f.ownerId, f.tournament.id, { mode: 'RANDOM' })).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('permissions: auctioneers and captains can’t draw; outsiders get 404', async () => {
    const f = await makeFormatTournament(t.db, { teams: 4 });
    const other = await makeFormatTournament(t.db, { teams: 4 });
    await expect(
      drawGroups(f.auctioneerId, f.tournament.id, { mode: 'RANDOM' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      drawGroups(f.captainUserIds[0]!, f.tournament.id, { mode: 'RANDOM' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    // Tenant isolation: organiser of another tournament → 404, and so is logged-out.
    await expect(
      drawGroups(other.ownerId, f.tournament.id, { mode: 'RANDOM' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(drawGroups(null, f.tournament.id, { mode: 'RANDOM' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(await statusOf(f.tournament.id)).toBe('GROUP_DRAW');
  });
});

describe('undoGroupDraw', () => {
  it('removes groups and matches while nothing has been played', async () => {
    const f = await makeFormatTournament(t.db, { teams: 8 });
    await drawGroups(f.ownerId, f.tournament.id, { mode: 'RANDOM' });
    await undoGroupDraw(f.ownerId, f.tournament.id);
    expect(await statusOf(f.tournament.id)).toBe('GROUP_DRAW');
    expect(
      await t.db.select().from(matches).where(eq(matches.tournamentId, f.tournament.id)),
    ).toEqual([]);
    expect(
      await t.db.select().from(groups).where(eq(groups.tournamentId, f.tournament.id)),
    ).toEqual([]);
    // Redraw works.
    await drawGroups(f.ownerId, f.tournament.id, { mode: 'RANDOM' });
    expect(await statusOf(f.tournament.id)).toBe('GROUP_STAGE');
  });

  it('is blocked once a match has started, or when there is no draw', async () => {
    const f = await makeFormatTournament(t.db, { teams: 4 });
    await expect(undoGroupDraw(f.ownerId, f.tournament.id)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    await drawGroups(f.ownerId, f.tournament.id, { mode: 'RANDOM' });
    const [m] = await t.db
      .select()
      .from(matches)
      .where(eq(matches.tournamentId, f.tournament.id))
      .orderBy(asc(matches.matchNumber))
      .limit(1);
    await t.db.update(matches).set({ status: 'LIVE' }).where(eq(matches.id, m!.id));
    await expect(undoGroupDraw(f.ownerId, f.tournament.id)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    const other = await makeFormatTournament(t.db, { teams: 4 });
    await expect(undoGroupDraw(other.ownerId, f.tournament.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('startGroupDraw (cross-lane stub)', () => {
  it('draws at random inside the caller’s transaction', async () => {
    const f = await makeFormatTournament(t.db, { teams: 5 });
    await withTransaction((tx) => startGroupDraw(tx, f.tournament.id));
    expect(await statusOf(f.tournament.id)).toBe('GROUP_STAGE');
    const ms = await t.db.select().from(matches).where(eq(matches.tournamentId, f.tournament.id));
    // One group of 5: 10 fixtures + a final.
    expect(ms).toHaveLength(11);
  });
});
