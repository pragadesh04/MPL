import type { TournamentStatus } from '../schemas/enums';
import type { TournamentSettings } from '../schemas/settings';
import { NotImplementedError } from './not-implemented';

/**
 * Owner: Lane B (B1). PLAN §3.2. The server re-checks this inside the locked transaction; the UI
 * calls the same function only to grey out the BID button and show the reason.
 */

export type BidBlockReason =
  | 'AUCTION_NOT_LIVE'
  | 'NO_LOT'
  | 'LOT_EXPIRED'
  | 'ALREADY_LEADING'
  | 'SQUAD_FULL'
  | 'CANT_AFFORD'
  | 'AMOUNT_TOO_LOW'
  | 'AMOUNT_NOT_EXACT'
  | 'AMOUNT_OVER_PURSE';

export interface CanTeamBidInput {
  status: TournamentStatus;
  lot: {
    playerId: string;
    basePrice: number;
    currentBid: number | null;
    currentTeamId: string | null;
    endsAt: Date | null;
  } | null;
  /** Postgres now() on the server; the offset-corrected server clock on the client. */
  now: Date;
  team: { id: string; squadSize: number; purseRemaining: number };
  settings: Pick<TournamentSettings, 'maxPlayersPerTeam' | 'bidIncrements' | 'allowCustomBids'>;
  /** The proposed amount; omit to ask "can this team bid at all?" (button state). */
  amount?: number;
}

export type BidCheck =
  { ok: true; nextBid: number } | { ok: false; reason: BidBlockReason; nextBid: number | null };

/**
 * Whether `team` may bid (`amount`) on the current lot. WHO is bidding (this team's captain, or
 * the controlling auctioneer's fallback bid) is checked by the service from the session.
 */
export function canTeamBid(input: CanTeamBidInput): BidCheck {
  void input;
  throw new NotImplementedError('canTeamBid', 'Lane B');
}

/** Allowed custom-bid range for the phone's amount field, or null if the team can't bid. */
export function customBidBounds(
  input: Omit<CanTeamBidInput, 'amount'>,
): { min: number; max: number } | null {
  void input;
  throw new NotImplementedError('customBidBounds', 'Lane B');
}
