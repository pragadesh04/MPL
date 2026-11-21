import type { AuctionSnapshot } from '@/lib/schemas/auction';
import type { AuctionEnvelope } from '@/lib/schemas/realtime';
import type { BidIncrements } from '@/lib/schemas/settings';
import { applyAuctionEvent, shouldAcceptSnapshot } from './reducer';
import { createAuctionStore } from './store';

const T = '11111111-1111-4111-8111-111111111111';
const P1 = '22222222-2222-4222-8222-222222222222';
const P2 = '33333333-3333-4333-8333-333333333333';
const TEAM = '44444444-4444-4444-8444-444444444444';
const flat1: BidIncrements = { type: 'flat', step: 1 };
const NOW = '2026-11-21T10:00:00.000Z';

function snap(overrides: Partial<AuctionSnapshot> = {}): AuctionSnapshot {
  return {
    tournamentId: T,
    serverNow: NOW,
    version: 5,
    rosterVersion: 1,
    status: 'AUCTION_LIVE',
    round: 1,
    current: {
      playerId: P1,
      basePrice: 2,
      originalBasePrice: 2,
      isReauction: false,
      currentBid: null,
      currentTeamId: null,
      nextBid: 2,
      endsAt: '2026-11-21T10:01:00.000Z',
    },
    nextAt: null,
    pausedRemainingMs: null,
    controllerUserId: null,
    lastResult: null,
    teams: [],
    pool: [
      {
        id: P1,
        name: 'One',
        ign: null,
        photoUrl: null,
        basePrice: 2,
        status: 'ON_BLOCK',
        auctionOrder: 1,
      },
      {
        id: P2,
        name: 'Two',
        ign: null,
        photoUrl: null,
        basePrice: 3,
        status: 'POOL',
        auctionOrder: 2,
      },
    ],
    unsold: [],
    recentBids: [],
    ...overrides,
  };
}

function env<E extends AuctionEnvelope>(
  type: E['type'],
  version: number,
  data: E['data'],
): AuctionEnvelope {
  return { type, tournamentId: T, version, serverNow: NOW, data } as AuctionEnvelope;
}

const bid = (version: number, amount: number) =>
  env('bid.placed', version, {
    bidId: version,
    playerId: P1,
    teamId: TEAM,
    amount,
    endsAt: '2026-11-21T10:02:00.000Z',
    isFallback: false,
    enteredByUserId: null,
  });

describe('applyAuctionEvent', () => {
  it('applies the next version and recomputes the next bid', () => {
    const r = applyAuctionEvent(snap(), bid(6, 4), flat1);
    expect(r.outcome).toBe('applied');
    expect(r.refetch).toBe(false);
    expect(r.snapshot.version).toBe(6);
    expect(r.snapshot.current).toMatchObject({ currentBid: 4, currentTeamId: TEAM, nextBid: 5 });
    expect(r.snapshot.recentBids[0]).toMatchObject({ amount: 4, teamId: TEAM });
  });

  it('ignores old or duplicate versions and versionless events', () => {
    expect(applyAuctionEvent(snap(), bid(5, 4), flat1).outcome).toBe('stale');
    expect(applyAuctionEvent(snap(), bid(3, 4), flat1).outcome).toBe('stale');
    const versionless = { ...bid(6, 4), version: null } as AuctionEnvelope;
    expect(applyAuctionEvent(snap(), versionless, flat1).outcome).toBe('stale');
  });

  it('detects a gap and asks for a refetch without changing state', () => {
    const before = snap();
    const r = applyAuctionEvent(before, bid(8, 4), flat1);
    expect(r).toEqual({ snapshot: before, outcome: 'gap', refetch: true });
  });

  it('refetches when a bid is for a lot we do not have', () => {
    const r = applyAuctionEvent(snap({ current: null }), bid(6, 4), flat1);
    expect(r).toMatchObject({ outcome: 'applied', refetch: true });
  });

  it('lot.opened puts the soldier on the block and refetches lists', () => {
    const r = applyAuctionEvent(
      snap({ current: null, nextAt: NOW }),
      env('lot.opened', 6, {
        playerId: P2,
        round: 2,
        basePrice: 1,
        originalBasePrice: 3,
        isReauction: true,
        endsAt: '2026-11-21T10:01:00.000Z',
      }),
      flat1,
    );
    expect(r.refetch).toBe(true);
    expect(r.snapshot).toMatchObject({ round: 2, nextAt: null });
    expect(r.snapshot.current).toMatchObject({ playerId: P2, nextBid: 1, isReauction: true });
    expect(r.snapshot.pool[0]).toMatchObject({ id: P2, status: 'ON_BLOCK' });
  });

  it('lot.opened for a soldier missing from the pool keeps the pool', () => {
    const r = applyAuctionEvent(
      snap({ current: null, pool: [] }),
      env('lot.opened', 6, {
        playerId: P2,
        round: 1,
        basePrice: 3,
        originalBasePrice: 3,
        isReauction: false,
        endsAt: NOW,
      }),
      flat1,
    );
    expect(r.snapshot.pool).toEqual([]);
  });

  it('lot.closed clears the lot, records the result and the break', () => {
    const r = applyAuctionEvent(
      snap(),
      env('lot.closed', 6, {
        playerId: P1,
        result: 'SOLD',
        teamId: TEAM,
        price: 4,
        reason: null,
        nextAt: '2026-11-21T10:00:02.000Z',
      }),
      flat1,
    );
    expect(r.snapshot.current).toBeNull();
    expect(r.snapshot.lastResult).toEqual({
      playerId: P1,
      result: 'SOLD',
      teamId: TEAM,
      price: 4,
      reason: null,
    });
    expect(r.snapshot.nextAt).toBe('2026-11-21T10:00:02.000Z');
    expect(r.snapshot.pool.map((p) => p.id)).toEqual([P2]);
  });

  it('pause / resume / control / allocation', () => {
    const paused = applyAuctionEvent(
      snap(),
      env('auction.paused', 6, { pausedRemainingMs: 9000 }),
      flat1,
    );
    expect(paused.snapshot).toMatchObject({ status: 'AUCTION_PAUSED', pausedRemainingMs: 9000 });
    const resumed = applyAuctionEvent(
      paused.snapshot,
      env('auction.resumed', 7, { endsAt: '2026-11-21T10:05:00.000Z', nextAt: null }),
      flat1,
    );
    expect(resumed.snapshot).toMatchObject({ status: 'AUCTION_LIVE', pausedRemainingMs: null });
    expect(resumed.snapshot.current?.endsAt).toBe('2026-11-21T10:05:00.000Z');
    const breakResumed = applyAuctionEvent(
      snap({ current: null, status: 'AUCTION_PAUSED' }),
      env('auction.resumed', 6, { endsAt: null, nextAt: NOW }),
      flat1,
    );
    expect(breakResumed.snapshot).toMatchObject({ current: null, nextAt: NOW });
    const control = applyAuctionEvent(
      snap(),
      env('control.changed', 6, { controllerUserId: TEAM }),
      flat1,
    );
    expect(control).toMatchObject({ refetch: true, snapshot: { controllerUserId: TEAM } });
    const step = applyAuctionEvent(
      snap(),
      env('allocation.step', 6, {
        step: 1,
        playerId: P1,
        teamId: TEAM,
        reason: 'Fewest players: 2',
      }),
      flat1,
    );
    expect(step).toMatchObject({ outcome: 'applied', refetch: true });
  });
});

describe('shouldAcceptSnapshot', () => {
  it('accepts newer versions and same-version roster refreshes, rejects older', () => {
    expect(shouldAcceptSnapshot(null, snap())).toBe(true);
    expect(shouldAcceptSnapshot(snap(), snap({ version: 6 }))).toBe(true);
    expect(shouldAcceptSnapshot(snap(), snap({ version: 4 }))).toBe(false);
    expect(shouldAcceptSnapshot(snap(), snap({ rosterVersion: 2 }))).toBe(true);
    expect(shouldAcceptSnapshot(snap({ rosterVersion: 3 }), snap({ rosterVersion: 2 }))).toBe(
      false,
    );
  });
});

describe('createAuctionStore', () => {
  it('derives the clock offset from serverNow and smooths it', () => {
    const received = new Date(NOW).getTime() - 1000; // client clock 1 s behind
    const store = createAuctionStore(snap(), flat1, received);
    expect(store.getState().offsetMs).toBe(1000);
    store.getState().acceptSnapshot(snap({ version: 6 }), new Date(NOW).getTime() - 2000);
    expect(store.getState().offsetMs).toBe(1300);
  });

  it('applies events and ignores stale snapshots', () => {
    const store = createAuctionStore(snap(), flat1);
    expect(store.getState().applyEvent(bid(6, 3)).outcome).toBe('applied');
    expect(store.getState().acceptSnapshot(snap({ version: 5 }))).toBe(false);
    expect(store.getState().snapshot.version).toBe(6);
    expect(store.getState().applyEvent(bid(9, 3))).toEqual({ outcome: 'gap', refetch: true });
    expect(store.getState().snapshot.version).toBe(6);
  });
});
