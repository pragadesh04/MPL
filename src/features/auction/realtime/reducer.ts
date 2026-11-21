import { nextValidBid } from '@/lib/rules/nextValidBid';
import type { AuctionSnapshot } from '@/lib/schemas/auction';
import type { AuctionEnvelope } from '@/lib/schemas/realtime';
import type { BidIncrements } from '@/lib/schemas/settings';

/**
 * Pure client-side reducer for `t:<id>:auction` events (PLAN §6.3, §9 item 25).
 *
 * - `version <= local` → stale, ignored (another instance published late).
 * - `version > local + 1` → gap: keep the state and refetch the snapshot.
 * - `version === local + 1` → applied. Hot fields (bid, deadline, lot, pause) update at once so the
 *   countdown and the BID button react instantly; events that also change lists (lot opened /
 *   closed, control, allocation) ask for a background snapshot refetch to fill in pool, unsold
 *   and squads.
 */

export type ApplyOutcome = 'applied' | 'stale' | 'gap';

export interface ApplyResult {
  snapshot: AuctionSnapshot;
  outcome: ApplyOutcome;
  /** True when the lists may be out of date: refetch the snapshot soon. */
  refetch: boolean;
}

const RECENT_BIDS = 30;

export function applyAuctionEvent(
  snapshot: AuctionSnapshot,
  envelope: AuctionEnvelope,
  increments: BidIncrements,
): ApplyResult {
  const version = envelope.version;
  if (version === null || version <= snapshot.version) {
    return { snapshot, outcome: 'stale', refetch: false };
  }
  if (version > snapshot.version + 1) return { snapshot, outcome: 'gap', refetch: true };

  const base: AuctionSnapshot = { ...snapshot, version, serverNow: envelope.serverNow };
  switch (envelope.type) {
    case 'bid.placed': {
      const d = envelope.data;
      const current = base.current;
      if (!current || current.playerId !== d.playerId) {
        return { snapshot: base, outcome: 'applied', refetch: true };
      }
      return {
        snapshot: {
          ...base,
          current: {
            ...current,
            currentBid: d.amount,
            currentTeamId: d.teamId,
            endsAt: d.endsAt,
            nextBid: nextValidBid(
              { basePrice: current.basePrice, currentBid: d.amount },
              increments,
            ),
          },
          recentBids: [
            {
              id: d.bidId,
              playerId: d.playerId,
              teamId: d.teamId,
              amount: d.amount,
              isFallback: d.isFallback,
              createdAt: envelope.serverNow,
            },
            ...base.recentBids,
          ].slice(0, RECENT_BIDS),
        },
        outcome: 'applied',
        refetch: false,
      };
    }
    case 'lot.opened': {
      const d = envelope.data;
      const player = base.pool.find((p) => p.id === d.playerId);
      return {
        snapshot: {
          ...base,
          round: d.round,
          nextAt: null,
          pausedRemainingMs: null,
          current: {
            playerId: d.playerId,
            basePrice: d.basePrice,
            originalBasePrice: d.originalBasePrice,
            isReauction: d.isReauction,
            currentBid: null,
            currentTeamId: null,
            nextBid: nextValidBid({ basePrice: d.basePrice, currentBid: null }, increments),
            endsAt: d.endsAt,
          },
          pool: player
            ? [{ ...player, status: 'ON_BLOCK' }, ...base.pool.filter((p) => p.id !== d.playerId)]
            : base.pool,
        },
        outcome: 'applied',
        refetch: true,
      };
    }
    case 'lot.closed': {
      const { nextAt, ...result } = envelope.data;
      return {
        snapshot: {
          ...base,
          current: null,
          nextAt,
          lastResult: result,
          pool: base.pool.filter((p) => p.id !== result.playerId),
        },
        outcome: 'applied',
        refetch: true,
      };
    }
    case 'auction.paused':
      return {
        snapshot: {
          ...base,
          status: 'AUCTION_PAUSED',
          pausedRemainingMs: envelope.data.pausedRemainingMs,
        },
        outcome: 'applied',
        refetch: false,
      };
    case 'auction.resumed': {
      const d = envelope.data;
      return {
        snapshot: {
          ...base,
          status: 'AUCTION_LIVE',
          pausedRemainingMs: null,
          nextAt: d.nextAt,
          current: base.current && d.endsAt ? { ...base.current, endsAt: d.endsAt } : base.current,
        },
        outcome: 'applied',
        refetch: false,
      };
    }
    case 'control.changed':
      return {
        snapshot: { ...base, controllerUserId: envelope.data.controllerUserId },
        outcome: 'applied',
        refetch: true,
      };
    case 'allocation.step':
      return { snapshot: base, outcome: 'applied', refetch: true };
  }
}

/** A fetched snapshot replaces local state unless it is older than what we already applied. */
export function shouldAcceptSnapshot(
  local: AuctionSnapshot | null,
  incoming: AuctionSnapshot,
): boolean {
  if (!local) return true;
  if (incoming.version !== local.version) return incoming.version > local.version;
  return incoming.rosterVersion >= local.rosterVersion;
}
