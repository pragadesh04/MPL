import { computeStandings, type StandingMatch } from './computeStandings';

let n = 0;
/** A DONE best-of match: `games` as [killsA, killsB] pairs; the winner takes most games. */
function played(a: string, b: string, games: [number, number][]): StandingMatch {
  const aGames = games.filter(([x, y]) => x > y).length;
  return {
    matchId: `m${++n}`,
    teamAId: a,
    teamBId: b,
    status: 'DONE',
    winnerTeamId: aGames * 2 > games.length ? a : b,
    games: games.map(([killsA, killsB]) => ({ killsA, killsB })),
  };
}

const order = (rows: { teamId: string }[]): string[] => rows.map((r) => r.teamId);

describe('computeStandings', () => {
  it('starts everyone at zero, in input order, all level', () => {
    const rows = computeStandings({ teamIds: ['a', 'b', 'c'], matches: [], pointsForWin: 3 });
    expect(order(rows)).toEqual(['a', 'b', 'c']);
    expect(rows.map((r) => r.position)).toEqual([1, 2, 3]);
    expect(rows.every((r) => r.needsDraw && r.played === 0 && r.form.length === 0)).toBe(true);
  });

  it('computes every column', () => {
    const rows = computeStandings({
      teamIds: ['a', 'b'],
      matches: [
        played('a', 'b', [
          [20, 15],
          [10, 20],
          [20, 18],
        ]),
      ],
      pointsForWin: 3,
    });
    expect(rows[0]).toEqual({
      teamId: 'a',
      position: 1,
      played: 1,
      won: 1,
      lost: 0,
      gamesWon: 2,
      gamesLost: 1,
      gameDiff: 1,
      killsFor: 50,
      killsAgainst: 53,
      killDiff: -3,
      points: 3,
      form: ['W'],
      needsDraw: false,
    });
    expect(rows[1]).toMatchObject({
      teamId: 'b',
      won: 0,
      lost: 1,
      gamesWon: 1,
      gamesLost: 2,
      killDiff: 3,
      points: 0,
      form: ['L'],
    });
  });

  it('only counts DONE matches with a winner between teams of this group', () => {
    const live: StandingMatch = { ...played('a', 'b', [[20, 1]]), status: 'LIVE' };
    const noWinner: StandingMatch = { ...played('a', 'b', [[20, 1]]), winnerTeamId: null };
    const outsider = played('a', 'zz', [[20, 1]]);
    const rows = computeStandings({
      teamIds: ['a', 'b'],
      matches: [live, noWinner, outsider],
      pointsForWin: 3,
    });
    expect(rows.every((r) => r.played === 0)).toBe(true);
  });

  it('uses pointsForWin and keeps the last 3 results, oldest first', () => {
    const ms = [
      played('a', 'b', [[20, 1]]),
      played('a', 'c', [[1, 20]]),
      played('a', 'd', [[20, 1]]),
      played('a', 'e', [[20, 1]]),
    ];
    const rows = computeStandings({
      teamIds: ['a', 'b', 'c', 'd', 'e'],
      matches: ms,
      pointsForWin: 2,
    });
    const a = rows.find((r) => r.teamId === 'a')!;
    expect(a.points).toBe(6);
    expect(a.form).toEqual(['L', 'W', 'W']);
    expect(rows[0]!.teamId).toBe('a');
  });

  it('counts a win without game scores (e.g. a walkover)', () => {
    const walkover: StandingMatch = {
      matchId: 'w',
      teamAId: 'a',
      teamBId: 'b',
      status: 'DONE',
      winnerTeamId: 'b',
      games: [],
    };
    const rows = computeStandings({ teamIds: ['a', 'b'], matches: [walkover], pointsForWin: 3 });
    expect(rows[0]).toMatchObject({ teamId: 'b', points: 3, gamesWon: 0 });
  });

  it('restarts at head-to-head once a later criterion splits a tie', () => {
    // a>b, b>c, c>a, all Bo1: points, 3-way h2h and game diff are level.
    const ms = [
      played('a', 'b', [[20, 15]]),
      played('b', 'c', [[20, 5]]),
      played('c', 'a', [[20, 10]]),
    ];
    const rows = computeStandings({ teamIds: ['a', 'b', 'c'], matches: ms, pointsForWin: 3 });
    // Kill diff: b +10, a −5, c −5 → b first. {a, c} restarts: c beat a, even though a has more
    // total kills (30 v 25).
    expect(rows.map((r) => r.points)).toEqual([3, 3, 3]);
    expect(order(rows)).toEqual(['b', 'c', 'a']);
    expect(rows.find((r) => r.teamId === 'a')!.killsFor).toBe(30);
  });

  it('tie-break 1: two teams level on points are split by their match', () => {
    const ms = [
      played('a', 'b', [[20, 19]]),
      played('b', 'c', [[20, 0]]),
      played('a', 'd', [[0, 20]]),
      played('c', 'd', [[20, 0]]),
      played('a', 'c', [[0, 20]]),
      played('b', 'd', [[0, 20]]),
    ];
    // a: W(b) L(d) L(c) = 3; b: L(a) W(c) L(d) = 3; c: L(b) W(d) W(a) = 6; d: W(a) L(c) W(b) = 6.
    const rows = computeStandings({ teamIds: ['a', 'b', 'c', 'd'], matches: ms, pointsForWin: 3 });
    // c v d: c won → c first. a v b: a won → a above b despite a worse kill diff.
    expect(order(rows)).toEqual(['c', 'd', 'a', 'b']);
    expect(rows.every((r) => !r.needsDraw)).toBe(true);
  });

  it('tie-break 2–4: game diff, then kill diff, then total kills', () => {
    // Three teams each beat one other (a>b, b>c, c>a): points and h2h all level.
    const gameDiff = computeStandings({
      teamIds: ['a', 'b', 'c'],
      matches: [
        played('a', 'b', [
          [20, 1],
          [20, 1],
        ]),
        played('b', 'c', [
          [20, 1],
          [1, 20],
          [20, 1],
        ]),
        played('c', 'a', [
          [20, 1],
          [1, 20],
          [20, 1],
        ]),
      ],
      pointsForWin: 3,
    });
    // a: +2 −1 = +1 games; b: −2 +1 = −1; c: −1 +1 = 0.
    expect(order(gameDiff)).toEqual(['a', 'c', 'b']);

    const killDiff = computeStandings({
      teamIds: ['a', 'b', 'c'],
      matches: [
        played('a', 'b', [[20, 10]]),
        played('b', 'c', [[20, 15]]),
        played('c', 'a', [[20, 18]]),
      ],
      pointsForWin: 3,
    });
    // a: +10 −2 = +8; b: −10 +5 = −5; c: −5 +2 = −3.
    expect(order(killDiff)).toEqual(['a', 'c', 'b']);

    const totalKills = computeStandings({
      teamIds: ['a', 'b', 'c'],
      matches: [
        played('a', 'b', [[25, 20]]),
        played('b', 'c', [[20, 15]]),
        played('c', 'a', [[20, 15]]),
      ],
      pointsForWin: 3,
    });
    // Every kill diff is 0; kills for: a 40, b 40, c 35 → a/b level → their h2h: a beat b.
    expect(order(totalKills)).toEqual(['a', 'b', 'c']);
    expect(totalKills.every((r) => !r.needsDraw)).toBe(true);
  });

  it('tie-break 5: the organiser draw orders teams level on everything', () => {
    // a and c never met; identical records against b.
    const ms = [played('a', 'b', [[20, 10]]), played('c', 'b', [[20, 10]])];
    const undecided = computeStandings({ teamIds: ['c', 'a', 'b'], matches: ms, pointsForWin: 3 });
    expect(order(undecided)).toEqual(['c', 'a', 'b']);
    expect(undecided.map((r) => r.needsDraw)).toEqual([true, true, false]);

    const drawn = computeStandings({
      teamIds: ['c', 'a', 'b'],
      matches: ms,
      pointsForWin: 3,
      drawOrder: ['a', 'c'],
    });
    expect(order(drawn)).toEqual(['a', 'c', 'b']);
    expect(drawn.every((r) => !r.needsDraw)).toBe(true);
  });

  it('a partial draw order still needs a draw for the teams it misses', () => {
    const rows = computeStandings({
      teamIds: ['a', 'b', 'c'],
      matches: [],
      pointsForWin: 3,
      drawOrder: ['c'],
    });
    expect(order(rows)).toEqual(['c', 'a', 'b']);
    expect(rows.every((r) => r.needsDraw)).toBe(true);
  });
});
