'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { auctionChannel, updatesChannel } from '@/lib/realtime/channels';
import { msUntil } from '@/lib/realtime/clock';
import { useChannel, useConnectionState, type ConnectionState } from '@/lib/realtime/provider';
import type { AuctionCommand, AuctionSnapshot, AuctionWriteResponse } from '@/lib/schemas/auction';
import {
  AUCTION_EVENT_TYPES,
  type AuctionEnvelope,
  type AnyEnvelope,
} from '@/lib/schemas/realtime';
import type { BidIncrements } from '@/lib/schemas/settings';
import {
  fetchSnapshot,
  isStaleError,
  newCommandId,
  postBid,
  postCommand,
  postTick,
  type ApiResult,
} from './api';
import { createAuctionStore } from './store';

/**
 * Client auction state (PLAN §6.3, §13.5 B5): one hook every auction screen uses.
 *
 * - Applies `t:<id>:auction` events by version; on a gap, after list-changing events, on
 *   `t:<id>:updates` events and on reconnect it refetches the snapshot (single flight).
 * - Heartbeat: a live lot with no event for 10 s refetches. Without a realtime connection (Ably
 *   key missing, offline) it polls every 2 s instead, so dev without Ably still works.
 * - Tick nudge: when the lot or break countdown reaches 0 it POSTs /tick (with jitter), so the
 *   step happens within about a second even with nobody pressing anything.
 * - Countdowns use the smoothed server-clock offset, never the raw client clock.
 */

const HEARTBEAT_SILENCE_MS = 10_000;
const POLL_WITHOUT_REALTIME_MS = 2_000;
const TICK_RETRY_MS = 1_000;
const TICK_MAX_RETRIES = 3;

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type AuctionCommandInput = DistributiveOmit<AuctionCommand, 'commandId' | 'expectedVersion'>;

export interface UseAuctionRealtimeOptions {
  tournamentId: string;
  initialSnapshot: AuctionSnapshot;
  increments: BidIncrements;
  /** Big screen: read and tick with the live code instead of a session. */
  liveCode?: string;
}

export interface AuctionRealtime {
  snapshot: AuctionSnapshot;
  offsetMs: number;
  connection: ConnectionState;
  /** True when updates arrive over Ably; false while polling. */
  live: boolean;
  refetch: () => void;
  bid: (amount: number, teamId?: string) => Promise<ApiResult<AuctionWriteResponse>>;
  command: (command: AuctionCommandInput) => Promise<ApiResult<AuctionWriteResponse>>;
  /** Called after every applied auction event (sounds, haptics, toasts). */
  onEvent: (listener: (envelope: AuctionEnvelope) => void) => () => void;
}

const AUCTION_TYPES = new Set<string>(AUCTION_EVENT_TYPES);
const isAuctionEnvelope = (e: AnyEnvelope): e is AuctionEnvelope => AUCTION_TYPES.has(e.type);

export function useAuctionRealtime({
  tournamentId,
  initialSnapshot,
  increments,
  liveCode,
}: UseAuctionRealtimeOptions): AuctionRealtime {
  const [store] = useState(() => createAuctionStore(initialSnapshot, increments));
  const snapshot = useStore(store, (s) => s.snapshot);
  const offsetMs = useStore(store, (s) => s.offsetMs);
  const connection = useConnectionState();
  const live = connection === 'connected';
  const listeners = useRef(new Set<(envelope: AuctionEnvelope) => void>());

  // ── Snapshot refetch: single flight, coalescing requests made while one is running ────
  const inflight = useRef(false);
  const again = useRef(false);
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refetch = useCallback((): void => {
    if (inflight.current) {
      again.current = true;
      return;
    }
    inflight.current = true;
    const run = async (): Promise<void> => {
      try {
        do {
          again.current = false;
          const res = await fetchSnapshot(tournamentId, liveCode);
          if (res.ok) store.getState().acceptSnapshot(res.data);
        } while (again.current);
      } finally {
        inflight.current = false;
      }
    };
    void run();
  }, [store, tournamentId, liveCode]);

  const scheduleRefetch = useCallback(
    (delayMs: number): void => {
      if (refetchTimer.current) clearTimeout(refetchTimer.current);
      refetchTimer.current = setTimeout(refetch, delayMs);
    },
    [refetch],
  );

  useEffect(
    () => () => {
      if (refetchTimer.current) clearTimeout(refetchTimer.current);
    },
    [],
  );

  // ── Events ──────────────────────────────────────────────────────────────────────────
  useChannel(auctionChannel(tournamentId), (envelope) => {
    if (!isAuctionEnvelope(envelope) || envelope.tournamentId !== tournamentId) return;
    const { outcome, refetch: needsRefetch } = store.getState().applyEvent(envelope);
    if (outcome === 'applied') listeners.current.forEach((l) => l(envelope));
    if (needsRefetch) scheduleRefetch(outcome === 'gap' ? 0 : 250);
  });
  useChannel(updatesChannel(tournamentId), () => scheduleRefetch(200));

  // Refetch whenever the connection comes back.
  const previous = useRef(connection);
  useEffect(() => {
    if (connection === 'connected' && previous.current !== 'connected') refetch();
    previous.current = connection;
  }, [connection, refetch]);

  // ── Heartbeat / polling ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      const s = store.getState();
      const now = Date.now();
      if (!live) {
        if (now - s.lastUpdateAt >= POLL_WITHOUT_REALTIME_MS) refetch();
        return;
      }
      const lotLive = s.snapshot.status === 'AUCTION_LIVE' && s.snapshot.current !== null;
      if (
        lotLive &&
        now - s.lastEventAt >= HEARTBEAT_SILENCE_MS &&
        now - s.lastUpdateAt >= HEARTBEAT_SILENCE_MS
      ) {
        refetch();
      }
    }, 1_000);
    return () => clearInterval(id);
  }, [store, live, refetch]);

  // ── Tick nudge when the countdown reaches 0 ─────────────────────────────────────────
  const deadline =
    snapshot.status === 'AUCTION_LIVE' ? (snapshot.current?.endsAt ?? snapshot.nextAt) : null;
  useEffect(() => {
    if (!deadline) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;
    const fire = (): void => {
      if (cancelled) return;
      attempts++;
      void postTick(tournamentId, liveCode).then((res) => {
        if (cancelled) return;
        if (res.ok) store.getState().acceptSnapshot(res.data);
        const s = store.getState().snapshot;
        const still = s.status === 'AUCTION_LIVE' && (s.current?.endsAt ?? s.nextAt) === deadline;
        // Clock skew: the server may not consider it due yet. Try again shortly.
        if (still && attempts < TICK_MAX_RETRIES) timer = setTimeout(fire, TICK_RETRY_MS);
      });
    };
    const jitter = 100 + Math.floor(Math.random() * 300);
    timer = setTimeout(fire, msUntil(deadline, store.getState().offsetMs) + jitter);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [deadline, store, tournamentId, liveCode]);

  // ── Actions ─────────────────────────────────────────────────────────────────────────
  const handleWrite = useCallback(
    (res: ApiResult<AuctionWriteResponse>): ApiResult<AuctionWriteResponse> => {
      if (res.ok) store.getState().acceptSnapshot(res.data.snapshot);
      else if (isStaleError(res.error) || res.status === 0) refetch();
      return res;
    },
    [store, refetch],
  );

  const bid = useCallback(
    async (amount: number, teamId?: string) =>
      handleWrite(
        await postBid(tournamentId, {
          amount,
          expectedVersion: store.getState().snapshot.version,
          commandId: newCommandId(),
          ...(teamId ? { teamId } : {}),
        }),
      ),
    [handleWrite, store, tournamentId],
  );

  const command = useCallback(
    async (input: AuctionCommandInput) =>
      handleWrite(
        await postCommand(tournamentId, {
          ...input,
          expectedVersion: store.getState().snapshot.version,
          commandId: newCommandId(),
        } as AuctionCommand),
      ),
    [handleWrite, store, tournamentId],
  );

  const onEvent = useCallback((listener: (envelope: AuctionEnvelope) => void) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  return { snapshot, offsetMs, connection, live, refetch, bid, command, onEvent };
}
