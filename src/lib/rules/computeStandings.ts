import type { MatchStatus } from '../schemas/enums';

/**
 * Owner: Lane C (C1). PLAN §4.3. Standings are ALWAYS computed from match results, never stored.
 */

export interface StandingMatch {
  matchId: string;
  teamAId: string;
  teamBId: string;
  status: MatchStatus;
  winnerTeamId: string | null;
  games: { killsA: number; killsB: number }[];
}

export interface StandingRow {
  teamId: string;
  /** 1-based. */
  position: number;
  played: number;
  won: number;
  lost: number;
  gamesWon: number;
  gamesLost: number;
  gameDiff: number;
  killsFor: number;
  killsAgainst: number;
  killDiff: number;
  points: number;
  /** Last 3 results, oldest first. */
  form: ('W' | 'L')[];
  /** True when every tie-break up to the organiser draw is still level with a neighbour. */
  needsDraw: boolean;
}

type Row = Omit<StandingRow, 'position' | 'needsDraw'>;

/**
 * Only DONE matches count. Tie-breaks: head-to-head → game difference → kill difference → total
 * kills → organiser-run draw (`drawOrder`, team ids best first, logged by the service).
 *
 * - Pass `matches` in running order (match number); `form` takes the last 3 in that order.
 * - A match counts only when it is DONE, has a winner, and both teams are in `teamIds`.
 * - Head-to-head = points earned only in matches between the tied teams. Then overall game diff,
 *   kill diff and total kills, one at a time. As soon as a criterion separates some of the tied
 *   teams, the whole chain restarts (from head-to-head) on each smaller tie it leaves, so a 3-way
 *   tie that kill diff splits into 1 + 2 is then decided by the 2-team head-to-head.
 * - Teams level on everything are ordered by `drawOrder`; any not covered keep `teamIds` order and
 *   get `needsDraw: true`, so the service knows an organiser draw is still required.
 */
export function computeStandings(input: {
  teamIds: string[];
  matches: StandingMatch[];
  pointsForWin: number;
  drawOrder?: string[];
}): StandingRow[] {
  const { teamIds, pointsForWin } = input;
  const inGroup = new Set(teamIds);
  const counted = input.matches.filter(
    (m) =>
      m.status === 'DONE' &&
      m.winnerTeamId !== null &&
      inGroup.has(m.teamAId) &&
      inGroup.has(m.teamBId),
  );

  const rows = new Map<string, Row>(
    teamIds.map((teamId) => [
      teamId,
      {
        teamId,
        played: 0,
        won: 0,
        lost: 0,
        gamesWon: 0,
        gamesLost: 0,
        gameDiff: 0,
        killsFor: 0,
        killsAgainst: 0,
        killDiff: 0,
        points: 0,
        form: [],
      },
    ]),
  );

  for (const m of counted) {
    const a = rows.get(m.teamAId)!;
    const b = rows.get(m.teamBId)!;
    const aWon = m.winnerTeamId === m.teamAId;
    for (const [row, won] of [
      [a, aWon],
      [b, !aWon],
    ] as const) {
      row.played++;
      if (won) {
        row.won++;
        row.points += pointsForWin;
      } else {
        row.lost++;
      }
      row.form = [...row.form, won ? ('W' as const) : ('L' as const)].slice(-3);
    }
    for (const g of m.games) {
      a.killsFor += g.killsA;
      a.killsAgainst += g.killsB;
      b.killsFor += g.killsB;
      b.killsAgainst += g.killsA;
      if (g.killsA > g.killsB) {
        a.gamesWon++;
        b.gamesLost++;
      } else {
        b.gamesWon++;
        a.gamesLost++;
      }
    }
  }
  for (const row of rows.values()) {
    row.gameDiff = row.gamesWon - row.gamesLost;
    row.killDiff = row.killsFor - row.killsAgainst;
  }

  const inputIndex = new Map(teamIds.map((id, i) => [id, i]));
  const drawIndex = new Map((input.drawOrder ?? []).map((id, i) => [id, i]));
  const undecided = new Set<string>();

  /** Split `ids` into runs that share the same `key`, best (highest key) first. */
  const partition = (ids: string[], key: (id: string) => number[]): string[][] => {
    const sorted = [...ids].sort((x, y) => compareKeys(key(y), key(x)));
    const parts: string[][] = [];
    for (const id of sorted) {
      const last = parts[parts.length - 1];
      if (last && compareKeys(key(last[0]!), key(id)) === 0) last.push(id);
      else parts.push([id]);
    }
    return parts;
  };

  const h2hPoints = (tied: string[]): ((id: string) => number[]) => {
    const set = new Set(tied);
    const pts = new Map<string, number>(tied.map((id) => [id, 0]));
    for (const m of counted) {
      if (set.has(m.teamAId) && set.has(m.teamBId)) {
        pts.set(m.winnerTeamId!, pts.get(m.winnerTeamId!)! + pointsForWin);
      }
    }
    return (id) => [pts.get(id)!];
  };
  const overall = (field: 'gameDiff' | 'killDiff' | 'killsFor') => (id: string) => [
    rows.get(id)![field],
  ];

  /** Order a set of teams level on points (or on a previous criterion). */
  const breakTie = (tied: string[]): string[] => {
    if (tied.length === 1) return tied;
    const criteria = [
      h2hPoints(tied),
      overall('gameDiff'),
      overall('killDiff'),
      overall('killsFor'),
    ];
    for (const key of criteria) {
      const parts = partition(tied, key);
      if (parts.length > 1) return parts.flatMap(breakTie);
    }
    // Level on everything: the organiser's draw decides.
    const byDraw = (id: string): number => drawIndex.get(id) ?? Number.MAX_SAFE_INTEGER;
    const ordered = [...tied].sort(
      (x, y) => byDraw(x) - byDraw(y) || inputIndex.get(x)! - inputIndex.get(y)!,
    );
    if (!tied.every((id) => drawIndex.has(id))) for (const id of tied) undecided.add(id);
    return ordered;
  };

  const ordered = partition(teamIds, (id) => [rows.get(id)!.points]).flatMap(breakTie);
  return ordered.map((teamId, i) => ({
    ...rows.get(teamId)!,
    position: i + 1,
    needsDraw: undecided.has(teamId),
  }));
}

/** Lexicographic comparison of equal-length number arrays. */
function compareKeys(x: number[], y: number[]): number {
  for (let i = 0; i < x.length; i++) {
    const d = x[i]! - y[i]!;
    if (d !== 0) return d;
  }
  return 0;
}
