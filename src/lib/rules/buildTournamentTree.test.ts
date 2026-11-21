import type { StandingRow } from './computeStandings';
import {
  BYE_LABEL,
  buildTournamentTree,
  sourceLabel,
  TBD_LABEL,
  type TreeInputGroup,
  type TreeInputMatch,
} from './buildTournamentTree';

const standing = (teamId: string, position: number): StandingRow => ({
  teamId,
  position,
  played: 3,
  won: 3 - position,
  lost: position,
  gamesWon: 0,
  gamesLost: 0,
  gameDiff: 0,
  killsFor: 0,
  killsAgainst: 0,
  killDiff: 0,
  points: 0,
  form: [],
  needsDraw: false,
});

const groups: TreeInputGroup[] = [
  {
    groupId: 'gA',
    name: 'A',
    teamIds: ['a1', 'a2', 'a3'],
    standings: ['a1', 'a2', 'a3'].map(standing),
    advancePerGroup: 2,
  },
  { groupId: 'gB', name: 'B', teamIds: ['b1', 'b2', 'b3'], standings: [], advancePerGroup: 2 },
];

function match(over: Partial<TreeInputMatch> & { id: string }): TreeInputMatch {
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

describe('sourceLabel', () => {
  const names = new Map([['gA', 'A']]);
  const nums = new Map<string, number | null>([
    ['m9', 9],
    ['bye', null],
  ]);
  it('labels every source type', () => {
    expect(sourceLabel({ type: 'GROUP_POS', ref: 'gA:1' }, names, nums)).toBe('Group A #1');
    expect(sourceLabel({ type: 'WINNER_OF', ref: 'm9' }, names, nums)).toBe('Winner of M9');
    expect(sourceLabel({ type: 'LOSER_OF', ref: 'm9' }, names, nums)).toBe('Loser of M9');
  });
  it('falls back to TBD', () => {
    expect(sourceLabel(null, names, nums)).toBe(TBD_LABEL);
    expect(sourceLabel({ type: 'GROUP_POS', ref: 'gZ:1' }, names, nums)).toBe(TBD_LABEL);
    expect(sourceLabel({ type: 'WINNER_OF', ref: 'bye' }, names, nums)).toBe(TBD_LABEL);
    expect(sourceLabel({ type: 'WINNER_OF', ref: 'unknown' }, names, nums)).toBe(TBD_LABEL);
  });
});

describe('buildTournamentTree', () => {
  const matches: TreeInputMatch[] = [
    match({ id: 'g1', stage: 'GROUP', groupId: 'gA', round: null, slot: null, matchNumber: 1 }),
    match({
      id: 'f',
      round: 2,
      slot: 0,
      matchNumber: 4,
      sourceA: { type: 'WINNER_OF', ref: 's1' },
      sourceB: { type: 'WINNER_OF', ref: 's2' },
    }),
    match({
      id: 's2',
      round: 1,
      slot: 1,
      matchNumber: 3,
      sourceA: { type: 'GROUP_POS', ref: 'gB:1' },
      sourceB: { type: 'GROUP_POS', ref: 'gA:2' },
    }),
    match({
      id: 's1',
      round: 1,
      slot: 0,
      matchNumber: 2,
      teamAId: 'a1',
      teamBId: 'b2',
      status: 'DONE',
      winnerTeamId: 'a1',
      score: { a: 2, b: 1 },
    }),
    match({
      id: 'tp',
      stage: 'THIRD_PLACE',
      round: 2,
      slot: 1,
      matchNumber: 5,
      sourceA: { type: 'LOSER_OF', ref: 's1' },
      sourceB: { type: 'LOSER_OF', ref: 's2' },
    }),
  ];

  it('marks the qualifying places in each group', () => {
    const tree = buildTournamentTree(groups, matches);
    expect(tree.groups.map((g) => g.qualifyingTeamIds)).toEqual([['a1', 'a2'], []]);
  });

  it('lays out knockout rounds left to right, top to bottom, with placeholder labels', () => {
    const tree = buildTournamentTree(groups, matches);
    expect(tree.rounds.map((r) => [r.round, r.name, r.nodes.map((n) => n.matchId)])).toEqual([
      [1, 'Semi-final', ['s1', 's2']],
      [2, 'Final', ['f']],
    ]);
    const [s1, s2] = tree.rounds[0]!.nodes;
    expect([s1!.labelA, s1!.labelB]).toEqual([null, null]);
    expect([s2!.labelA, s2!.labelB]).toEqual(['Group B #1', 'Group A #2']);
    expect(tree.rounds[1]!.nodes[0]).toMatchObject({
      matchNumber: 4,
      roundName: 'Final',
      labelA: 'Winner of M2',
      labelB: 'Winner of M3',
    });
    expect(tree.thirdPlace).toMatchObject({
      matchId: 'tp',
      roundName: '3rd place',
      labelA: 'Loser of M2',
    });
    expect(tree.championTeamId).toBeNull();
  });

  it('names the champion once the final is done', () => {
    const done = matches.map((m) =>
      m.id === 'f'
        ? { ...m, teamAId: 'a1', teamBId: 'b1', status: 'DONE' as const, winnerTeamId: 'b1' }
        : m,
    );
    expect(buildTournamentTree(groups, done).championTeamId).toBe('b1');
  });

  it('shows BYE in an empty bye slot', () => {
    const tree = buildTournamentTree(
      [],
      [match({ id: 'b', isBye: true, teamAId: 'x', sourceA: { type: 'GROUP_POS', ref: 'g:1' } })],
    );
    expect(tree.rounds[0]!.nodes[0]).toMatchObject({ labelA: null, labelB: BYE_LABEL });
    expect(tree.thirdPlace).toBeNull();
  });

  it('copes with no knockout, missing rounds and missing slots', () => {
    expect(buildTournamentTree(groups, []).rounds).toEqual([]);
    expect(buildTournamentTree(groups, []).championTeamId).toBeNull();
    const odd = buildTournamentTree(
      [],
      [
        match({ id: 'x', round: null, slot: null }),
        match({ id: 'y', round: null, slot: 1 }),
        match({ id: 'z', round: 3, slot: 0 }),
      ],
    );
    expect(odd.rounds.map((r) => r.nodes.map((n) => n.matchId))).toEqual([['x', 'y'], [], ['z']]);
    expect(odd.rounds.map((r) => r.name)).toEqual(['Quarter-final', 'Semi-final', 'Final']);
  });
});
