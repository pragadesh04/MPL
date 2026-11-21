import type { MatchStatus } from '../schemas/enums';
import { NotImplementedError } from './not-implemented';

/**
 * Owner: Lane C (C1). PLAN §4.3. Standings are ALWAYS computed from match results, never stored.
 */

export interface StandingMatch {
  matchId: string;
  teamAId: string;
  teamBId: string;
  status: MatchStatus;
  winnerTeamId: string | null;
  games: { killsA: number; killsB: number }[];
}

export interface StandingRow {
  teamId: string;
  /** 1-based. */
  position: number;
  played: number;
  won: number;
  lost: number;
  gamesWon: number;
  gamesLost: number;
  gameDiff: number;
  killsFor: number;
  killsAgainst: number;
  killDiff: number;
  points: number;
  /** Last 3 results, oldest first. */
  form: ('W' | 'L')[];
  /** True when every tie-break up to the organiser draw is still level with a neighbour. */
  needsDraw: boolean;
}

/**
 * Only DONE matches count. Tie-breaks: head-to-head → game difference → kill difference → total
 * kills → organiser-run draw (`drawOrder`, team ids best first, logged by the service).
 */
export function computeStandings(input: {
  teamIds: string[];
  matches: StandingMatch[];
  pointsForWin: number;
  drawOrder?: string[];
}): StandingRow[] {
  void input;
  throw new NotImplementedError('computeStandings', 'Lane C');
}
