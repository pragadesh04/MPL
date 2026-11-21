'use client';

import * as Ably from 'ably';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { parseEnvelope, type AnyEnvelope } from '../schemas/realtime';

/**
 * Browser side of real-time (PLAN §6.3). Browsers ONLY subscribe; every action is an HTTP
 * request. Tokens come from POST /api/realtime/token (subscribe-only, limited to the user's
 * tournaments, or one tournament for a big-screen `liveCode`).
 *
 * <RealtimeProvider enabled={…}> wraps the app shell and the big screen. `enabled` comes from
 * the server (false when ABLY_API_KEY is missing), so nothing tries to connect in that case.
 *
 * Auction ordering (apply only `version === local + 1`, refetch the snapshot on gaps, on
 * reconnect and after 10 s of silence) is Lane B's job in src/features/auction/realtime/**,
 * built on `useChannel` + `useConnectionState` below.
 */

export type ConnectionState = Ably.ConnectionState | 'disabled';

interface RealtimeContextValue {
  client: Ably.Realtime | null;
  state: ConnectionState;
}

const RealtimeContext = createContext<RealtimeContextValue>({ client: null, state: 'disabled' });

export interface RealtimeProviderProps {
  enabled: boolean;
  /** Big-screen viewers authenticate with the tournament's live code instead of a session. */
  liveCode?: string;
  children: ReactNode;
}

export function RealtimeProvider({ enabled, liveCode, children }: RealtimeProviderProps) {
  const [value, setValue] = useState<RealtimeContextValue>({ client: null, state: 'disabled' });

  useEffect(() => {
    if (!enabled) return;
    const client = new Ably.Realtime({
      authCallback: (_params, callback) => {
        fetch('/api/realtime/token', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(liveCode ? { liveCode } : {}),
          credentials: 'same-origin',
        })
          .then(async (res) => {
            if (!res.ok) throw new Error(`token request failed: ${res.status}`);
            callback(null, (await res.json()) as Ably.TokenRequest);
          })
          .catch((err: unknown) => callback(String(err), null));
      },
      // Echo is irrelevant (clients never publish) but keep the connection lean.
      echoMessages: false,
    });
    const onState = (change: Ably.ConnectionStateChange): void =>
      setValue({ client, state: change.current });
    client.connection.on(onState);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- publish the new client once created
    setValue({ client, state: client.connection.state });
    return () => {
      client.connection.off(onState);
      client.close();
      setValue({ client: null, state: 'disabled' });
    };
  }, [enabled, liveCode]);

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

/** The Ably client (null when disabled / not yet created). Lane B uses it for presence. */
export function useRealtimeClient(): Ably.Realtime | null {
  return useContext(RealtimeContext).client;
}

/** 'connected' | 'connecting' | 'disconnected' | … | 'disabled'. */
export function useConnectionState(): ConnectionState {
  return useContext(RealtimeContext).state;
}

/**
 * Subscribe to one channel (use the helpers in ./channels for the name). The handler receives
 * validated envelopes only; unknown or malformed messages are dropped. Pass `null` to pause.
 * The latest handler is always used, so it doesn't need to be memoised.
 */
export function useChannel(
  channelName: string | null,
  handler: (envelope: AnyEnvelope) => void,
): void {
  const client = useRealtimeClient();
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    if (!client || !channelName) return;
    const channel = client.channels.get(channelName);
    const listener = (message: Ably.InboundMessage): void => {
      const envelope = parseEnvelope(message.data);
      if (envelope) handlerRef.current(envelope);
    };
    void channel.subscribe(listener);
    return () => {
      channel.unsubscribe(listener);
    };
  }, [client, channelName]);
}
