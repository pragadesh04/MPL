import { DEFAULT_SETTINGS } from '../schemas/settings';
import {
  generateGroups,
  groupName,
  makePots,
  rankForPots,
  shuffle,
  type DrawTeam,
} from './generateGroups';
import type { FormatSettings } from './planFormat';

const settings: FormatSettings = {
  groupCount: null,
  advancePerGroup: 2,
  roundRobinLegs: 1,
  thirdPlaceMatch: DEFAULT_SETTINGS.thirdPlaceMatch,
};

/** Team 't1' has the highest seed value. */
const teams = (n: number): DrawTeam[] =>
  Array.from({ length: n }, (_, i) => ({ teamId: `t${i + 1}`, seedValue: 100 - i, sortOrder: i }));

/** Deterministic PRNG (mulberry32) for repeatable draws. */
function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('pots', () => {
  it('ranks by seed value, then team order', () => {
    const ranked = rankForPots([
      { teamId: 'a', seedValue: 5, sortOrder: 2 },
      { teamId: 'b', seedValue: 9, sortOrder: 3 },
      { teamId: 'c', seedValue: 5, sortOrder: 1 },
    ]);
    expect(ranked.map((t) => t.teamId)).toEqual(['b', 'c', 'a']);
  });

  it('splits into pots of groupCount, the last one may be short', () => {
    const pots = makePots(teams(10), 3);
    expect(pots.map((p) => p.map((t) => t.teamId))).toEqual([
      ['t1', 't2', 't3'],
      ['t4', 't5', 't6'],
      ['t7', 't8', 't9'],
      ['t10'],
    ]);
  });

  it('groupName', () => {
    expect([0, 1, 25].map(groupName)).toEqual(['A', 'B', 'Z']);
  });

  it('shuffle is a permutation driven by random()', () => {
    expect(shuffle([1, 2, 3], () => 0)).toEqual([2, 3, 1]);
    expect(shuffle([1, 2, 3], () => 0.999)).toEqual([1, 2, 3]);
    expect(shuffle([], () => 0)).toEqual([]);
  });
});

describe('generateGroups', () => {
  it('2 teams: no groups', () => {
    expect(generateGroups(teams(2), settings, Math.random)).toEqual([]);
  });

  it('8 teams: 2 groups of 4, one team from each pot', () => {
    const drafts = generateGroups(teams(8), settings, seeded(1));
    expect(drafts.map((d) => d.name)).toEqual(['A', 'B']);
    for (const d of drafts) {
      expect(d.teams.map((t) => t.pot)).toEqual([1, 2, 3, 4]);
    }
    const pot1 = drafts.map((d) => d.teams[0]!.teamId).sort();
    expect(pot1).toEqual(['t1', 't2']);
  });

  it('10 teams: balanced 4, 3, 3 and every team drawn once', () => {
    const drafts = generateGroups(teams(10), settings, seeded(7));
    expect(drafts.map((d) => d.teams.length)).toEqual([4, 3, 3]);
    const all = drafts.flatMap((d) => d.teams.map((t) => t.teamId)).sort();
    expect(all).toEqual(
      teams(10)
        .map((t) => t.teamId)
        .sort(),
    );
    expect(drafts[0]!.teams[3]).toEqual({ teamId: 't10', pot: 4 });
  });

  it('is repeatable for the same random source and varies with it', () => {
    const a = generateGroups(teams(12), settings, seeded(3));
    const b = generateGroups(teams(12), settings, seeded(3));
    expect(a).toEqual(b);
    const draws = new Set(
      [1, 2, 3, 4, 5, 6].map((s) => JSON.stringify(generateGroups(teams(12), settings, seeded(s)))),
    );
    expect(draws.size).toBeGreaterThan(1);
  });

  it('5 teams: one group', () => {
    const drafts = generateGroups(teams(5), settings, seeded(2));
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.teams.map((t) => t.pot)).toEqual([1, 2, 3, 4, 5]);
  });
});
