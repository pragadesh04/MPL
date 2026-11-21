'use client';

import { useSyncExternalStore } from 'react';

const noop = (): (() => void) => () => undefined;

/**
 * A date-time in the viewer's own time zone ("Sat 6:30 PM"). Rendered only on the client so
 * server and browser time zones never cause a hydration mismatch.
 */
export function LocalTime({ iso, className }: { iso: string; className?: string }) {
  const text = useSyncExternalStore(
    noop,
    () =>
      new Date(iso).toLocaleString(undefined, {
        weekday: 'short',
        hour: 'numeric',
        minute: '2-digit',
      }),
    () => '',
  );
  return (
    <time dateTime={iso} className={className} suppressHydrationWarning>
      {text}
    </time>
  );
}
