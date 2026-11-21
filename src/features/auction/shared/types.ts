import type { TournamentRole } from '@/lib/schemas/domain';

/**
 * View types shared by the auction Server Components (src/server/services/auction/page-data.ts)
 * and the client screens. No server imports here.
 */

export interface AuctionViewer {
  userId: string;
  roles: TournamentRole[];
  /** The captain's team (null for non-captains). */
  teamId: string | null;
  /** The soldier's own players.id (null for non-soldiers). */
  playerId: string | null;
  canControl: boolean;
  canRoster: boolean;
  canReset: boolean;
  canEditLiveSettings: boolean;
  isOrganiser: boolean;
}

export interface RosterPerson {
  kind: 'CAPTAIN' | 'SOLDIER';
  id: string;
  name: string;
  ign: string | null;
  username: string | null;
  photoUrl: string | null;
  /** Captains: their team. Soldiers: the squad they're in (if any). */
  teamId: string | null;
  /** 'CAPTAIN' for captains; the soldier status otherwise. */
  status: string;
  price: number | null;
  acquiredVia: string | null;
}
