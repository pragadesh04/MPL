import type { MatchSource } from '../schemas/domain';
import type { TournamentSettings } from '../schemas/settings';
import type { StandingRow } from './computeStandings';
import { NotImplementedError } from './not-implemented';

/** Owner: Lane C (C1, C3). PLAN §4.4. */

export interface KnockoutSeed {
  /** 1 = best. */
  seed: number;
  /** Known once the group is finished; null while it's still a placeholder. */
  teamId: string | null;
  /** Always set: where the seed comes from, e.g. { type: 'GROUP_POS', ref: '<groupId>:1' }. */
  source: MatchSource;
  groupId: string | null;
}

export interface SeedGroup {
  groupId: string;
  name: string;
  /** Final standings; empty while the group is still being played (placeholders only). */
  standings: StandingRow[];
}

/**
 * Qualified = groupCount × advancePerGroup; group winners get byes first; winners face runners-up
 * from another group (A1 v B2, B1 v A2); teams from the same group go into opposite halves.
 */
export function seedKnockout(
  groups: SeedGroup[],
  settings: Pick<TournamentSettings, 'advancePerGroup'>,
): KnockoutSeed[] {
  void groups;
  void settings;
  throw new NotImplementedError('seedKnockout', 'Lane C');
}

export interface BracketSlot {
  teamId: string | null;
  /** Placeholder until decided: GROUP_POS for round 1, WINNER_OF / LOSER_OF (ref = match key) later. */
  source: MatchSource | null;
}

export interface BracketMatch {
  /** Local key, e.g. 'R1-0'; the service maps keys to match ids (and refs in sources). */
  key: string;
  stage: 'KNOCKOUT' | 'THIRD_PLACE';
  /** 1 = first round. */
  round: number;
  /** Top to bottom within the round, 0-based. */
  slot: number;
  roundName: string;
  bestOf: number;
  teamA: BracketSlot;
  teamB: BracketSlot;
  isBye: boolean;
  nextKey: string | null;
  nextSlot: 'A' | 'B' | null;
}

/** size = nextPowerOfTwo(seeds), byes = size − seeds; bye matches resolve at once. */
export function generateBracket(
  seeds: KnockoutSeed[],
  settings: Pick<TournamentSettings, 'thirdPlaceMatch' | 'knockoutBestOf' | 'finalBestOf'>,
): BracketMatch[] {
  void seeds;
  void settings;
  throw new NotImplementedError('generateBracket', 'Lane C');
}

/** `Final`, `Semi-final`, `Quarter-final`, `Round of 16`, then `Round N` (1 = the final). */
export function roundName(roundsFromFinal: number, totalRounds: number): string {
  void roundsFromFinal;
  void totalRounds;
  throw new NotImplementedError('roundName', 'Lane C');
}
