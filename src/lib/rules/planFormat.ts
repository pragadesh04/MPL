import type { TournamentSettings } from '../schemas/settings';
import { NotImplementedError } from './not-implemented';

/**
 * Owner: Lane C (C1). PLAN §4.1 live format preview and small-tournament cases.
 * Lane A's Rules step shows this preview, so its signature is a cross-lane contract.
 */

export type FormatSettings = Pick<
  TournamentSettings,
  'groupCount' | 'advancePerGroup' | 'roundRobinLegs' | 'thirdPlaceMatch'
>;

export interface FormatPlan {
  teamCount: number;
  /** 2 teams → FINAL_ONLY; 3–5 → SINGLE_GROUP; otherwise GROUPS. */
  kind: 'FINAL_ONLY' | 'SINGLE_GROUP' | 'GROUPS';
  groupCount: number;
  /** Balanced sizes (differ by at most 1), e.g. 10 teams → [4, 3, 3]. */
  groupSizes: number[];
  groupMatches: number;
  qualified: number;
  /** Knockout round names in play order, e.g. ['Semi-final', 'Final']. */
  knockoutRounds: string[];
  /** Playable knockout matches (byes excluded, 3rd-place match included). */
  knockoutMatches: number;
  totalMatches: number;
  /** One-line summary, e.g. "8 teams → 2 groups of 4 → 12 group matches → top 2 per group → semi-finals → final. Total: 15 matches." */
  summary: string;
}

export function planFormat(teamCount: number, settings: FormatSettings): FormatPlan {
  void teamCount;
  void settings;
  throw new NotImplementedError('planFormat', 'Lane C');
}
