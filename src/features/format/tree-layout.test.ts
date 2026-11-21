import { buildTournamentTree, type TreeInputMatch } from '@/lib/rules/buildTournamentTree';
import { layoutTree, slotY, TREE } from './tree-layout';

function m(over: Partial<TreeInputMatch> & { id: string }): TreeInputMatch {
  return {
    matchNumber: null,
    stage: 'KNOCKOUT',
    groupId: null,
    round: 1,
    slot: 0,
    teamAId: null,
    teamBId: null,
    sourceA: null,
    sourceB: null,
    winnerTeamId: null,
    nextMatchId: null,
    isBye: false,
    status: 'SCHEDULED',
    score: null,
    ...over,
  };
}

const groups = ['A', 'B'].map((name) => ({
  groupId: `g${name}`,
  name,
  teamIds: ['1', '2', '3', '4'].map((x) => `${name}${x}`),
  standings: [],
  advancePerGroup: 2,
}));

const semisAndFinal = [
  m({
    id: 's1',
    slot: 0,
    matchNumber: 13,
    sourceA: { type: 'GROUP_POS', ref: 'gA:1' },
    sourceB: { type: 'GROUP_POS', ref: 'gB:2' },
    nextMatchId: 'f',
  }),
  m({
    id: 's2',
    slot: 1,
    matchNumber: 14,
    sourceA: { type: 'GROUP_POS', ref: 'gB:1' },
    sourceB: { type: 'GROUP_POS', ref: 'gA:2' },
    nextMatchId: 'f',
  }),
  m({
    id: 'f',
    round: 2,
    matchNumber: 16,
    sourceA: { type: 'WINNER_OF', ref: 's1' },
    sourceB: { type: 'WINNER_OF', ref: 's2' },
  }),
];

describe('layoutTree', () => {
  it('puts each node halfway between its feeders, with group and feeder connectors', () => {
    const layout = layoutTree(buildTournamentTree(groups, semisAndFinal), { showGroups: true });
    const node = (id: string) => layout.nodes.find((n) => n.matchId === id)!;
    const mid = (id: string) => node(id).y + TREE.nodeH / 2;
    expect(mid('f')).toBeCloseTo((mid('s1') + mid('s2')) / 2);
    expect(node('f').x).toBeGreaterThan(node('s1').x);
    expect(layout.groups).toHaveLength(2);
    expect(layout.groups[0]!.rowY).toHaveLength(4);
    expect(layout.connectors.filter((c) => c.from.startsWith('group:'))).toHaveLength(4);
    expect(layout.connectors.filter((c) => c.to === 'f').map((c) => c.slot)).toEqual(['A', 'B']);
    expect(layout.champion!.x).toBeGreaterThan(node('f').x);
    expect(layout.width).toBeGreaterThan(layout.champion!.x);
    expect(slotY(node('s1'), 'A')).toBeLessThan(slotY(node('s1'), 'B'));
  });

  it('hides groups when asked and places the 3rd-place match under the final', () => {
    const tp = m({
      id: 'tp',
      stage: 'THIRD_PLACE',
      round: 2,
      slot: 1,
      sourceA: { type: 'LOSER_OF', ref: 's1' },
      sourceB: { type: 'LOSER_OF', ref: 's2' },
    });
    const layout = layoutTree(buildTournamentTree(groups, [...semisAndFinal, tp]), {
      showGroups: false,
    });
    expect(layout.groups).toEqual([]);
    expect(layout.connectors.some((c) => c.from.startsWith('group:'))).toBe(false);
    const f = layout.nodes.find((n) => n.matchId === 'f')!;
    const third = layout.nodes.find((n) => n.matchId === 'tp')!;
    expect(third.x).toBe(f.x);
    expect(third.y).toBeGreaterThan(f.y + f.h);
    expect(layout.height).toBeGreaterThanOrEqual(third.y + third.h);
  });

  it('handles groups with no knockout yet and skips byes and unknown sources', () => {
    expect(layoutTree(buildTournamentTree(groups, []), { showGroups: true })).toMatchObject({
      nodes: [],
      connectors: [],
      champion: null,
    });
    const bye = m({ id: 'b', isBye: true, sourceA: { type: 'GROUP_POS', ref: 'gA:1' } });
    const ghost = m({
      id: 'g',
      slot: 1,
      sourceA: { type: 'GROUP_POS', ref: 'gZ:1' },
      sourceB: { type: 'WINNER_OF', ref: 'nope' },
    });
    const layout = layoutTree(buildTournamentTree(groups, [bye, ghost]), { showGroups: true });
    expect(layout.connectors).toEqual([]);
  });
});
