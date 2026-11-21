'use client';

import { Radio } from 'lucide-react';
import type { MatchView } from '../types';
import { useFormat } from './match-context';
import { TeamSlot } from './team-slot';

/** The live match(es) and the next unplayed match by number (§4.6 "Now playing / Up next"). */
export function nowPlaying(matches: MatchView[]): {
  live: MatchView[];
  next: MatchView | undefined;
} {
  const playable = matches.filter((m) => !m.isBye && m.matchNumber !== null);
  return {
    live: playable.filter((m) => m.status === 'LIVE'),
    next: playable.find((m) => m.status === 'SCHEDULED'),
  };
}

/** Sticky banner at the top of the matches hub (§7.10a). */
export function NowPlayingBanner() {
  const { data, teams, openMatch } = useFormat();
  const { live, next } = nowPlaying(data.matches);
  if (live.length === 0 && !next) return null;

  const item = (m: MatchView, kind: 'live' | 'next') => (
    <button
      key={m.id}
      type="button"
      onClick={() => openMatch(m.id)}
      className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1 text-left hover:bg-surface-2"
    >
      <span
        className={
          kind === 'live'
            ? 'flex items-center gap-1 text-xs font-bold tracking-widest text-blood uppercase'
            : 'text-xs font-bold tracking-widest text-amber uppercase'
        }
      >
        {kind === 'live' ? <Radio className="size-3.5 animate-pulse" aria-hidden /> : null}
        {kind === 'live' ? 'Now playing' : 'Up next'}
      </span>
      <span className="font-numeric text-sm font-bold text-lime">M{m.matchNumber}</span>
      <TeamSlot
        team={m.teamAId ? teams.get(m.teamAId) : undefined}
        label={m.labelA}
        size="sm"
        hideName
      />
      <span className="text-xs text-muted">{m.score ? `${m.score.a}–${m.score.b}` : 'vs'}</span>
      <TeamSlot
        team={m.teamBId ? teams.get(m.teamBId) : undefined}
        label={m.labelB}
        size="sm"
        hideName
      />
    </button>
  );

  return (
    <div className="sticky top-14 z-30 -mx-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-y border-border bg-background/90 px-4 py-2 backdrop-blur">
      {live.map((m) => item(m, 'live'))}
      {next ? item(next, 'next') : null}
    </div>
  );
}
