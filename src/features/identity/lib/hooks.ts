'use client';

import { useEffect, useState } from 'react';
import { normalizeKey } from '@/lib/rules/keys';
import { api } from './api';

/** Debounce a changing value. */
export function useDebounced<T>(value: T, ms = 400): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

export type Availability =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available' }
  | { state: 'taken'; reason: string };

/** Live username availability (GET /api/auth/username-available). */
export function useUsernameAvailability(username: string): Availability {
  const debounced = useDebounced(username.trim());
  const [result, setResult] = useState<{ for: string; value: Availability } | null>(null);

  useEffect(() => {
    if (debounced.length < 3) return;
    let active = true;
    api<{ available: boolean; reason?: string }>(
      `/api/auth/username-available?u=${encodeURIComponent(debounced)}`,
    )
      .then((r) => {
        if (!active) return;
        setResult({
          for: debounced,
          value: r.available
            ? { state: 'available' }
            : { state: 'taken', reason: r.reason ?? 'Not available' },
        });
      })
      .catch(() => active && setResult(null));
    return () => {
      active = false;
    };
  }, [debounced]);

  if (username.trim().length < 3) return { state: 'idle' };
  if (result?.for === username.trim()) return result.value;
  return { state: 'checking' };
}

export interface KeyPreviewData {
  organiserName: string;
  tournamentName: string | null;
  canJoin: boolean;
  message: string | null;
}

export type KeyLookup =
  | { state: 'empty' }
  | { state: 'incomplete' }
  | { state: 'checking' }
  | { state: 'invalid' }
  | { state: 'found'; key: string; preview: KeyPreviewData };

/** Live organiser-key preview (GET /api/organiser-keys/:key) for sign-up and "Join with a key". */
export function useOrganiserKeyPreview(input: string): KeyLookup {
  const key = normalizeKey(input);
  const debounced = useDebounced(key, 300);
  const [result, setResult] = useState<{ key: string; value: KeyLookup } | null>(null);

  useEffect(() => {
    if (!debounced) return;
    let active = true;
    api<KeyPreviewData>(`/api/organiser-keys/${debounced}`)
      .then((preview) => {
        if (active)
          setResult({ key: debounced, value: { state: 'found', key: debounced, preview } });
      })
      .catch(() => {
        // 404 (unknown key) and 429 both read as "couldn't find that key".
        if (active) setResult({ key: debounced, value: { state: 'invalid' } });
      });
    return () => {
      active = false;
    };
  }, [debounced]);

  if (input.trim() === '') return { state: 'empty' };
  if (!key) return { state: 'incomplete' };
  if (result?.key === key) return result.value;
  return { state: 'checking' };
}

/** "rv7k2p" → "RV7-K2P" while typing (dash optional, case-insensitive). */
export function formatKeyInput(raw: string): string {
  const cleaned = raw
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()
    .slice(0, 6);
  return cleaned.length > 3 ? `${cleaned.slice(0, 3)}-${cleaned.slice(3)}` : cleaned;
}
