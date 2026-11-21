'use client';

import { useEffect, useRef } from 'react';
import { useSoundEnabled } from '@/lib/sound';
import { cn } from '@/lib/utils';
import { useCountdown } from '../realtime/use-server-clock';
import { playSound } from './effects';

/**
 * Countdown ring (§7.6): lime, amber at 10 s, red at 5 s, with a tick in the last 5 s. Drawn from
 * the server clock only. `totalSeconds` scales the ring; `paused` freezes it at `pausedMs`.
 */
export function CountdownRing({
  deadline,
  offsetMs,
  totalSeconds,
  pausedMs = null,
  size = 'md',
  tick = false,
  label = 'Time left',
}: {
  deadline: string | null;
  offsetMs: number;
  totalSeconds: number;
  pausedMs?: number | null;
  size?: 'sm' | 'md' | 'lg';
  tick?: boolean;
  label?: string;
}) {
  const live = useCountdown(deadline, offsetMs);
  const ms = pausedMs ?? live.ms;
  const seconds = Math.ceil(ms / 1000);
  const fraction = Math.max(0, Math.min(1, ms / (Math.max(totalSeconds, 1) * 1000)));
  const sound = useSoundEnabled();
  const lastTick = useRef<number | null>(null);

  useEffect(() => {
    if (!tick || !sound || pausedMs !== null) return;
    if (seconds > 0 && seconds <= 5 && lastTick.current !== seconds) {
      lastTick.current = seconds;
      playSound('tick');
    }
  }, [seconds, tick, sound, pausedMs]);

  const tone = seconds <= 5 ? 'text-blood' : seconds <= 10 ? 'text-amber' : 'text-lime';
  const dims = { sm: 'size-16 text-xl', md: 'size-28 text-4xl', lg: 'size-44 text-6xl' }[size];
  const r = 45;
  const c = 2 * Math.PI * r;

  return (
    <div
      role="timer"
      aria-label={`${label}: ${seconds} seconds`}
      className={cn('relative grid place-items-center', dims, tone)}
    >
      <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx="50" cy="50" r={r} className="fill-none stroke-surface-2" strokeWidth="8" />
        <circle
          cx="50"
          cy="50"
          r={r}
          className="fill-none stroke-current transition-[stroke-dashoffset] duration-200 ease-linear"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - fraction)}
          // Clock-derived: the server render and hydration differ by a few ms; the next 250 ms
          // tick replaces it.
          suppressHydrationWarning
        />
      </svg>
      <span className="tabular font-numeric font-bold" suppressHydrationWarning>
        {seconds}
      </span>
    </div>
  );
}
