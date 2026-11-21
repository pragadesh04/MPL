'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { FormatPageData, MatchView, PlayerView, TeamView } from '../types';
import { MatchDetailSheet } from './match-detail-sheet';

interface FormatContextValue {
  data: FormatPageData;
  teams: ReadonlyMap<string, TeamView>;
  squads: ReadonlyMap<string, PlayerView[]>;
  matchesById: ReadonlyMap<string, MatchView>;
  openMatch: (matchId: string) => void;
}

const FormatContext = createContext<FormatContextValue | null>(null);

/**
 * Shares one tournament's format data with every match row / tree node on the page and owns the
 * match detail sheet (tap a match → squads, game-by-game results, MVP; organisers also get Mark
 * live / Enter result / Set time there).
 */
export function FormatProvider({ data, children }: { data: FormatPageData; children: ReactNode }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const value = useMemo<FormatContextValue>(() => {
    const squads = new Map<string, PlayerView[]>();
    for (const p of data.players) squads.set(p.teamId, [...(squads.get(p.teamId) ?? []), p]);
    return {
      data,
      teams: new Map(data.teams.map((t) => [t.id, t])),
      squads,
      matchesById: new Map(data.matches.map((m) => [m.id, m])),
      openMatch: setOpenId,
    };
  }, [data]);
  const match = openId ? value.matchesById.get(openId) : undefined;
  return (
    <FormatContext.Provider value={value}>
      {children}
      <MatchDetailSheet match={match} onClose={() => setOpenId(null)} />
    </FormatContext.Provider>
  );
}

export function useFormat(): FormatContextValue {
  const ctx = useContext(FormatContext);
  if (!ctx) throw new Error('useFormat must be used inside <FormatProvider>');
  return ctx;
}
