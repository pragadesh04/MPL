'use client';

import { useSyncExternalStore } from 'react';

/**
 * Per-device sound preference (header toggle, §7 / §12). Lane B plays auction sounds (Howler)
 * only when `useSoundEnabled()` is true. Stored in localStorage; safe when storage is blocked.
 */
const KEY = 'mpl:sound';
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return window.localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setSoundEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(KEY, enabled ? 'on' : 'off');
  } catch {
    // storage blocked: keep the in-memory default
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSoundEnabled(): boolean {
  return useSyncExternalStore(subscribe, read, () => true);
}
