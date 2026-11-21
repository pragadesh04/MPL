import type { StandingRow } from './computeStandings';
import {
  bracketKey,
  bracketOrder,
  generateBracket,
  knockoutShape,
  nextPowerOfTwo,
  roundName,
  seedKnockout,
  THIRD_PLACE_KEY,
  type BracketMatch,
  type KnockoutSeed,
  type SeedGroup,
} from './knockout';

const settings = { thirdPlaceMatch: false, knockoutBestOf: 3, finalBestOf: 5 } as const;

function row(teamId: string, position: number): StandingRow {
  return {
    teamId,
    position,
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
    needsDraw: false,
  };
}

/** Groups 'gA', 'gB', … ; with `teams` the standings are filled (team 'A1' first, …). */
function makeGroups(count: number, teams = 0): SeedGroup[] {
  return Array.from({ length: count }, (_, i) => {
    const name = String.fromCharCode(65 + i);
    return {
      groupId: `g${name}`,
      name,
      standings: Array.from({ length: teams }, (_, p) => row(`${name}${p + 1}`, p + 1)),
    };
  });
}

const label = (s: KnockoutSeed | undefined): string | null => {
  if (!s) return null;
  const [g, pos] = s.source.ref.split(':');
  return `${g!.slice(1)}${pos}`;
};

/** Round-1 pairings as labels, e.g. ['A1 v B2', 'B1 v A2']. */
function pairings(seeds: KnockoutSeed[]): string[] {
  const { size } = knockoutShape(seeds.length);
  const order = bracketOrder(size);
  const by = new Map(seeds.map((s) => [s.seed, s]));
  const out: string[] = [];
  for (let i = 0; i < size; i += 2) {
    out.push(`${label(by.get(order[i]!))} v ${label(by.get(order[i + 1]!)) ?? 'BYE'}`);
  }
  return out;
}

describe('shape helpers', () => {
  it('nextPowerOfTwo', () => {
    expect([1, 2, 3, 5, 8, 9].map(nextPowerOfTwo)).toEqual([1, 2, 4, 8, 8, 16]);
  });

  it('knockoutShape', () => {
    expect(knockoutShape(1)).toEqual({ size: 1, rounds: 0, byes: 0, semisArePlayable: false });
    expect(knockoutShape(2)).toEqual({ size: 2, rounds: 1, byes: 0, semisArePlayable: false });
    expect(knockoutShape(3)).toMatchObject({ size: 4, byes: 1, semisArePlayable: false });
    expect(knockoutShape(4)).toMatchObject({ size: 4, byes: 0, semisArePlayable: true });
    expect(knockoutShape(6)).toMatchObject({ size: 8, rounds: 3, byes: 2, semisArePlayable: true });
  });

  it('bracketOrder spreads the top seeds', () => {
    expect(bracketOrder(1)).toEqual([1]);
    expect(bracketOrder(4)).toEqual([1, 4, 2, 3]);
    expect(bracketOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });

  it('roundName', () => {
    expect(roundName(1, 3)).toBe('Final');
    expect(roundName(2, 3)).toBe('Semi-final');
    expect(roundName(3, 3)).toBe('Quarter-final');
    expect(roundName(4, 4)).toBe('Round of 16');
    expect(roundName(5, 5)).toBe('Round 1');
    expect(roundName(5, 6)).toBe('Round 2');
  });
});

describe('seedKnockout', () => {
  it('returns nothing without groups', () => {
    expect(seedKnockout([], { advancePerGroup: 2 })).toEqual([]);
  });

  it('2 groups: A1 v B2, B1 v A2 with placeholders', () => {
    const seeds = seedKnockout(makeGroups(2), { advancePerGroup: 2 });
    expect(seeds.map((s) => s.seed)).toEqual([1, 2, 3, 4]);
    expect(seeds.every((s) => s.teamId === null)).toBe(true);
    expect(seeds[0]).toEqual({
      seed: 1,
      teamId: null,
      source: { type: 'GROUP_POS', ref: 'gA:1' },
      groupId: 'gA',
    });
    expect(pairings(seeds)).toEqual(['A1 v B2', 'B1 v A2']);
  });

  it('fills team ids from final standings', () => {
    const seeds = seedKnockout(makeGroups(2, 4), { advancePerGroup: 2 });
    expect(seeds.map((s) => s.teamId)).toEqual(['A1', 'B1', 'A2', 'B2']);
  });

  it('keeps the same shape whether or not standings are known', () => {
    const empty = seedKnockout(makeGroups(4), { advancePerGroup: 2 });
    const full = seedKnockout(makeGroups(4, 4), { advancePerGroup: 2 });
    expect(full.map((s) => s.source)).toEqual(empty.map((s) => s.source));
  });

  it.each([
    [2, 2],
    [3, 2],
    [4, 2],
    [5, 2],
    [8, 2],
    [10, 2],
    [2, 3],
    [3, 3],
    [4, 4],
    [3, 6], // needs the backtracking search
    [6, 1],
  ])(
    '%i groups × %i: winners hold the best seeds, no same-group round-1 tie, runners-up opposite their winner',
    (g, adv) => {
      const seeds = seedKnockout(makeGroups(g), { advancePerGroup: adv });
      expect(seeds).toHaveLength(g * adv);
      // Tier 1 = all group winners in group order.
      expect(seeds.slice(0, g).map(label)).toEqual(makeGroups(g).map((x) => `${x.name}1`));
      const { size } = knockoutShape(seeds.length);
      const order = bracketOrder(size);
      const half = (seed: number): number => (order.indexOf(seed) < size / 2 ? 0 : 1);
      for (let i = 0; i < size; i += 2) {
        const a = seeds.find((s) => s.seed === order[i]);
        const b = seeds.find((s) => s.seed === order[i + 1]);
        if (a && b) expect(a.groupId).not.toBe(b.groupId);
      }
      for (const s of seeds.filter((x) => x.source.ref.endsWith(':2'))) {
        const winner = seeds.find((x) => x.source.ref === `${s.groupId}:1`)!;
        expect(half(s.seed)).not.toBe(half(winner.seed));
      }
    },
  );

  it('group winners get the byes first', () => {
    // 3 groups × 2 = 6 → 8-slot bracket, 2 byes for A1 and B1.
    const seeds = seedKnockout(makeGroups(3), { advancePerGroup: 2 });
    expect(pairings(seeds)).toEqual(['A1 v BYE', 'B2 v C2', 'B1 v BYE', 'C1 v A2']);
  });

  it('one group: plain order, and at least 2 advance', () => {
    expect(pairings(seedKnockout(makeGroups(1), { advancePerGroup: 2 }))).toEqual(['A1 v A2']);
    expect(pairings(seedKnockout(makeGroups(1), { advancePerGroup: 1 }))).toEqual(['A1 v A2']);
    expect(pairings(seedKnockout(makeGroups(1), { advancePerGroup: 4 }))).toEqual([
      'A1 v A4',
      'A2 v A3',
    ]);
  });
});

describe('generateBracket', () => {
  const byKey = (ms: BracketMatch[]): Map<string, BracketMatch> =>
    new Map(ms.map((m) => [m.key, m]));

  it('no knockout for fewer than 2 seeds', () => {
    expect(generateBracket([], settings)).toEqual([]);
    expect(
      generateBracket(seedKnockout(makeGroups(1), { advancePerGroup: 2 }).slice(0, 1), settings),
    ).toEqual([]);
  });

  it('2 seeds: a single best-of final', () => {
    const ms = generateBracket(seedKnockout(makeGroups(1, 3), { advancePerGroup: 2 }), settings);
    expect(ms).toHaveLength(1);
    expect(ms[0]).toMatchObject({
      key: 'R1-0',
      stage: 'KNOCKOUT',
      round: 1,
      slot: 0,
      roundName: 'Final',
      bestOf: 5,
      teamA: { teamId: 'A1' },
      teamB: { teamId: 'A2' },
      isBye: false,
      nextKey: null,
      nextSlot: null,
    });
  });

  it('4 seeds: semis link to the final, which uses finalBestOf', () => {
    const ms = byKey(
      generateBracket(seedKnockout(makeGroups(2), { advancePerGroup: 2 }), settings),
    );
    expect([...ms.keys()]).toEqual(['R1-0', 'R1-1', 'R2-0']);
    expect(ms.get('R1-0')).toMatchObject({
      roundName: 'Semi-final',
      bestOf: 3,
      nextKey: 'R2-0',
      nextSlot: 'A',
    });
    expect(ms.get('R1-1')).toMatchObject({ nextKey: 'R2-0', nextSlot: 'B' });
    expect(ms.get('R2-0')).toMatchObject({
      roundName: 'Final',
      bestOf: 5,
      teamA: { teamId: null, source: { type: 'WINNER_OF', ref: 'R1-0' } },
      teamB: { teamId: null, source: { type: 'WINNER_OF', ref: 'R1-1' } },
    });
    expect(ms.get('R1-0')!.teamA.source).toEqual({ type: 'GROUP_POS', ref: 'gA:1' });
  });

  it('byes resolve at once: the team (and its label source) moves into round 2', () => {
    const seeds = seedKnockout(makeGroups(3, 3), { advancePerGroup: 2 });
    const ms = byKey(generateBracket(seeds, settings));
    const bye = ms.get('R1-0')!;
    expect(bye).toMatchObject({
      isBye: true,
      teamA: { teamId: 'A1' },
      teamB: { teamId: null, source: null },
    });
    expect(ms.get('R2-0')!.teamA).toEqual({
      teamId: 'A1',
      source: { type: 'GROUP_POS', ref: 'gA:1' },
    });
    expect(ms.get('R2-0')!.teamB).toEqual({
      teamId: null,
      source: { type: 'WINNER_OF', ref: 'R1-1' },
    });
    expect([...ms.values()].filter((m) => m.isBye)).toHaveLength(2);
    expect([...ms.values()].filter((m) => m.round > 1).every((m) => !m.isBye)).toBe(true);
  });

  it('adds the 3rd-place match between the semi-final losers', () => {
    const ms = byKey(
      generateBracket(seedKnockout(makeGroups(4), { advancePerGroup: 2 }), {
        ...settings,
        thirdPlaceMatch: true,
      }),
    );
    const tp = ms.get(THIRD_PLACE_KEY)!;
    expect(tp).toMatchObject({
      stage: 'THIRD_PLACE',
      round: 3,
      roundName: '3rd place',
      bestOf: 3,
      teamA: { source: { type: 'LOSER_OF', ref: bracketKey(2, 0) } },
      teamB: { source: { type: 'LOSER_OF', ref: bracketKey(2, 1) } },
      nextKey: null,
    });
  });

  it('skips the 3rd-place match when a semi-final is a bye', () => {
    const ms = generateBracket(seedKnockout(makeGroups(1), { advancePerGroup: 3 }), {
      ...settings,
      thirdPlaceMatch: true,
    });
    expect(ms.some((m) => m.stage === 'THIRD_PLACE')).toBe(false);
  });
});
