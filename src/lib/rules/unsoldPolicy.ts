import type { TournamentSettings } from '../schemas/settings';
import type { AllocationTeam } from './allocateLeftovers';

/** Owner: Lane B (B1). PLAN §3.1 unsoldPolicy, §3.3. */

/** What happens to a lot that closes with no bid. */
export type UnsoldLotOutcome =
  | { type: 'UNSOLD_LIST'; reason: 'NO_BIDS' | 'NO_SPACE' }
  | { type: 'RANDOM_SQUAD'; teamId: string };

/**
 * - Every squad full → the soldier stays unsold with the reason "No space" (any policy).
 * - `RANDOM_SQUAD` → straight to a random squad with space (teams in team order, then
 *   `random()` picks one, so tests are deterministic).
 * - `REAUCTION_THEN_ALLOCATE` / `ADMIN_DECIDES` → the unsold list.
 */
export function resolveUnsoldLot(input: {
  settings: Pick<TournamentSettings, 'unsoldPolicy' | 'maxPlayersPerTeam'>;
  teams: AllocationTeam[];
  /** [0, 1) source, injectable for tests. */
  random: () => number;
}): UnsoldLotOutcome {
  const eligible = input.teams
    .filter((t) => t.squadSize < input.settings.maxPlayersPerTeam)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  if (eligible.length === 0) return { type: 'UNSOLD_LIST', reason: 'NO_SPACE' };
  if (input.settings.unsoldPolicy !== 'RANDOM_SQUAD') {
    return { type: 'UNSOLD_LIST', reason: 'NO_BIDS' };
  }
  // Clamp: a source that returns 1 (outside its contract) must not index past the end.
  const index = Math.min(eligible.length - 1, Math.floor(input.random() * eligible.length));
  return { type: 'RANDOM_SQUAD', teamId: eligible[index]!.teamId };
}

/** What happens when the waiting pool is empty at the end of a round. */
export type RoundEndAction =
  | { type: 'REAUCTION_ROUND'; round: number }
  | { type: 'ALLOCATE' }
  | { type: 'WAIT_FOR_ADMIN' }
  | { type: 'COMPLETE' };

/**
 * - Nobody unsold → `COMPLETE` (the auction is over; allocation has nothing to place).
 * - `REAUCTION_THEN_ALLOCATE` → re-auction rounds 2 … 1 + `unsoldReauctionRounds`, then
 *   `ALLOCATE` (leftover allocation, §3.4).
 * - `RANDOM_SQUAD` / `ADMIN_DECIDES` → `WAIT_FOR_ADMIN`: the soldiers stay on the unsold list
 *   until an organiser uses Auction again (+ Start new round) or Assign.
 */
export function afterRoundEnds(input: {
  settings: Pick<TournamentSettings, 'unsoldPolicy' | 'unsoldReauctionRounds'>;
  /** The round that just ended (1 = the main round). */
  round: number;
  unsoldCount: number;
}): RoundEndAction {
  if (input.unsoldCount === 0) return { type: 'COMPLETE' };
  if (input.settings.unsoldPolicy !== 'REAUCTION_THEN_ALLOCATE') {
    return { type: 'WAIT_FOR_ADMIN' };
  }
  if (input.round < 1 + input.settings.unsoldReauctionRounds) {
    return { type: 'REAUCTION_ROUND', round: input.round + 1 };
  }
  return { type: 'ALLOCATE' };
}
