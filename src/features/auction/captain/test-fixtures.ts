import type { AuctionSnapshot } from '@/lib/schemas/auction';
import { DEFAULT_SETTINGS, type TournamentSettings } from '@/lib/schemas/settings';
import type { AuctionRealtime } from '../realtime/use-auction-realtime';
import type { AuctionScreenInfo } from '../shared/auction-context';

/**
 * Test-only fixtures for the captain / soldier / big-screen component tests: a live snapshot
 * (Alpha vs Bravo, soldier "One" on the block with Bravo leading at 4 MP) and a fake
 * `useAuction()` value. Not imported by app code.
 */

export const TEAM_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const TEAM_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export const P1 = '11111111-1111-4111-8111-111111111111';
export const P2 = '22222222-2222-4222-8222-222222222222';
export const P3 = '33333333-3333-4333-8333-333333333333';
export const P9 = '99999999-9999-4999-8999-999999999999';

export const testSettings: TournamentSettings = {
  ...DEFAULT_SETTINGS,
  maxPlayersPerTeam: 3,
  minPlayersPerTeam: 2,
  bidIncrements: { type: 'flat', step: 1 },
  allowCustomBids: true,
};

type Team = AuctionSnapshot['teams'][number];

export function team(o: Partial<Team> = {}): Team {
  return {
    id: TEAM_A,
    leaderId: 'la',
    captainName: 'Cap Alpha',
    name: 'Alpha',
    shortName: 'ALP',
    color: '#ff0000',
    logoUrl: null,
    emoji: null,
    sortOrder: 0,
    purseTotal: 50,
    purseRemaining: 50,
    spent: 0,
    squadSize: 1,
    members: [],
    ...o,
  };
}

export function snap(o: Partial<AuctionSnapshot> = {}): AuctionSnapshot {
  const now = Date.now();
  return {
    tournamentId: 't',
    serverNow: new Date(now).toISOString(),
    version: 3,
    rosterVersion: 1,
    status: 'AUCTION_LIVE',
    round: 1,
    current: {
      playerId: P1,
      basePrice: 2,
      originalBasePrice: 2,
      isReauction: false,
      currentBid: 4,
      currentTeamId: TEAM_B,
      nextBid: 5,
      endsAt: new Date(now + 30_000).toISOString(),
    },
    nextAt: null,
    pausedRemainingMs: null,
    controllerUserId: null,
    lastResult: null,
    teams: [
      team(),
      team({
        id: TEAM_B,
        leaderId: 'lb',
        captainName: 'Cap Bravo',
        name: 'Bravo',
        shortName: 'BRV',
        color: '#00ff00',
        sortOrder: 1,
        purseRemaining: 46,
        spent: 4,
        squadSize: 2,
        members: [
          {
            playerId: P9,
            name: 'Niner',
            ign: null,
            photoUrl: null,
            price: 4,
            acquiredVia: 'AUCTION',
          },
        ],
      }),
    ],
    pool: [
      {
        id: P1,
        name: 'One',
        ign: 'uno',
        photoUrl: null,
        basePrice: 2,
        status: 'ON_BLOCK',
        auctionOrder: 1,
      },
      {
        id: P3,
        name: 'Three',
        ign: null,
        photoUrl: null,
        basePrice: 5,
        status: 'POOL',
        auctionOrder: 3,
      },
    ],
    unsold: [
      {
        id: P2,
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

/** A lobby snapshot: auction live, nothing opened yet. */
export function lobbySnap(): AuctionSnapshot {
  return snap({ current: null, nextAt: null, lastResult: null, round: 1 });
}

export const testInfo: AuctionScreenInfo = {
  tournamentId: 't',
  tournamentName: "Ravi's MPL",
  settings: testSettings,
  organiserNames: {},
  captainUserIds: { [TEAM_A]: 'user-a', [TEAM_B]: 'user-b' },
};

export type FakeAuction = AuctionRealtime & { info: AuctionScreenInfo };

export function fakeAuction(o: Partial<FakeAuction> = {}): FakeAuction {
  return {
    snapshot: snap(),
    offsetMs: 0,
    connection: 'disabled',
    live: false,
    refetch: () => undefined,
    bid: () => Promise.resolve({ ok: true, data: { snapshot: snap() } }),
    command: () => Promise.resolve({ ok: true, data: { snapshot: snap() } }),
    onEvent: () => () => undefined,
    info: testInfo,
    ...o,
  };
}
