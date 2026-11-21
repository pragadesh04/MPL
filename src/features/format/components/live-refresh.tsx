'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { updatesChannel } from '@/lib/realtime/channels';
import { useChannel, useConnectionState } from '@/lib/realtime/provider';

/**
 * Re-render the Server Components whenever `t:<id>:updates` fires (match.updated, groups.updated,
 * tournament.status, people/team updates), PLAN §6.3 / §7.10a. Also refreshes after a reconnect so
 * nothing missed while offline stays stale. Renders nothing.
 */
export function LiveRefresh({ tournamentId }: { tournamentId: string }) {
  const router = useRouter();
  const state = useConnectionState();
  const wasConnected = useRef(false);

  useChannel(updatesChannel(tournamentId), () => router.refresh());

  useEffect(() => {
    if (state === 'connected') {
      if (wasConnected.current) router.refresh();
      wasConnected.current = true;
    }
  }, [state, router]);

  return null;
}
