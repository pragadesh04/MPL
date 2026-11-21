'use client';

import { useEffect, useState } from 'react';
import { msUntil, serverTime } from '@/lib/realtime/clock';

/** Server time (ms), re-rendering every `intervalMs`. Countdowns are drawn from this only. */
export function useServerNow(offsetMs: number, intervalMs = 250): number {
  const [now, setNow] = useState(() => serverTime(offsetMs));
  useEffect(() => {
    const id = setInterval(() => setNow(serverTime(offsetMs)), intervalMs);
    return () => clearInterval(id);
  }, [offsetMs, intervalMs]);
  return now;
}

/** Whole seconds left until an ISO deadline by the server clock (0 when passed / null). */
export function useCountdown(
  deadlineIso: string | null,
  offsetMs: number,
): { ms: number; seconds: number } {
  useServerNow(offsetMs);
  const ms = msUntil(deadlineIso, offsetMs);
  return { ms, seconds: Math.ceil(ms / 1000) };
}
