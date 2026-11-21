'use client';

import type * as Ably from 'ably';
import { useEffect, useState } from 'react';
import { presenceChannel } from '@/lib/realtime/channels';
import { useRealtimeClient } from '@/lib/realtime/provider';

/**
 * Ably presence on `t:<id>:presence` (PLAN §6.3): captains and organisers `enter`, which drives the
 * online dots. Everyone else only watches. The token's clientId is the user id, so the returned set
 * holds user ids. `available` is false without a realtime connection (dots show "unknown").
 */
export function usePresence(
  tournamentId: string,
  opts: { enter: boolean },
): { online: ReadonlySet<string>; available: boolean } {
  const client = useRealtimeClient();
  const [online, setOnline] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    if (!client) return;
    const presence = client.channels.get(presenceChannel(tournamentId)).presence;
    let cancelled = false;
    const refresh = (): void => {
      void presence
        .get()
        .then((members: Ably.PresenceMessage[]) => {
          if (!cancelled) setOnline(new Set(members.map((m) => m.clientId).filter(Boolean)));
        })
        .catch(() => undefined);
    };
    void presence.subscribe(refresh).then(refresh);
    if (opts.enter) void presence.enter().catch(() => undefined);
    return () => {
      cancelled = true;
      presence.unsubscribe(refresh);
      if (opts.enter) void presence.leave().catch(() => undefined);
    };
  }, [client, tournamentId, opts.enter]);

  return { online: client ? online : new Set(), available: client !== null };
}
