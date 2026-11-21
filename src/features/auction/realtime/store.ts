import { createStore, type StoreApi } from 'zustand/vanilla';
import { offsetFromSample, smoothOffset } from '@/lib/realtime/clock';
import type { AuctionSnapshot } from '@/lib/schemas/auction';
import type { AuctionEnvelope } from '@/lib/schemas/realtime';
import type { BidIncrements } from '@/lib/schemas/settings';
import { applyAuctionEvent, shouldAcceptSnapshot, type ApplyOutcome } from './reducer';

/**
 * Live auction state for one tournament (Zustand is used for live auction state only, CLAUDE.md).
 * One store per mounted auction screen, created by `useAuctionRealtime`.
 */
export interface AuctionStoreState {
  snapshot: AuctionSnapshot;
  /** ms to add to Date.now() to get Postgres time (smoothed). */
  offsetMs: number;
  /** Date.now() of the last applied auction event or accepted snapshot. */
  lastUpdateAt: number;
  /** Date.now() of the last applied auction event (heartbeat: refetch after 10 s of silence). */
  lastEventAt: number;
  acceptSnapshot: (snapshot: AuctionSnapshot, receivedAt?: number) => boolean;
  applyEvent: (
    envelope: AuctionEnvelope,
    receivedAt?: number,
  ) => { outcome: ApplyOutcome; refetch: boolean };
}

export type AuctionStore = StoreApi<AuctionStoreState>;

export function createAuctionStore(
  initial: AuctionSnapshot,
  increments: BidIncrements,
  receivedAt: number = Date.now(),
): AuctionStore {
  return createStore<AuctionStoreState>()((set, get) => ({
    snapshot: initial,
    offsetMs: offsetFromSample(initial.serverNow, receivedAt),
    lastUpdateAt: receivedAt,
    lastEventAt: receivedAt,
    acceptSnapshot: (snapshot, at = Date.now()) => {
      const state = get();
      if (!shouldAcceptSnapshot(state.snapshot, snapshot)) return false;
      set({
        snapshot,
        offsetMs: smoothOffset(state.offsetMs, offsetFromSample(snapshot.serverNow, at)),
        lastUpdateAt: at,
      });
      return true;
    },
    applyEvent: (envelope, at = Date.now()) => {
      const state = get();
      const result = applyAuctionEvent(state.snapshot, envelope, increments);
      if (result.outcome === 'applied') {
        set({
          snapshot: result.snapshot,
          offsetMs: smoothOffset(state.offsetMs, offsetFromSample(envelope.serverNow, at)),
          lastUpdateAt: at,
          lastEventAt: at,
        });
      }
      return { outcome: result.outcome, refetch: result.refetch };
    },
  }));
}
