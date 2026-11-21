import type { MatchSource } from '../schemas/domain';
import type { MatchStage, MatchStatus } from '../schemas/enums';
import type { StandingRow } from './computeStandings';
import { NotImplementedError } from './not-implemented';

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

export function buildTournamentTree(
  groups: TreeInputGroup[],
  matches: TreeInputMatch[],
): TournamentTree {
  void groups;
  void matches;
  throw new NotImplementedError('buildTournamentTree', 'Lane C');
}
