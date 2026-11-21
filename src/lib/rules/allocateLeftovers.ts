import type { TournamentSettings } from '../schemas/settings';

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

/** Lower is better: fewest players, then lowest MP left, then team order. */
function compareTeams(a: AllocationTeam, b: AllocationTeam): number {
  return (
    a.squadSize - b.squadSize || a.purseRemaining - b.purseRemaining || a.sortOrder - b.sortOrder
  );
}

/** Explain which tie-break decided the pick, e.g. "Fewest players: 3 · lowest MP left: 0". */
function reasonFor(winner: AllocationTeam, eligible: AllocationTeam[]): string {
  const fewest = `Fewest players: ${winner.squadSize}`;
  const sameSize = eligible.filter((t) => t.squadSize === winner.squadSize);
  if (sameSize.length === 1) return fewest;
  const lowestMp = `${fewest} · lowest MP left: ${winner.purseRemaining}`;
  const samePurse = sameSize.filter((t) => t.purseRemaining === winner.purseRemaining);
  if (samePurse.length === 1) return lowestMp;
  return `${lowestMp} · team order`;
}

/**
 * Leftovers sorted by base price DESC; each goes (price 0, AUTO_ALLOCATED) to the eligible team
 * (squadSize < max) with the fewest players, then the lowest MP left, then team order.
 * Pure and deterministic: equal base prices keep their input order.
 */
export function allocateLeftovers(
  soldiers: AllocationSoldier[],
  teams: AllocationTeam[],
  settings: Pick<TournamentSettings, 'maxPlayersPerTeam'>,
): AllocationResult {
  const squads = teams.map((t) => ({ ...t }));
  const ordered = [...soldiers].sort((a, b) => b.basePrice - a.basePrice);
  const steps: AllocationStep[] = [];
  const unplaced: string[] = [];

  for (const soldier of ordered) {
    const eligible = squads.filter((t) => t.squadSize < settings.maxPlayersPerTeam);
    const [winner] = [...eligible].sort(compareTeams);
    if (!winner) {
      unplaced.push(soldier.playerId);
      continue;
    }
    steps.push({
      step: steps.length + 1,
      playerId: soldier.playerId,
      teamId: winner.teamId,
      reason: reasonFor(winner, eligible),
    });
    winner.squadSize += 1;
  }
  return { steps, unplaced };
}
