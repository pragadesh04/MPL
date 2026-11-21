import type { BidIncrements } from '../schemas/settings';
import {
  bidBlockMessage,
  canTeamBid,
  customBidBounds,
  type BidBlockReason,
  type CanTeamBidInput,
} from './canTeamBid';

const NOW = new Date('2026-11-21T10:00:00.000Z');
const LATER = new Date('2026-11-21T10:00:30.000Z');
const flat1: BidIncrements = { type: 'flat', step: 1 };

function input(overrides: Partial<CanTeamBidInput> = {}): CanTeamBidInput {
  return {
    status: 'AUCTION_LIVE',
    lot: { playerId: 'p1', basePrice: 2, currentBid: 5, currentTeamId: 'other', endsAt: LATER },
    now: NOW,
    team: { id: 'me', squadSize: 3, purseRemaining: 20 },
    settings: { maxPlayersPerTeam: 6, bidIncrements: flat1, allowCustomBids: true },
    ...overrides,
  };
}

describe('canTeamBid', () => {
  it('allows the next valid bid and reports it', () => {
    expect(canTeamBid(input())).toEqual({ ok: true, nextBid: 6 });
    expect(canTeamBid(input({ amount: 6 }))).toEqual({ ok: true, nextBid: 6 });
  });

  it('allows a custom bid above the minimum up to the whole purse (no reserve rule)', () => {
    expect(canTeamBid(input({ amount: 20 }))).toEqual({ ok: true, nextBid: 6 });
  });

  it('allows the first bid at the base price', () => {
    const lot = {
      playerId: 'p1',
      basePrice: 2,
      currentBid: null,
      currentTeamId: null,
      endsAt: LATER,
    };
    expect(canTeamBid(input({ lot, amount: 2 }))).toEqual({ ok: true, nextBid: 2 });
  });

  it.each<[string, Partial<CanTeamBidInput>, BidBlockReason, number | null]>([
    ['paused', { status: 'AUCTION_PAUSED' }, 'AUCTION_NOT_LIVE', 6],
    ['before the auction', { status: 'READY', lot: null }, 'AUCTION_NOT_LIVE', null],
    ['no soldier on the block', { lot: null }, 'NO_LOT', null],
    [
      'lot without a deadline',
      { lot: { playerId: 'p1', basePrice: 2, currentBid: 5, currentTeamId: null, endsAt: null } },
      'LOT_EXPIRED',
      6,
    ],
    ['deadline reached exactly', { now: LATER }, 'LOT_EXPIRED', 6],
    [
      'already leading',
      { lot: { playerId: 'p1', basePrice: 2, currentBid: 5, currentTeamId: 'me', endsAt: LATER } },
      'ALREADY_LEADING',
      6,
    ],
    ['squad full', { team: { id: 'me', squadSize: 6, purseRemaining: 20 } }, 'SQUAD_FULL', 6],
    [
      'next bid over purse',
      { team: { id: 'me', squadSize: 3, purseRemaining: 5 } },
      'CANT_AFFORD',
      6,
    ],
    ['amount below the minimum', { amount: 5 }, 'AMOUNT_TOO_LOW', 6],
    ['amount over purse', { amount: 21 }, 'AMOUNT_OVER_PURSE', 6],
  ])('blocks when %s', (_label, overrides, reason, nextBid) => {
    expect(canTeamBid(input(overrides))).toEqual({ ok: false, reason, nextBid });
  });

  it('requires exactly the next bid when custom bids are off', () => {
    const settings = { maxPlayersPerTeam: 6, bidIncrements: flat1, allowCustomBids: false };
    expect(canTeamBid(input({ settings, amount: 7 }))).toEqual({
      ok: false,
      reason: 'AMOUNT_NOT_EXACT',
      nextBid: 6,
    });
    expect(canTeamBid(input({ settings, amount: 6 }))).toEqual({ ok: true, nextBid: 6 });
  });

  it('can spend the last point exactly', () => {
    const team = { id: 'me', squadSize: 3, purseRemaining: 6 };
    expect(canTeamBid(input({ team, amount: 6 }))).toEqual({ ok: true, nextBid: 6 });
  });
});

describe('customBidBounds', () => {
  it('spans next bid … purse with custom bids on', () => {
    expect(customBidBounds(input())).toEqual({ min: 6, max: 20 });
  });

  it('is pinned to the next bid with custom bids off', () => {
    const settings = { maxPlayersPerTeam: 6, bidIncrements: flat1, allowCustomBids: false };
    expect(customBidBounds(input({ settings }))).toEqual({ min: 6, max: 6 });
  });

  it('is null when the team cannot bid', () => {
    expect(customBidBounds(input({ status: 'AUCTION_PAUSED' }))).toBeNull();
  });
});

describe('bidBlockMessage', () => {
  it.each<[BidBlockReason, number | null, string]>([
    ['AUCTION_NOT_LIVE', null, 'Bidding is paused'],
    ['NO_LOT', null, 'No soldier on the block'],
    ['LOT_EXPIRED', 4, 'Time is up for this soldier'],
    ['ALREADY_LEADING', 4, 'You hold the highest bid. Hold steady!'],
    ['SQUAD_FULL', 4, 'Your squad is full'],
    ['CANT_AFFORD', 4, 'Not enough points for the next bid (4)'],
    ['CANT_AFFORD', null, 'Not enough points for the next bid (0)'],
    ['AMOUNT_TOO_LOW', 4, 'The minimum bid is 4 MP'],
    ['AMOUNT_NOT_EXACT', 4, 'Custom bids are off: bid exactly 4 MP'],
    ['AMOUNT_OVER_PURSE', 4, 'That is more than your points left'],
  ])('%s', (reason, next, text) => {
    expect(bidBlockMessage(reason, next)).toBe(text);
  });
});
