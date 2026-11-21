import type { TournamentSettings } from '../schemas/settings';
import { NotImplementedError } from './not-implemented';

/** Owner: Lane B (B1, B7). PLAN §3.4. */

export interface AllocationSoldier {
  playerId: string;
  basePrice: number;
}

export interface AllocationTeam {
  teamId: string;
  /** 1 (captain) + soldiers already in the squad. */
  squadSize: number;
  purseRemaining: number;
  /** Team order: the final, deterministic tie-break. */
  sortOrder: number;
}

export interface AllocationStep {
  step: number;
  playerId: string;
  teamId: string;
  /** Shown in the animated reveal, e.g. "Fewest players: 3". */
  reason: string;
}

export interface AllocationResult {
  steps: AllocationStep[];
  /** Soldiers that could not be placed because every squad is full. */
  unplaced: string[];
}

/**
 * Leftovers sorted by base price DESC; each goes (price 0, AUTO_ALLOCATED) to the eligible team
 * (squadSize < max) with the fewest players, then the lowest MP left, then team order.
 * Pure and deterministic.
 */
export function allocateLeftovers(
  soldiers: AllocationSoldier[],
  teams: AllocationTeam[],
  settings: Pick<TournamentSettings, 'maxPlayersPerTeam'>,
): AllocationResult {
  void soldiers;
  void teams;
  void settings;
  throw new NotImplementedError('allocateLeftovers', 'Lane B');
}
