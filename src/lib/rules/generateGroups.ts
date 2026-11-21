import { planFormat, type FormatSettings } from './planFormat';

/** Owner: Lane C (C1, C2). PLAN §4.2. */

export interface DrawTeam {
  teamId: string;
  /** Ranking value for the seeding pots, by default total MP spent in the auction. */
  seedValue: number;
  /** Team order, used to break seedValue ties deterministically. */
  sortOrder: number;
}

export interface GroupDraft {
  /** 'A', 'B', … */
  name: string;
  teams: { teamId: string; pot: number }[];
}

/** 'A', 'B', … 'Z' for group indexes 0–25. */
export const groupName = (index: number): string => String.fromCharCode(65 + index);

/** Teams ranked best first: higher seedValue, then lower sortOrder. */
export function rankForPots(teams: readonly DrawTeam[]): DrawTeam[] {
  return [...teams].sort((a, b) => b.seedValue - a.seedValue || a.sortOrder - b.sortOrder);
}

/**
 * Split ranked teams into pots of size `groupCount` (pot 1 = the best). The last pot may be short.
 */
export function makePots(teams: readonly DrawTeam[], groupCount: number): DrawTeam[][] {
  const ranked = rankForPots(teams);
  const pots: DrawTeam[][] = [];
  for (let i = 0; i < ranked.length; i += groupCount) pots.push(ranked.slice(i, i + groupCount));
  return pots;
}

/** Fisher–Yates with an injectable `random` ([0, 1)). */
export function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * Rank teams, split them into pots of size `groupCount`, and draw one team per pot into each
 * group. Group sizes differ by at most 1. `random` ([0, 1)) is injectable for tests and replays.
 *
 * The group count comes from `planFormat` (the same effective value the preview shows). Each pot
 * is shuffled and dealt to groups A, B, C…; a short last pot fills the first groups, which matches
 * `balancedGroupSizes` (larger groups first). 2 teams → no groups (straight to the final) → [].
 */
export function generateGroups(
  teams: DrawTeam[],
  settings: FormatSettings,
  random: () => number,
): GroupDraft[] {
  const plan = planFormat(teams.length, settings);
  if (plan.groupCount === 0) return [];
  const drafts: GroupDraft[] = Array.from({ length: plan.groupCount }, (_, i) => ({
    name: groupName(i),
    teams: [],
  }));
  makePots(teams, plan.groupCount).forEach((pot, potIndex) => {
    shuffle(pot, random).forEach((team, i) => {
      drafts[i]!.teams.push({ teamId: team.teamId, pot: potIndex + 1 });
    });
  });
  return drafts;
}
