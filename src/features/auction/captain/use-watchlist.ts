'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';

/**
 * Captain watchlist (§7.8): soldiers starred on this device, per tournament. Stored in
 * localStorage; every read and write is wrapped because storage can be blocked (private mode).
 */
const listeners = new Set<() => void>();
const EMPTY = '[]';

const storageKey = (tournamentId: string): string => `mpl:watchlist:${tournamentId}`;

function readRaw(tournamentId: string): string {
  try {
    return window.localStorage.getItem(storageKey(tournamentId)) ?? EMPTY;
  } catch {
    return EMPTY;
  }
}

function parse(raw: string): string[] {
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent): void => {
    if (e.key?.startsWith('mpl:watchlist:')) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export interface Watchlist {
  starred: ReadonlySet<string>;
  isStarred: (playerId: string) => boolean;
  toggle: (playerId: string) => void;
}

export function useWatchlist(tournamentId: string): Watchlist {
  const raw = useSyncExternalStore(
    subscribe,
    () => readRaw(tournamentId),
    () => EMPTY,
  );
  const starred = useMemo<ReadonlySet<string>>(() => new Set(parse(raw)), [raw]);

  const toggle = useCallback(
    (playerId: string): void => {
      const next = new Set(parse(readRaw(tournamentId)));
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      try {
        window.localStorage.setItem(storageKey(tournamentId), JSON.stringify([...next]));
      } catch {
        // storage blocked: the star just won't stick
      }
      listeners.forEach((l) => l());
    },
    [tournamentId],
  );

  const isStarred = useCallback((playerId: string) => starred.has(playerId), [starred]);
  return { starred, isStarred, toggle };
}
