import type { TournamentSettings } from '../schemas/settings';
import type { AllocationTeam } from './allocateLeftovers';
import { NotImplementedError } from './not-implemented';

/** Owner: Lane B (B1). PLAN §3.1 unsoldPolicy, §3.3. */

/** What happens to a lot that closes with no bid. */
export type UnsoldLotOutcome =
  | { type: 'UNSOLD_LIST'; reason: 'NO_BIDS' | 'NO_SPACE' }
  | { type: 'RANDOM_SQUAD'; teamId: string };

export function resolveUnsoldLot(input: {
  settings: Pick<TournamentSettings, 'unsoldPolicy' | 'maxPlayersPerTeam'>;
  teams: AllocationTeam[];
  /** [0, 1) source, injectable for tests. */
  random: () => number;
}): UnsoldLotOutcome {
  void input;
  throw new NotImplementedError('resolveUnsoldLot', 'Lane B');
}

/** What happens when the waiting pool is empty at the end of a round. */
export type RoundEndAction =
  | { type: 'REAUCTION_ROUND'; round: number }
  | { type: 'ALLOCATE' }
  | { type: 'WAIT_FOR_ADMIN' }
  | { type: 'COMPLETE' };

export function afterRoundEnds(input: {
  settings: Pick<TournamentSettings, 'unsoldPolicy' | 'unsoldReauctionRounds'>;
  /** The round that just ended (1 = the main round). */
  round: number;
  unsoldCount: number;
}): RoundEndAction {
  void input;
  throw new NotImplementedError('afterRoundEnds', 'Lane B');
}
