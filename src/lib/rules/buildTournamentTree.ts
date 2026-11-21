import type { MatchSource } from '../schemas/domain';
import type { MatchStage, MatchStatus } from '../schemas/enums';
import type { StandingRow } from './computeStandings';
import { roundName, THIRD_PLACE_NAME } from './knockout';

/**
 * Owner: Lane C (C1, C4). PLAN §7.10a Tree mode. The List and Tree views come from the SAME
 * `matches` rows; this pure function only reshapes them.
 */

export interface TreeInputGroup {
  groupId: string;
  name: string;
  teamIds: string[];
  standings: StandingRow[];
  advancePerGroup: number;
}

export interface TreeInputMatch {
  id: string;
  matchNumber: number | null;
  stage: MatchStage;
  groupId: string | null;
  round: number | null;
  slot: number | null;
  teamAId: string | null;
  teamBId: string | null;
  sourceA: MatchSource | null;
  sourceB: MatchSource | null;
  winnerTeamId: string | null;
  nextMatchId: string | null;
  isBye: boolean;
  status: MatchStatus;
  /** Games won per side, for the score badge. */
  score: { a: number; b: number } | null;
}

export interface TreeNode {
  matchId: string;
  matchNumber: number | null;
  roundName: string;
  /** Display labels for undecided slots, e.g. "Group A #1", "Winner of M9". */
  labelA: string | null;
  labelB: string | null;
  match: TreeInputMatch;
}

export interface TournamentTree {
  groups: (TreeInputGroup & { qualifyingTeamIds: string[] })[];
  /** Knockout rounds left to right, each top to bottom. */
  rounds: { round: number; name: string; nodes: TreeNode[] }[];
  thirdPlace: TreeNode | null;
  championTeamId: string | null;
}

/** Shown in an empty bye slot. */
export const BYE_LABEL = 'BYE';
export const TBD_LABEL = 'TBD';

/**
 * Placeholder text for an undecided slot (§4.6): "Group A #1", "Winner of M9", "Loser of M10".
 * Falls back to "TBD" when the source points at something unknown (or has no number yet).
 */
export function sourceLabel(
  source: MatchSource | null,
  groupNameById: ReadonlyMap<string, string>,
  matchNumberById: ReadonlyMap<string, number | null>,
): string {
  if (!source) return TBD_LABEL;
  if (source.type === 'GROUP_POS') {
    const [groupId, pos] = source.ref.split(':');
    const name = groupNameById.get(groupId!);
    return name ? `Group ${name} #${pos}` : TBD_LABEL;
  }
  const n = matchNumberById.get(source.ref);
  if (n == null) return TBD_LABEL;
  return `${source.type === 'WINNER_OF' ? 'Winner' : 'Loser'} of M${n}`;
}

/**
 * Groups keep their order; `qualifyingTeamIds` are the teams currently in the qualifying places
 * (the top `advancePerGroup` rows). Knockout matches are grouped by round and sorted by slot; the
 * final is the last round. The champion is the final's winner once it is DONE.
 */
export function buildTournamentTree(
  groups: TreeInputGroup[],
  matches: TreeInputMatch[],
): TournamentTree {
  const groupNameById = new Map(groups.map((g) => [g.groupId, g.name]));
  const matchNumberById = new Map(matches.map((m) => [m.id, m.matchNumber]));

  const toNode = (m: TreeInputMatch, name: string): TreeNode => ({
    matchId: m.id,
    matchNumber: m.matchNumber,
    roundName: name,
    labelA: m.teamAId ? null : sourceLabel(m.sourceA, groupNameById, matchNumberById),
    labelB: m.teamBId
      ? null
      : m.isBye
        ? BYE_LABEL
        : sourceLabel(m.sourceB, groupNameById, matchNumberById),
    match: m,
  });

  const knockout = matches
    .filter((m) => m.stage === 'KNOCKOUT')
    .map((m) => ({ m, round: m.round ?? 1, slot: m.slot ?? 0 }))
    .sort((a, b) => a.slot - b.slot);
  const totalRounds = Math.max(0, ...knockout.map((k) => k.round));
  const rounds: TournamentTree['rounds'] = [];
  for (let round = 1; round <= totalRounds; round++) {
    const name = roundName(totalRounds - round + 1, totalRounds);
    const nodes = knockout.filter((k) => k.round === round).map((k) => toNode(k.m, name));
    rounds.push({ round, name, nodes });
  }

  const third = matches.find((m) => m.stage === 'THIRD_PLACE');
  // The last round is the highest round present, so it always has a node.
  const final = rounds.length > 0 ? rounds[rounds.length - 1]!.nodes[0]!.match : null;

  return {
    groups: groups.map((g) => ({
      ...g,
      qualifyingTeamIds: g.standings.slice(0, g.advancePerGroup).map((r) => r.teamId),
    })),
    rounds,
    thirdPlace: third ? toNode(third, THIRD_PLACE_NAME) : null,
    championTeamId: final?.status === 'DONE' ? final.winnerTeamId : null,
  };
}
