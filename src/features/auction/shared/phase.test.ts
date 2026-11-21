import type { AuctionSnapshot } from '@/lib/schemas/auction';
import { auctionPhase, findPlayer, findTeam, needsJumpConfirm, teamBidState } from './phase';

const NOW = Date.parse('2026-11-21T10:00:00.000Z');
const settings = {
  maxPlayersPerTeam: 3,
  bidIncrements: { type: 'flat', step: 1 } as const,
  allowCustomBids: true,
};

function snap(o: Partial<AuctionSnapshot> = {}): AuctionSnapshot {
  return {
    tournamentId: 't',
    serverNow: new Date(NOW).toISOString(),
    version: 3,
    rosterVersion: 1,
    status: 'AUCTION_LIVE',
    round: 1,
    current: {
      playerId: 'p1',
      basePrice: 2,
      originalBasePrice: 2,
      isReauction: false,
      currentBid: 4,
      currentTeamId: 'b',
      nextBid: 5,
      endsAt: new Date(NOW + 30_000).toISOString(),
    },
    nextAt: null,
    pausedRemainingMs: null,
    controllerUserId: null,
    lastResult: null,
    teams: [
      {
        id: 'a',
        leaderId: 'la',
        captainName: 'A',
        name: 'Alpha',
        shortName: 'ALP',
        color: '#ff0000',
        logoUrl: null,
        emoji: null,
        sortOrder: 0,
        purseTotal: 10,
        purseRemaining: 10,
        spent: 0,
        squadSize: 1,
        members: [],
      },
      {
        id: 'b',
        leaderId: 'lb',
        captainName: 'B',
        name: 'Bravo',
        shortName: 'BRV',
        color: '#00ff00',
        logoUrl: null,
        emoji: null,
        sortOrder: 1,
        purseTotal: 10,
        purseRemaining: 6,
        spent: 4,
        squadSize: 2,
        members: [
          {
            playerId: 'p9',
            name: 'Niner',
            ign: null,
            photoUrl: null,
            price: 4,
            acquiredVia: 'AUCTION',
          },
        ],
      },
    ],
    pool: [
      {
        id: 'p1',
        name: 'One',
        ign: 'uno',
        photoUrl: null,
        basePrice: 2,
        status: 'ON_BLOCK',
        auctionOrder: 1,
      },
    ],
    unsold: [
      {
        id: 'p2',
        name: 'Two',
        ign: null,
        photoUrl: null,
        basePrice: 1,
        status: 'UNSOLD',
        auctionOrder: 2,
      },
    ],
    recentBids: [],
    ...o,
  };
}

describe('auctionPhase', () => {
  it('derives every phase', () => {
    expect(auctionPhase(snap())).toBe('LOT');
    expect(auctionPhase(snap({ status: 'AUCTION_PAUSED' }))).toBe('PAUSED');
    expect(auctionPhase(snap({ status: 'ALLOCATION' }))).toBe('COMPLETE');
    expect(auctionPhase(snap({ current: null, nextAt: new Date(NOW).toISOString() }))).toBe(
      'BREAK',
    );
    expect(auctionPhase(snap({ current: null }))).toBe('LOBBY');
    expect(auctionPhase(snap({ current: null, round: 2 }))).toBe('WAITING');
  });
});

describe('teamBidState', () => {
  it('can bid with quick chips capped by the purse', () => {
    expect(teamBidState(snap(), 'a', settings, NOW)).toEqual({
      canBid: true,
      nextBid: 5,
      reason: null,
      code: null,
      bounds: { min: 5, max: 10 },
      quick: [5, 6, 9],
    });
  });

  it('explains why not', () => {
    expect(teamBidState(snap(), 'b', settings, NOW).reason).toBe(
      'You hold the highest bid. Hold steady!',
    );
    expect(teamBidState(snap(), 'a', settings, NOW + 31_000).reason).toBe(
      'Time is up for this soldier',
    );
    expect(teamBidState(snap(), 'zzz', settings, NOW)).toMatchObject({
      canBid: false,
      reason: 'No team',
    });
    expect(teamBidState(snap({ current: null }), 'a', settings, NOW).quick).toEqual([]);
  });

  it('offers only the exact bid when custom bids are off', () => {
    expect(teamBidState(snap(), 'a', { ...settings, allowCustomBids: false }, NOW).quick).toEqual([
      5,
    ]);
  });
});

describe('lookups', () => {
  it('finds players anywhere and teams by id', () => {
    const s = snap();
    expect(findPlayer(s, 'p1')?.ign).toBe('uno');
    expect(findPlayer(s, 'p2')?.name).toBe('Two');
    expect(findPlayer(s, 'p9')?.name).toBe('Niner');
    expect(findPlayer(s, 'nope')).toBeNull();
    expect(findPlayer(s, null)).toBeNull();
    expect(findTeam(s, 'b')?.name).toBe('Bravo');
    expect(findTeam(s, null)).toBeNull();
  });

  it('flags jump bids', () => {
    expect(needsJumpConfirm(snap(), 10, settings)).toBe(false);
    expect(needsJumpConfirm(snap(), 11, settings)).toBe(true);
    expect(needsJumpConfirm(snap({ current: null }), 11, settings)).toBe(false);
  });
});
