'use client';

import { useSyncExternalStore } from 'react';
import { DrawCeremony } from './draw-ceremony';
import type { GroupView, TeamView } from '../types';

const noop = (): (() => void) => () => undefined;

function storageKey(tournamentId: string, groups: GroupView[]): string {
  // A redraw creates new group ids, so it plays again.
  return `mpl:draw-seen:${tournamentId}:${groups.map((g) => g.id).join(',')}`;
}

function readSeen(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    return true;
  }
}

/**
 * The draw ceremony, auto-played the first time this device sees a given draw and shown fully
 * revealed (with "Replay draw") afterwards.
 */
export function CeremonyOnce({
  tournamentId,
  groups,
  teams,
  large,
}: {
  tournamentId: string;
  groups: GroupView[];
  teams: TeamView[];
  large?: boolean;
}) {
  const key = storageKey(tournamentId, groups);
  const seen = useSyncExternalStore(
    noop,
    () => readSeen(key),
    () => true,
  );

  // Marked only once the reveal finishes, so a live refresh mid-ceremony doesn't cut it short.
  const markSeen = (): void => {
    try {
      window.localStorage.setItem(key, '1');
    } catch {
      // storage blocked: it just plays again next time
    }
  };

  return (
    <DrawCeremony
      key={seen ? 'seen' : 'new'}
      groups={groups}
      teams={teams}
      autoPlay={!seen}
      large={large}
      onFinished={seen ? undefined : markSeen}
    />
  );
}
