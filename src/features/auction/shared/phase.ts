import {
  bidBlockMessage,
  canTeamBid,
  customBidBounds,
  type BidBlockReason,
} from '@/lib/rules/canTeamBid';
import { isJumpBid, quickRaiseOptions } from '@/lib/rules/nextValidBid';
import type { AuctionSnapshot } from '@/lib/schemas/auction';
import type { TournamentSettings } from '@/lib/schemas/settings';

/**
 * Pure view helpers shared by every auction screen. The UI uses the same rule functions as the
 * server (CLAUDE.md: rules live in src/lib/rules) only to disable buttons and explain why.
 */

export type AuctionPhase =
  | 'LOBBY' // started, nothing opened yet
  | 'LOT' // a soldier is on the block
  | 'BREAK' // "Next soldier in 2…"
  | 'PAUSED'
  | 'WAITING' // pool empty, organiser decides (Auction again / Assign / Start new round)
  | 'COMPLETE'; // every round done (ALLOCATION and later)

export function auctionPhase(s: AuctionSnapshot): AuctionPhase {
  if (s.status === 'AUCTION_PAUSED') return 'PAUSED';
  if (s.status !== 'AUCTION_LIVE') return 'COMPLETE';
  if (s.current) return 'LOT';
  if (s.nextAt) return 'BREAK';
  if (s.lastResult === null && s.round === 1) return 'LOBBY';
  return 'WAITING';
}

export const PHASE_TEXT: Record<AuctionPhase, string> = {
  LOBBY: 'Auction starts soon',
  LOT: 'Bidding open',
  BREAK: 'Next soldier coming up',
  PAUSED: 'The admin paused the auction. Hold your position.',
  WAITING: 'Waiting for the organisers',
  COMPLETE: 'Auction complete',
};

export type BidSettings = Pick<
  TournamentSettings,
  'maxPlayersPerTeam' | 'bidIncrements' | 'allowCustomBids'
>;

export interface TeamBidState {
  canBid: boolean;
  nextBid: number | null;
  /** Human reason when the team can't bid (null when it can). */
  reason: string | null;
  /** The rule's machine-readable reason ('NO_TEAM' when the team is unknown), null when it can bid. */
  code: BidBlockReason | 'NO_TEAM' | null;
  bounds: { min: number; max: number } | null;
  quick: number[];
}

/** Can this team bid right now, by the offset-corrected server clock? */
export function teamBidState(
  s: AuctionSnapshot,
  teamId: string,
  settings: BidSettings,
  serverNowMs: number,
): TeamBidState {
  const team = s.teams.find((t) => t.id === teamId);
  if (!team)
    return {
      canBid: false,
      nextBid: null,
      reason: 'No team',
      code: 'NO_TEAM',
      bounds: null,
      quick: [],
    };
  const input = {
    status: s.status,
    lot: s.current
      ? {
          playerId: s.current.playerId,
          basePrice: s.current.basePrice,
          currentBid: s.current.currentBid,
          currentTeamId: s.current.currentTeamId,
          endsAt: s.current.endsAt ? new Date(s.current.endsAt) : null,
        }
      : null,
    now: new Date(serverNowMs),
    team: { id: team.id, squadSize: team.squadSize, purseRemaining: team.purseRemaining },
    settings,
  };
  const check = canTeamBid(input);
  const quick =
    check.ok && s.current
      ? quickRaiseOptions(
          { basePrice: s.current.basePrice, currentBid: s.current.currentBid },
          settings.bidIncrements,
        ).filter(
          (a) => a <= team.purseRemaining && (settings.allowCustomBids || a === check.nextBid),
        )
      : [];
  return {
    canBid: check.ok,
    nextBid: check.nextBid,
    reason: check.ok ? null : bidBlockMessage(check.reason, check.nextBid),
    code: check.ok ? null : check.reason,
    bounds: customBidBounds(input),
    quick,
  };
}

/** A typo guard: confirm jump bids of more than 5 raises (§3.2). */
export function needsJumpConfirm(
  s: AuctionSnapshot,
  amount: number,
  settings: BidSettings,
): boolean {
  if (!s.current) return false;
  return isJumpBid(
    amount,
    { basePrice: s.current.basePrice, currentBid: s.current.currentBid },
    settings.bidIncrements,
  );
}

/** Name lookups for the lists (the soldier on the block is first in `pool`). */
export function findPlayer(s: AuctionSnapshot, playerId: string | null | undefined) {
  if (!playerId) return null;
  const listed = s.pool.find((p) => p.id === playerId) ?? s.unsold.find((p) => p.id === playerId);
  if (listed)
    return { id: listed.id, name: listed.name, ign: listed.ign, photoUrl: listed.photoUrl };
  for (const t of s.teams) {
    const m = t.members.find((x) => x.playerId === playerId);
    if (m) return { id: m.playerId, name: m.name, ign: m.ign, photoUrl: m.photoUrl };
  }
  return null;
}

export function findTeam(s: AuctionSnapshot, teamId: string | null | undefined) {
  return teamId ? (s.teams.find((t) => t.id === teamId) ?? null) : null;
}

/** "In pool", "Unsold", "Red Rhinos (12 MP)"… for roster rows. */
export const ACQUIRED_LABEL: Record<string, string> = {
  AUCTION: '',
  AUTO_ALLOCATED: 'Auto',
  RANDOM_SQUAD: 'Random',
  ADMIN_PICK: 'Admin pick',
};

export const RESULT_REASON_TEXT: Record<string, string> = {
  NO_BIDS: 'No bids',
  NO_SPACE: 'No space in any squad',
  CLOSED_BY_ORGANISER: 'Closed by the organisers',
  BIDDER_INELIGIBLE: 'Leading team could no longer buy',
  RANDOM_SQUAD: 'Sent to a random squad',
};
