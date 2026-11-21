import { vi } from 'vitest';
import type { AuctionSnapshot } from '@/lib/schemas/auction';
import { DEFAULT_SETTINGS, type TournamentSettings } from '@/lib/schemas/settings';
import type { AuctionViewer } from '../shared/types';

/** Test-only builders for the console and command post component tests (never imported by app code). */

export const ME = '00000000-0000-4000-8000-000000000001';
export const OTHER = '00000000-0000-4000-8000-000000000002';

type Team = AuctionSnapshot['teams'][number];
type Player = AuctionSnapshot['pool'][number];

export function team(id: string, name: string, o: Partial<Team> = {}): Team {
  return {
    id,
    leaderId: `l-${id}`,
    captainName: `Captain ${name}`,
    name,
    shortName: name.slice(0, 3).toUpperCase(),
    color: '#336699',
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

export function player(id: string, name: string, o: Partial<Player> = {}): Player {
  return {
    id,
    name,
    ign: null,
    photoUrl: null,
    basePrice: 2,
    status: 'POOL',
    auctionOrder: 1,
    ...o,
  };
}

export function makeSnapshot(o: Partial<AuctionSnapshot> = {}): AuctionSnapshot {
  const now = Date.now();
  return {
    tournamentId: 't1',
    serverNow: new Date(now).toISOString(),
    version: 5,
    rosterVersion: 2,
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
      endsAt: new Date(now + 45_000).toISOString(),
    },
    nextAt: null,
    pausedRemainingMs: null,
    controllerUserId: ME,
    lastResult: null,
    teams: [
      team('a', 'Alpha', { sortOrder: 0 }),
      team('b', 'Bravo', { sortOrder: 1 }),
      team('c', 'Charlie', { sortOrder: 2, squadSize: 6 }),
    ],
    pool: [player('p1', 'Ghost', { status: 'ON_BLOCK' }), player('p2', 'Viper')],
    unsold: [],
    recentBids: [],
    ...o,
  };
}

export function makeViewer(o: Partial<AuctionViewer> = {}): AuctionViewer {
  return {
    userId: ME,
    roles: ['OWNER'],
    teamId: null,
    playerId: null,
    canControl: true,
    canRoster: true,
    canReset: true,
    canEditLiveSettings: true,
    isOrganiser: true,
    ...o,
  };
}

const ok = { ok: true as const, data: { snapshot: makeSnapshot() } };

export function makeAuction(
  snapshot: AuctionSnapshot,
  o: { settings?: Partial<TournamentSettings> } = {},
) {
  return {
    snapshot,
    offsetMs: 0,
    connection: 'connected' as const,
    live: true,
    refetch: vi.fn(),
    bid: vi.fn(async () => ok),
    command: vi.fn(async () => ok),
    onEvent: vi.fn(() => () => undefined),
    info: {
      tournamentId: 't1',
      tournamentName: "Ravi's MPL Season 2",
      settings: { ...DEFAULT_SETTINGS, ...o.settings },
      organiserNames: { [ME]: 'Me', [OTHER]: 'Ravi' },
      captainUserIds: { a: 'ua', b: 'ub', c: null },
    },
  };
}
