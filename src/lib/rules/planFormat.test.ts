import { DEFAULT_SETTINGS } from '../schemas/settings';
import {
  advancePerGroupOf,
  balancedGroupSizes,
  planFormat,
  type FormatSettings,
} from './planFormat';

const base: FormatSettings = {
  groupCount: DEFAULT_SETTINGS.groupCount,
  advancePerGroup: DEFAULT_SETTINGS.advancePerGroup,
  roundRobinLegs: DEFAULT_SETTINGS.roundRobinLegs,
  thirdPlaceMatch: DEFAULT_SETTINGS.thirdPlaceMatch,
};

describe('balancedGroupSizes', () => {
  it('differs by at most one, larger groups first', () => {
    expect(balancedGroupSizes(10, 3)).toEqual([4, 3, 3]);
    expect(balancedGroupSizes(8, 2)).toEqual([4, 4]);
    expect(balancedGroupSizes(11, 3)).toEqual([4, 4, 3]);
  });
});

describe('planFormat', () => {
  it('matches the PLAN §4.1 example: 8 teams', () => {
    const plan = planFormat(8, base);
    expect(plan).toMatchObject({
      kind: 'GROUPS',
      groupCount: 2,
      groupSizes: [4, 4],
      groupMatches: 12,
      qualified: 4,
      knockoutRounds: ['Semi-final', 'Final'],
      knockoutMatches: 3,
      totalMatches: 15,
    });
    expect(plan.summary).toBe(
      '8 teams → 2 groups of 4 → 12 group matches → top 2 per group → semi-finals → final. Total: 15 matches.',
    );
    expect(advancePerGroupOf(plan)).toBe(2);
  });

  it('2 teams go straight to a final', () => {
    const plan = planFormat(2, base);
    expect(plan).toMatchObject({
      kind: 'FINAL_ONLY',
      groupCount: 0,
      qualified: 2,
      knockoutRounds: ['Final'],
      totalMatches: 1,
    });
    expect(plan.summary).toBe('2 teams → straight to the final. Total: 1 match.');
    expect(advancePerGroupOf(plan)).toBe(0);
  });

  it('fewer than 2 teams has no format yet', () => {
    for (const n of [0, 1]) {
      const plan = planFormat(n, base);
      expect(plan.kind).toBe('FINAL_ONLY');
      expect(plan.totalMatches).toBe(0);
      expect(plan.knockoutRounds).toEqual([]);
      expect(plan.summary).toBe('Add at least 2 captains to see the format.');
    }
  });

  it.each([3, 4, 5])('%i teams play one group and a final', (n) => {
    const plan = planFormat(n, { ...base, groupCount: 3 });
    expect(plan.kind).toBe('SINGLE_GROUP');
    expect(plan.groupCount).toBe(1);
    expect(plan.groupSizes).toEqual([n]);
    expect(plan.qualified).toBe(2);
    expect(plan.knockoutRounds).toEqual(['Final']);
    expect(plan.groupMatches).toBe((n * (n - 1)) / 2);
    expect(plan.summary).toBe(
      `${n} teams → 1 group of ${n} → ${plan.groupMatches} group matches → top 2 → final. Total: ${plan.groupMatches + 1} matches.`,
    );
  });

  it('one group with 4 advancing plays semi-finals', () => {
    const plan = planFormat(5, { ...base, advancePerGroup: 4 });
    expect(plan.qualified).toBe(4);
    expect(plan.knockoutRounds).toEqual(['Semi-final', 'Final']);
  });

  it('one group always sends at least 2 to the knockout', () => {
    expect(planFormat(4, { ...base, advancePerGroup: 1 }).qualified).toBe(2);
  });

  it('clamps advancePerGroup to the smallest group', () => {
    const plan = planFormat(10, { ...base, groupCount: 3, advancePerGroup: 4 });
    expect(plan.groupSizes).toEqual([4, 3, 3]);
    expect(plan.qualified).toBe(9);
    expect(plan.summary).toContain('3 groups (4, 3, 3)');
    expect(plan.summary).toContain('top 3 per group');
  });

  it('auto group count is ceil(teams / 4), clamped so groups have ≥ 3 teams', () => {
    expect(planFormat(10, base).groupCount).toBe(3);
    expect(planFormat(6, base).groupCount).toBe(2);
    expect(planFormat(32, base).groupCount).toBe(8);
    // Override larger than possible: 7 teams can only make 2 groups of ≥ 3.
    expect(planFormat(7, { ...base, groupCount: 5 }).groupCount).toBe(2);
  });

  it('an override of one group is a single league', () => {
    const plan = planFormat(8, { ...base, groupCount: 1 });
    expect(plan.kind).toBe('SINGLE_GROUP');
    expect(plan.groupMatches).toBe(28);
  });

  it('counts byes out of the knockout matches (qualified − 1)', () => {
    // 3 groups × 2 = 6 qualified → 8-slot bracket with 2 byes → 5 playable matches.
    const plan = planFormat(12, { ...base, groupCount: 3 });
    expect(plan.qualified).toBe(6);
    expect(plan.knockoutRounds).toEqual(['Quarter-final', 'Semi-final', 'Final']);
    expect(plan.knockoutMatches).toBe(5);
  });

  it('two legs double the group matches', () => {
    const plan = planFormat(8, { ...base, roundRobinLegs: 2 });
    expect(plan.groupMatches).toBe(24);
    expect(plan.summary).toContain('24 group matches (home and away)');
  });

  it('adds a 3rd-place match only when both semi-finals are real', () => {
    const eight = planFormat(8, { ...base, thirdPlaceMatch: true });
    expect(eight.knockoutMatches).toBe(4);
    expect(eight.summary).toContain('→ final → 3rd-place match. Total: 16 matches.');
    // 1 group, 3 advance: a 4-slot bracket with a bye, so one semi-final isn't played.
    const three = planFormat(5, { ...base, advancePerGroup: 3, thirdPlaceMatch: true });
    expect(three.qualified).toBe(3);
    expect(three.knockoutMatches).toBe(2);
    expect(three.summary).not.toContain('3rd-place');
    // A final only can't have one either.
    expect(planFormat(4, { ...base, thirdPlaceMatch: true }).knockoutMatches).toBe(1);
  });

  it('uses round names for big brackets', () => {
    const plan = planFormat(32, { ...base, groupCount: 8, advancePerGroup: 4 });
    expect(plan.qualified).toBe(32);
    expect(plan.knockoutRounds).toEqual([
      'Round 1',
      'Round of 16',
      'Quarter-final',
      'Semi-final',
      'Final',
    ]);
    expect(plan.summary).toContain('round 1 → round of 16 → quarter-finals');
  });
});
