import { and, asc, eq } from 'drizzle-orm';
import { setupTestDb } from '@/test/db';
import { auditLog, matches, playerStats, tournaments } from '@/server/db/schema';
import { clearPublishedEvents, getPublishedEvents } from '@/server/realtime/publisher';
import { drawGroups } from '../format/groupDraw';
import { loadFormatData } from '../format/data';
import { makeFormatTournament, seededRandom, type FormatFixture } from '../format/test-fixtures';
import {
  generateKnockout,
  reorderMatches,
  runTiebreakDraw,
  scoreGames,
  updateMatch,
} from './results';

const t = setupTestDb();

type Row = typeof matches.$inferSelect;

async function allMatches(tid: string): Promise<Row[]> {
  return t.db
    .select()
    .from(matches)
    .where(eq(matches.tournamentId, tid))
    .orderBy(asc(matches.matchNumber));
}
async function statusOf(tid: string): Promise<string> {
  const [r] = await t.db
    .select({ s: tournaments.status })
    .from(tournaments)
    .where(eq(tournaments.id, tid));
  return r!.s;
}
/** Best-of-N games that `side` wins (minimum number of games). */
function sweep(side: 'A' | 'B', bestOf: number): { killsA: number; killsB: number }[] {
  return Array.from({ length: Math.ceil(bestOf / 2) }, () =>
    side === 'A' ? { killsA: 20, killsB: 10 } : { killsA: 10, killsB: 20 },
  );
}
async function play(f: FormatFixture, m: Row, side: 'A' | 'B', confirmCascade?: boolean) {
  return updateMatch(f.ownerId, f.tournament.id, m.id, {
    action: 'result',
    games: sweep(side, m.bestOf),
    confirmCascade,
  });
}

/** Draw 8 teams and play every group match: the team listed first (slot A) always wins. */
async function groupStageDone(): Promise<FormatFixture> {
  const f = await makeFormatTournament(t.db, { teams: 8, soldiersPerTeam: 2 });
  await drawGroups(f.ownerId, f.tournament.id, { mode: 'RANDOM' }, seededRandom(5));
  for (const m of (await allMatches(f.tournament.id)).filter((x) => x.stage === 'GROUP')) {
    await play(f, m, 'A');
  }
  return f;
}

describe('scoreGames', () => {
  it('decides at a majority and refuses extra or tied games', () => {
    expect(scoreGames([{ killsA: 20, killsB: 3 }], 1)).toEqual({
      winsA: 1,
      winsB: 0,
      decided: 'A',
    });
    expect(scoreGames([{ killsA: 1, killsB: 3 }], 3)).toEqual({
      winsA: 0,
      winsB: 1,
      decided: null,
    });
    expect(() => scoreGames([{ killsA: 5, killsB: 5 }], 1)).toThrow(/replay/);
    expect(() => scoreGames(sweep('A', 3).concat({ killsA: 1, killsB: 2 }), 3)).toThrow(
      /already decided/,
    );
    expect(() =>
      scoreGames(sweep('A', 1).concat(sweep('B', 1), sweep('A', 1), sweep('B', 1)), 3),
    ).toThrow(/Game 4: More games than the best-of allows/);
  });
});

describe('results and progression', () => {
  beforeEach(() => clearPublishedEvents());

  it('a group result updates standings, is logged and published', async () => {
    const f = await makeFormatTournament(t.db, { teams: 4 });
    await drawGroups(f.ownerId, f.tournament.id, { mode: 'RANDOM' }, seededRandom(1));
    const [m1] = await allMatches(f.tournament.id);
    clearPublishedEvents();
    const res = await updateMatch(f.coAdminId, f.tournament.id, m1!.id, {
      action: 'result',
      games: [{ map: 'Outpost', killsA: 20, killsB: 12 }],
    });
    expect(res).toMatchObject({ status: 'DONE', tournamentStatus: 'GROUP_STAGE' });
    const data = await loadFormatData(f.tournament.id);
    const top = data.groups[0]!.standings[0]!;
    expect(top).toMatchObject({ teamId: m1!.teamAId, points: 3, killsFor: 20, killDiff: 8 });
    expect(data.matches[0]!.games).toEqual([
      { gameNo: 1, map: 'Outpost', killsA: 20, killsB: 12, winnerTeamId: m1!.teamAId },
    ]);
    expect(getPublishedEvents().map((e) => [e.envelope.type, e.envelope.data])).toEqual([
      ['match.updated', { matchIds: [m1!.id] }],
    ]);
    const [audit] = await t.db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.tournamentId, f.tournament.id),
          eq(auditLog.action, 'match.result_recorded'),
        ),
      );
    expect(audit).toBeTruthy();
  });

  it('partial best-of results keep the match LIVE; clearing returns it', async () => {
    const f = await makeFormatTournament(t.db, { teams: 4, settings: { groupMatchBestOf: 3 } });
    await drawGroups(f.ownerId, f.tournament.id, { mode: 'RANDOM' });
    const [m] = await allMatches(f.tournament.id);
    await expect(
      updateMatch(f.ownerId, f.tournament.id, m!.id, {
        action: 'result',
        games: [{ killsA: 1, killsB: 20 }],
      }),
    ).resolves.toMatchObject({ status: 'LIVE' });
    await expect(
      updateMatch(f.ownerId, f.tournament.id, m!.id, { action: 'result', games: [] }),
    ).resolves.toMatchObject({ status: 'LIVE' });
    await expect(
      updateMatch(f.ownerId, f.tournament.id, m!.id, { action: 'unmark-live' }),
    ).resolves.toMatchObject({
      status: 'SCHEDULED',
    });
  });

  it('mark live, schedule, unmark; knockout matches can’t start in the group stage', async () => {
    const f = await makeFormatTournament(t.db, { teams: 4 });
    await drawGroups(f.ownerId, f.tournament.id, { mode: 'RANDOM' });
    const ms = await allMatches(f.tournament.id);
    const m = ms[0]!;
    await updateMatch(f.ownerId, f.tournament.id, m.id, { action: 'mark-live' });
    await expect(
      updateMatch(f.ownerId, f.tournament.id, m.id, { action: 'mark-live' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await updateMatch(f.ownerId, f.tournament.id, m.id, {
      action: 'schedule',
      scheduledAt: '2026-11-22T18:30:00+05:30',
    });
    const data = await loadFormatData(f.tournament.id);
    expect(data.matches[0]).toMatchObject({
      status: 'LIVE',
      scheduledAt: '2026-11-22T13:00:00.000Z',
    });
    await updateMatch(f.ownerId, f.tournament.id, m.id, {
      action: 'result',
      games: [{ killsA: 3, killsB: 9 }],
    });
    await expect(
      updateMatch(f.ownerId, f.tournament.id, m.id, { action: 'unmark-live' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    const final = ms.find((x) => x.stage === 'KNOCKOUT')!;
    await expect(
      updateMatch(f.ownerId, f.tournament.id, final.id, { action: 'mark-live' }),
    ).rejects.toMatchObject({
      code: 'RULE_VIOLATION',
    });
  });

  it('per-soldier stats: only soldiers of the two teams, one MVP', async () => {
    const f = await makeFormatTournament(t.db, { teams: 4, soldiersPerTeam: 2 });
    await drawGroups(f.ownerId, f.tournament.id, { mode: 'RANDOM' });
    const [m] = await allMatches(f.tournament.id);
    const aSquad = f.squadPlayerIds[f.teamIds.indexOf(m!.teamAId!)]!;
    const outsider = f.squadPlayerIds.find(
      (_, i) => f.teamIds[i] !== m!.teamAId && f.teamIds[i] !== m!.teamBId,
    )![0]!;
    const games = [{ killsA: 20, killsB: 2 }];
    await expect(
      updateMatch(f.ownerId, f.tournament.id, m!.id, {
        action: 'result',
        games,
        playerStats: [{ playerId: outsider, kills: 3, deaths: 1, mvp: false }],
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(
      updateMatch(f.ownerId, f.tournament.id, m!.id, {
        action: 'result',
        games,
        playerStats: aSquad.map((playerId) => ({ playerId, kills: 1, deaths: 1, mvp: true })),
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await updateMatch(f.ownerId, f.tournament.id, m!.id, {
      action: 'result',
      games,
      playerStats: [
        { playerId: aSquad[0]!, kills: 12, deaths: 2, mvp: true },
        { playerId: aSquad[1]!, kills: 8, deaths: 5, mvp: false },
      ],
    });
    const rows = await t.db.select().from(playerStats).where(eq(playerStats.matchId, m!.id));
    expect(rows).toHaveLength(2);
    expect((await loadFormatData(f.tournament.id)).matches[0]!.playerStats).toHaveLength(2);
  });

  it('full run: group stage → Generate knockout → auto-advance → champion', async () => {
    const f = await groupStageDone();
    expect((await loadFormatData(f.tournament.id)).readyForKnockout).toBe(true);
    clearPublishedEvents();
    await generateKnockout(f.ownerId, f.tournament.id);
    expect(await statusOf(f.tournament.id)).toBe('KNOCKOUT');
    expect(getPublishedEvents().map((e) => e.envelope.type)).toEqual([
      'match.updated',
      'tournament.status',
    ]);

    const data = await loadFormatData(f.tournament.id);
    const [semi1, semi2] = data.matches.filter((m) => m.stageLabel === 'Semi-final');
    const [ga, gb] = data.groups;
    // A1 v B2, B1 v A2.
    expect([semi1!.teamAId, semi1!.teamBId]).toEqual([
      ga!.standings[0]!.teamId,
      gb!.standings[1]!.teamId,
    ]);
    expect([semi2!.teamAId, semi2!.teamBId]).toEqual([
      gb!.standings[0]!.teamId,
      ga!.standings[1]!.teamId,
    ]);

    // Group results are now locked once the knockout starts.
    const ko = (await allMatches(f.tournament.id)).filter((m) => m.stage === 'KNOCKOUT');
    await play(f, ko[0]!, 'B');
    const group1 = (await allMatches(f.tournament.id))[0]!;
    await expect(play(f, group1, 'B')).rejects.toMatchObject({ code: 'CONFLICT' });

    await play(f, ko[1]!, 'A');
    let final = (await allMatches(f.tournament.id)).find((m) => m.id === ko[2]!.id)!;
    expect([final.teamAId, final.teamBId]).toEqual([semi1!.teamBId, semi2!.teamAId]);
    expect(final.bestOf).toBe(5);

    await play(f, final, 'A');
    expect(await statusOf(f.tournament.id)).toBe('COMPLETED');
    expect((await loadFormatData(f.tournament.id)).championTeamId).toBe(semi1!.teamBId);

    // Editing the final changes the champion; clearing it reopens the knockout.
    final = (await allMatches(f.tournament.id)).find((m) => m.id === ko[2]!.id)!;
    await play(f, final, 'B');
    expect((await loadFormatData(f.tournament.id)).championTeamId).toBe(semi2!.teamAId);
    await updateMatch(f.ownerId, f.tournament.id, final.id, { action: 'result', games: [] });
    expect(await statusOf(f.tournament.id)).toBe('KNOCKOUT');
  });

  it('editing a semi-final: needs confirmation, then cascades; blocked once the final started', async () => {
    const f = await groupStageDone();
    await generateKnockout(f.ownerId, f.tournament.id);
    const [s1, s2, fin] = (await allMatches(f.tournament.id)).filter((m) => m.stage === 'KNOCKOUT');
    await play(f, s1!, 'A');
    await play(f, s2!, 'A');
    // Flip semi 1: the final's slot A changes → warning first.
    await expect(play(f, s1!, 'B')).rejects.toMatchObject({
      code: 'CONFLICT',
      details: { needsConfirm: true },
    });
    await play(f, s1!, 'B', true);
    let final = (await allMatches(f.tournament.id)).find((m) => m.id === fin!.id)!;
    expect(final.teamAId).toBe(s1!.teamBId);
    // Once the final is live, upstream winners can't change.
    await updateMatch(f.ownerId, f.tournament.id, final.id, { action: 'mark-live' });
    await expect(play(f, s1!, 'A', true)).rejects.toMatchObject({ code: 'CONFLICT' });
    // Same winner again is fine (no downstream change).
    await expect(play(f, s1!, 'B')).resolves.toMatchObject({ status: 'DONE' });
    final = (await allMatches(f.tournament.id)).find((m) => m.id === fin!.id)!;
    expect(final.status).toBe('LIVE');
  });

  it('3rd-place match gets the semi-final losers', async () => {
    const f = await makeFormatTournament(t.db, { teams: 8, settings: { thirdPlaceMatch: true } });
    await drawGroups(f.ownerId, f.tournament.id, { mode: 'RANDOM' }, seededRandom(9));
    for (const m of (await allMatches(f.tournament.id)).filter((x) => x.stage === 'GROUP'))
      await play(f, m, 'B');
    await generateKnockout(f.ownerId, f.tournament.id);
    const ms = await allMatches(f.tournament.id);
    const semis = ms.filter((m) => m.stage === 'KNOCKOUT' && m.round === 1);
    const tp = ms.find((m) => m.stage === 'THIRD_PLACE')!;
    expect(tp.matchNumber).toBe(15);
    await play(f, semis[0]!, 'A');
    await play(f, semis[1]!, 'B');
    const after = (await allMatches(f.tournament.id)).find((m) => m.id === tp.id)!;
    expect([after.teamAId, after.teamBId]).toEqual([semis[0]!.teamBId, semis[1]!.teamAId]);
  });

  it('byes resolve at Generate knockout and the bye team is already in round 2', async () => {
    const f = await makeFormatTournament(t.db, { teams: 12, settings: { groupCount: 3 } });
    await drawGroups(f.ownerId, f.tournament.id, { mode: 'RANDOM' }, seededRandom(4));
    for (const m of (await allMatches(f.tournament.id)).filter((x) => x.stage === 'GROUP'))
      await play(f, m, 'A');
    await generateKnockout(f.ownerId, f.tournament.id);
    const ms = await allMatches(f.tournament.id);
    const byes = ms.filter((m) => m.isBye);
    expect(
      byes.every((m) => m.status === 'DONE' && m.winnerTeamId === m.teamAId && m.teamAId),
    ).toBe(true);
    for (const bye of byes) {
      const next = ms.find((m) => m.id === bye.nextMatchId)!;
      expect(bye.nextSlot === 'A' ? next.teamAId : next.teamBId).toBe(bye.teamAId);
    }
    await expect(
      updateMatch(f.ownerId, f.tournament.id, byes[0]!.id, { action: 'mark-live' }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('a group edit after Generate knockout (nothing played) refills or empties the knockout', async () => {
    const f = await groupStageDone();
    await generateKnockout(f.ownerId, f.tournament.id);
    const group1 = (await allMatches(f.tournament.id))[0]!;
    // Clearing a group result makes the group incomplete → back to the group stage, slots emptied.
    await updateMatch(f.ownerId, f.tournament.id, group1.id, { action: 'result', games: [] });
    expect(await statusOf(f.tournament.id)).toBe('GROUP_STAGE');
    const ko = (await allMatches(f.tournament.id)).filter((m) => m.stage === 'KNOCKOUT');
    expect(ko.every((m) => m.teamAId === null && m.teamBId === null)).toBe(true);
    await expect(generateKnockout(f.ownerId, f.tournament.id)).rejects.toMatchObject({
      details: { reason: 'GROUPS_NOT_DONE' },
    });
  });

  it('organiser tie-break draw when teams are level on everything', async () => {
    // One group of 3 where everyone wins once with identical scores: a full 3-way tie.
    const f = await makeFormatTournament(t.db, { teams: 3 });
    await drawGroups(f.ownerId, f.tournament.id, { mode: 'RANDOM' });
    const groupMatches = (await allMatches(f.tournament.id)).filter((m) => m.stage === 'GROUP');
    // Make a cycle: each team wins exactly once 20–10.
    const wins = new Map<string, number>();
    for (const m of groupMatches) {
      const a = wins.get(m.teamAId!) ?? 0;
      const side = a === 0 ? 'A' : 'B';
      await play(f, m, side);
      const w = side === 'A' ? m.teamAId! : m.teamBId!;
      wins.set(w, (wins.get(w) ?? 0) + 1);
    }
    expect([...wins.values()]).toEqual([1, 1, 1]);
    const data = await loadFormatData(f.tournament.id);
    expect(data.groups[0]!.needsTiebreakDraw).toBe(true);
    await expect(generateKnockout(f.ownerId, f.tournament.id)).rejects.toMatchObject({
      details: { reason: 'TIEBREAK_DRAW_NEEDED' },
    });
    const { order } = await runTiebreakDraw(
      f.ownerId,
      f.tournament.id,
      data.groups[0]!.id,
      seededRandom(3),
    );
    const after = await loadFormatData(f.tournament.id);
    expect(after.groups[0]!.standings.map((r) => r.teamId)).toEqual(order);
    expect(after.groups[0]!.needsTiebreakDraw).toBe(false);
    await generateKnockout(f.ownerId, f.tournament.id);
  });

  it('reorders unplayed group matches and keeps numbers unique', async () => {
    const f = await makeFormatTournament(t.db, { teams: 4 });
    await drawGroups(f.ownerId, f.tournament.id, { mode: 'RANDOM' });
    const ms = await allMatches(f.tournament.id);
    const group = ms.filter((m) => m.stage === 'GROUP');
    await play(f, group[0]!, 'A');
    const rest = group
      .slice(1)
      .map((m) => m.id)
      .reverse();
    const res = await reorderMatches(f.ownerId, f.tournament.id, rest);
    expect(res.numbers.map((n) => n.matchNumber)).toEqual([2, 3, 4, 5, 6]);
    const after = await allMatches(f.tournament.id);
    expect(after.slice(1, 6).map((m) => m.id)).toEqual(rest);
    await expect(
      reorderMatches(
        f.ownerId,
        f.tournament.id,
        group.map((m) => m.id),
      ),
    ).rejects.toMatchObject({
      details: { reason: 'ALREADY_PLAYED' },
    });
  });

  it('permissions and tenant isolation', async () => {
    const f = await makeFormatTournament(t.db, { teams: 4 });
    const other = await makeFormatTournament(t.db, { teams: 4 });
    await drawGroups(f.ownerId, f.tournament.id, { mode: 'RANDOM' });
    const [m] = await allMatches(f.tournament.id);
    const result = { action: 'result' as const, games: [{ killsA: 1, killsB: 2 }] };
    await expect(updateMatch(f.auctioneerId, f.tournament.id, m!.id, result)).rejects.toMatchObject(
      { code: 'FORBIDDEN' },
    );
    await expect(
      updateMatch(f.captainUserIds[0]!, f.tournament.id, m!.id, result),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(updateMatch(other.ownerId, f.tournament.id, m!.id, result)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    // A match id from another tournament, through my own tournament → 404.
    await expect(
      updateMatch(other.ownerId, other.tournament.id, m!.id, result),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(generateKnockout(other.ownerId, f.tournament.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(reorderMatches(other.ownerId, f.tournament.id, [m!.id])).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(runTiebreakDraw(other.ownerId, f.tournament.id, m!.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
