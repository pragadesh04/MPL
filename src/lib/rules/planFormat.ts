import type { TournamentSettings } from '../schemas/settings';
import { knockoutShape, roundName } from './knockout';

/**
 * Owner: Lane C (C1). PLAN §4.1 live format preview and small-tournament cases.
 * Lane A's Rules step shows this preview, so its signature is a cross-lane contract.
 *
 * Every other format rule (`generateGroups`, the group-draw service) reads the EFFECTIVE values
 * from this plan, so the preview and the real draw can never disagree:
 * - `groupCount`: `settings.groupCount ?? ceil(teams / 4)`, clamped so every group has ≥ 3 teams
 *   (3–5 teams always play one group).
 * - advance per group (`qualified / groupCount`): clamped to the smallest group, and at least 2
 *   when there is one group (a one-team "knockout" would have no final).
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

/** Minimum teams per group (PLAN §4.1). */
export const MIN_GROUP_SIZE = 3;

/** Balanced group sizes, larger groups first: 10 teams in 3 groups → [4, 3, 3]. */
export function balancedGroupSizes(teamCount: number, groupCount: number): number[] {
  const base = Math.floor(teamCount / groupCount);
  const extra = teamCount % groupCount;
  return Array.from({ length: groupCount }, (_, i) => base + (i < extra ? 1 : 0));
}

/** Effective teams that advance from each group (see the module comment). */
export function advancePerGroupOf(plan: FormatPlan): number {
  return plan.groupCount === 0 ? 0 : plan.qualified / plan.groupCount;
}

/** "semi-finals", "quarter-finals", "round of 16", "final". */
function roundPhrase(name: string): string {
  const lower = name.toLowerCase();
  return lower.endsWith('-final') ? `${lower}s` : lower;
}

export function planFormat(teamCount: number, settings: FormatSettings): FormatPlan {
  if (teamCount < 3) {
    const playable = teamCount === 2;
    return {
      teamCount,
      kind: 'FINAL_ONLY',
      groupCount: 0,
      groupSizes: [],
      groupMatches: 0,
      qualified: playable ? 2 : 0,
      knockoutRounds: playable ? ['Final'] : [],
      knockoutMatches: playable ? 1 : 0,
      totalMatches: playable ? 1 : 0,
      summary: playable
        ? '2 teams → straight to the final. Total: 1 match.'
        : 'Add at least 2 captains to see the format.',
    };
  }

  const maxGroups = Math.floor(teamCount / MIN_GROUP_SIZE);
  const wanted = teamCount <= 5 ? 1 : (settings.groupCount ?? Math.ceil(teamCount / 4));
  const groupCount = Math.max(1, Math.min(wanted, maxGroups));
  const groupSizes = balancedGroupSizes(teamCount, groupCount);
  const smallest = groupSizes[groupSizes.length - 1]!;
  const advance = Math.max(groupCount === 1 ? 2 : 1, Math.min(settings.advancePerGroup, smallest));
  const qualified = groupCount * advance;

  const legs = settings.roundRobinLegs;
  const groupMatches = groupSizes.reduce((sum, n) => sum + ((n * (n - 1)) / 2) * legs, 0);

  const shape = knockoutShape(qualified);
  const knockoutRounds = Array.from({ length: shape.rounds }, (_, i) =>
    roundName(shape.rounds - i, shape.rounds),
  );
  const thirdPlace = settings.thirdPlaceMatch && shape.semisArePlayable;
  const knockoutMatches = qualified - 1 + (thirdPlace ? 1 : 0);
  const totalMatches = groupMatches + knockoutMatches;

  const equalSizes = groupSizes.every((n) => n === groupSizes[0]);
  const groupsPart =
    groupCount === 1
      ? `1 group of ${teamCount}`
      : equalSizes
        ? `${groupCount} groups of ${groupSizes[0]}`
        : `${groupCount} groups (${groupSizes.join(', ')})`;
  const legsPart = legs === 2 ? ' (home and away)' : '';
  const topPart = groupCount === 1 ? `top ${advance}` : `top ${advance} per group`;
  // With groups there are always ≥ 3 group matches and ≥ 1 knockout match, so plurals are safe.
  const summary =
    [
      `${teamCount} teams`,
      groupsPart,
      `${groupMatches} group matches${legsPart}`,
      topPart,
      ...knockoutRounds.map(roundPhrase),
      ...(thirdPlace ? ['3rd-place match'] : []),
    ].join(' → ') + `. Total: ${totalMatches} matches.`;

  return {
    teamCount,
    kind: groupCount === 1 ? 'SINGLE_GROUP' : 'GROUPS',
    groupCount,
    groupSizes,
    groupMatches,
    qualified,
    knockoutRounds,
    knockoutMatches,
    totalMatches,
    summary,
  };
}
