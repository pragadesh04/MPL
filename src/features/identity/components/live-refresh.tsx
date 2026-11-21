'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { updatesChannel, userChannel } from '@/lib/realtime/channels';
import { useChannel } from '@/lib/realtime/provider';

/**
 * Re-render the Server Component page when `t:<id>:updates` (or my inbox) says something
 * changed: new key sign-ups, claims, approvals, team setups… Debounced so bursts refresh once.
 * The data always comes from the server; events are only a nudge (PLAN §6.3).
 */
export function LiveRefresh({ tournamentId, userId }: { tournamentId?: string; userId?: string }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nudge = (): void => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => router.refresh(), 300);
  };
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  useChannel(tournamentId ? updatesChannel(tournamentId) : null, nudge);
  useChannel(userId ? userChannel(userId) : null, nudge);
  return null;
}
