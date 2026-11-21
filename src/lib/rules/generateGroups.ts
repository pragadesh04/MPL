import type { FormatSettings } from './planFormat';
import { NotImplementedError } from './not-implemented';

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

/**
 * Rank teams, split them into pots of size `groupCount`, and draw one team per pot into each
 * group. Group sizes differ by at most 1. `random` ([0, 1)) is injectable for tests and replays.
 */
export function generateGroups(
  teams: DrawTeam[],
  settings: FormatSettings,
  random: () => number,
): GroupDraft[] {
  void teams;
  void settings;
  void random;
  throw new NotImplementedError('generateGroups', 'Lane C');
}
