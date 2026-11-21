import type { LeaderApproval, PlayerStatus } from '../schemas/enums';
import type { TournamentSettings } from '../schemas/settings';
import { NotImplementedError } from './not-implemented';

/** Owner: Lane A (A9). PLAN §3.5. */

export interface ReadyCaptain {
  leaderId: string;
  name: string;
  userId: string | null;
  approval: LeaderApproval;
  purseTotal: number;
  ign: string | null;
  phone: string | null;
  team: { name: string; shortName: string; color: string } | null;
}

export interface ReadySoldier {
  playerId: string;
  name: string;
  userId: string | null;
  status: PlayerStatus;
  basePrice: number;
  ign: string | null;
  phone: string | null;
}

export interface ReadyToStartInput {
  settings: TournamentSettings;
  /** Every captain row of the tournament (any approval). */
  captains: ReadyCaptain[];
  /** Every soldier row of the tournament (any status). */
  soldiers: ReadySoldier[];
}

export type ReadyCheckId =
  | 'MIN_CAPTAINS'
  | 'CAPTAINS_LINKED_AND_TEAMS_READY'
  | 'TEAM_NAMES_UNIQUE'
  | 'TEAM_COLOURS_DISTINCT'
  | 'NONE_PENDING'
  | 'BASE_PRICES'
  | 'CAPACITY'
  | 'SQUAD_SIZE_SANE'
  | 'NO_DUPLICATE_PEOPLE'
  | 'PURSES_COVER_BASE_PRICE';

export interface ReadyCheck {
  id: ReadyCheckId;
  ok: boolean;
  /** Human message for the review screen (✅ / ❌ rows). */
  message: string;
  /** Wizard step the "Fix" link jumps to (§7.2). */
  fixStep: 'rules' | 'people' | 'teams';
  /** leaders.id / players.id that fail the check, when applicable. */
  offenders?: string[];
}

export interface ReadyToStartResult {
  ok: boolean;
  checks: ReadyCheck[];
}

/**
 * Every §3.5 check, in display order. Start is enabled only when `ok`. Pending Player ID requests
 * are NOT a blocker (Start expires them); pending key sign-ups are.
 */
export function validateReadyToStart(input: ReadyToStartInput): ReadyToStartResult {
  void input;
  throw new NotImplementedError('validateReadyToStart', 'Lane A');
}
