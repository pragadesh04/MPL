import { filterMatches, moveWithinBlock, sections } from './filters';
import type { MatchView, TeamView } from './types';

function match(over: Partial<MatchView> & { id: string }): MatchView {
  return {
    matchNumber: 1,
    stage: 'GROUP',
    groupId: 'gA',
    groupName: 'A',
    matchday: 1,
    round: null,
    slot: null,
    stageLabel: 'Group A · Matchday 1',
    teamAId: 't1',
    teamBId: 't2',
    sourceA: null,
    sourceB: null,
    labelA: null,
    labelB: null,
    bestOf: 1,
    winnerTeamId: null,
    nextMatchId: null,
    nextSlot: null,
    isBye: false,
    status: 'SCHEDULED',
    scheduledAt: null,
    games: [],
    playerStats: [],
    score: null,
    ...over,
  };
}

const team = (id: string, name: string, shortName: string): TeamView => ({
  id,
  name,
  shortName,
  color: '#e53935',
  emoji: null,
  logoUrl: null,
  motto: null,
  captainName: 'Cap',
  spent: 0,
  purseTotal: 50,
  purseRemaining: 50,
  sortOrder: 0,
});
const teams = new Map([
  ['t1', team('t1', 'Red Rhinos', 'RHN')],
  ['t2', team('t2', 'Blue Hawks', 'HWK')],
  ['t3', team('t3', 'Green Vipers', 'VIP')],
]);

const ms: MatchView[] = [
  match({ id: 'm1', matchNumber: 1, status: 'DONE' }),
  match({ id: 'm2', matchNumber: 2, teamAId: 't3', teamBId: 't2', groupId: 'gB', groupName: 'B' }),
  match({ id: 'm3', matchNumber: 3, teamAId: 't1', teamBId: 't3' }),
  match({
    id: 's1',
    matchNumber: 4,
    stage: 'KNOCKOUT',
    groupId: null,
    stageLabel: 'Semi-final',
    round: 1,
    teamAId: null,
    teamBId: null,
  }),
  match({
    id: 'bye',
    matchNumber: null,
    stage: 'KNOCKOUT',
    groupId: null,
    stageLabel: 'Semi-final',
    isBye: true,
  }),
  match({
    id: 'f',
    matchNumber: 5,
    stage: 'KNOCKOUT',
    groupId: null,
    stageLabel: 'Final',
    round: 2,
    teamAId: null,
    teamBId: null,
  }),
];
const ids = (list: MatchView[]): string[] => list.map((m) => m.id);

describe('filterMatches', () => {
  it('hides byes unless asked', () => {
    expect(ids(filterMatches(ms, {}, teams))).toEqual(['m1', 'm2', 'm3', 's1', 'f']);
    expect(filterMatches(ms, { includeByes: true }, teams)).toHaveLength(6);
  });

  it('filters by team, stage, group, status and search', () => {
    expect(ids(filterMatches(ms, { teamId: 't3' }, teams))).toEqual(['m2', 'm3']);
    expect(ids(filterMatches(ms, { stage: 'KNOCKOUT' }, teams))).toEqual(['s1', 'f']);
    expect(ids(filterMatches(ms, { groupId: 'gB' }, teams))).toEqual(['m2']);
    expect(ids(filterMatches(ms, { status: 'DONE' }, teams))).toEqual(['m1']);
    expect(ids(filterMatches(ms, { search: 'hwk' }, teams))).toEqual(['m1', 'm2']);
    expect(ids(filterMatches(ms, { search: ' vipers ' }, teams))).toEqual(['m2', 'm3']);
    expect(ids(filterMatches(ms, { search: 'zzz' }, teams))).toEqual([]);
  });
});

describe('sections', () => {
  it('groups consecutive matches by stage label', () => {
    expect(sections(filterMatches(ms, {}, teams)).map((s) => [s.label, ids(s.matches)])).toEqual([
      ['Group stage', ['m1', 'm2', 'm3']],
      ['Semi-final', ['s1']],
      ['Final', ['f']],
    ]);
  });
});

describe('moveWithinBlock', () => {
  it('moves an unplayed match to another unplayed match’s place in the same block', () => {
    expect(moveWithinBlock(ms, 'm3', 'm2')).toEqual(['m3', 'm2']);
    expect(moveWithinBlock(ms, 'f', 's1')).toEqual(['f', 's1']);
  });

  it('refuses played matches, other blocks, unknown ids and no-op moves', () => {
    expect(moveWithinBlock(ms, 'm1', 'm2')).toBeNull();
    expect(moveWithinBlock(ms, 'm2', 's1')).toBeNull();
    expect(moveWithinBlock(ms, 'nope', 'm2')).toBeNull();
    expect(moveWithinBlock(ms, 'm2', 'm2')).toBeNull();
  });
});
