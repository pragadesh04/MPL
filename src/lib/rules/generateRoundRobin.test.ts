import { generateRoundRobin, type Matchday } from './generateRoundRobin';

const ids = (n: number): string[] => Array.from({ length: n }, (_, i) => `t${i + 1}`);
const pairKey = (a: string, b: string): string => [a, b].sort().join('-');

function checkLeg(teams: string[], leg: Matchday[]): void {
  const seen = new Map<string, number>();
  const rests = new Map<string, number>();
  for (const md of leg) {
    const playing = md.fixtures.flatMap((f) => [f.teamAId, f.teamBId]);
    // Nobody plays twice in a matchday.
    expect(new Set(playing).size).toBe(playing.length);
    if (md.restingTeamId) {
      expect(playing).not.toContain(md.restingTeamId);
      rests.set(md.restingTeamId, (rests.get(md.restingTeamId) ?? 0) + 1);
    }
    for (const f of md.fixtures) {
      const k = pairKey(f.teamAId, f.teamBId);
      seen.set(k, (seen.get(k) ?? 0) + 1);
    }
  }
  // Every pair meets exactly once per leg.
  expect(seen.size).toBe((teams.length * (teams.length - 1)) / 2);
  expect([...seen.values()].every((v) => v === 1)).toBe(true);
  if (teams.length % 2 === 1) {
    expect(rests.size).toBe(teams.length);
    expect([...rests.values()].every((v) => v === 1)).toBe(true);
  }
}

describe('generateRoundRobin', () => {
  it('needs at least 2 teams', () => {
    expect(generateRoundRobin([], 1)).toEqual([]);
    expect(generateRoundRobin(['solo'], 1)).toEqual([]);
  });

  it('2 teams: one matchday', () => {
    expect(generateRoundRobin(['a', 'b'], 1)).toEqual([
      { matchday: 1, fixtures: [{ teamAId: 'a', teamBId: 'b' }], restingTeamId: null },
    ]);
  });

  it.each([3, 4, 5, 6, 7, 8])('%i teams: a valid single round robin', (n) => {
    const days = generateRoundRobin(ids(n), 1);
    expect(days).toHaveLength(n % 2 === 0 ? n - 1 : n);
    expect(days.map((d) => d.matchday)).toEqual(days.map((_, i) => i + 1));
    checkLeg(ids(n), days);
    if (n % 2 === 0) expect(days.every((d) => d.restingTeamId === null)).toBe(true);
  });

  it('alternates the fixed team between sides', () => {
    const days = generateRoundRobin(ids(4), 1);
    const sides = days.map((d) => (d.fixtures.some((f) => f.teamAId === 't1') ? 'A' : 'B'));
    expect(sides).toEqual(['A', 'B', 'A']);
  });

  it('two legs repeat the fixtures with sides swapped', () => {
    for (const n of [4, 5]) {
      const days = generateRoundRobin(ids(n), 2);
      const half = days.length / 2;
      expect(days.map((d) => d.matchday)).toEqual(days.map((_, i) => i + 1));
      checkLeg(ids(n), days.slice(0, half));
      checkLeg(ids(n), days.slice(half));
      days.slice(half).forEach((md, i) => {
        const first = days[i]!;
        expect(md.restingTeamId).toBe(first.restingTeamId);
        expect(md.fixtures).toEqual(
          first.fixtures.map((f) => ({ teamAId: f.teamBId, teamBId: f.teamAId })),
        );
      });
    }
  });
});
