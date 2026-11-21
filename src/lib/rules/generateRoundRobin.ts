import { NotImplementedError } from './not-implemented';

/** Owner: Lane C (C1). PLAN §4.3 — circle method, matchdays, rest day for odd groups. */

export interface Fixture {
  teamAId: string;
  teamBId: string;
}

export interface Matchday {
  /** 1-based. */
  matchday: number;
  fixtures: Fixture[];
  /** The team resting this matchday in an odd-sized group, else null. */
  restingTeamId: string | null;
}

/** No team plays twice in a matchday. `legs = 2` adds the return fixtures (home and away). */
export function generateRoundRobin(teamIds: string[], legs: 1 | 2): Matchday[] {
  void teamIds;
  void legs;
  throw new NotImplementedError('generateRoundRobin', 'Lane C');
}
