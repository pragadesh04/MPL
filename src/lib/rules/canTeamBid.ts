import type { TournamentStatus } from '../schemas/enums';
import type { TournamentSettings } from '../schemas/settings';
import { nextValidBid } from './nextValidBid';

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
 *
 * Checks run in the §3.2 order, so the reason shown is the most fundamental one.
 */
export function canTeamBid(input: CanTeamBidInput): BidCheck {
  const { lot, team, settings, amount } = input;
  const nextBid = lot ? nextValidBid(lot, settings.bidIncrements) : null;
  const block = (reason: BidBlockReason): BidCheck => ({ ok: false, reason, nextBid });

  if (input.status !== 'AUCTION_LIVE') return block('AUCTION_NOT_LIVE');
  if (!lot || nextBid === null) return block('NO_LOT');
  if (!lot.endsAt || input.now.getTime() >= lot.endsAt.getTime()) return block('LOT_EXPIRED');
  if (lot.currentTeamId === team.id) return block('ALREADY_LEADING');
  if (team.squadSize >= settings.maxPlayersPerTeam) return block('SQUAD_FULL');
  if (nextBid > team.purseRemaining) return block('CANT_AFFORD');

  if (amount !== undefined) {
    if (amount < nextBid) return block('AMOUNT_TOO_LOW');
    if (!settings.allowCustomBids && amount !== nextBid) return block('AMOUNT_NOT_EXACT');
    if (amount > team.purseRemaining) return block('AMOUNT_OVER_PURSE');
  }
  return { ok: true, nextBid };
}

/** Allowed custom-bid range for the phone's amount field, or null if the team can't bid. */
export function customBidBounds(
  input: Omit<CanTeamBidInput, 'amount'>,
): { min: number; max: number } | null {
  const check = canTeamBid(input);
  if (!check.ok) return null;
  return {
    min: check.nextBid,
    max: input.settings.allowCustomBids ? input.team.purseRemaining : check.nextBid,
  };
}

/** Human text for each block reason (phone button, console tiles, API messages). §7.6, §7.8. */
export function bidBlockMessage(reason: BidBlockReason, nextBid: number | null): string {
  const next = nextBid ?? 0;
  switch (reason) {
    case 'AUCTION_NOT_LIVE':
      return 'Bidding is paused';
    case 'NO_LOT':
      return 'No soldier on the block';
    case 'LOT_EXPIRED':
      return 'Time is up for this soldier';
    case 'ALREADY_LEADING':
      return 'You hold the highest bid. Hold steady!';
    case 'SQUAD_FULL':
      return 'Your squad is full';
    case 'CANT_AFFORD':
      return `Not enough points for the next bid (${next})`;
    case 'AMOUNT_TOO_LOW':
      return `The minimum bid is ${next} MP`;
    case 'AMOUNT_NOT_EXACT':
      return `Custom bids are off: bid exactly ${next} MP`;
    case 'AMOUNT_OVER_PURSE':
      return 'That is more than your points left';
  }
}
