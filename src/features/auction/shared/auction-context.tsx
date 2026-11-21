'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { AuctionSnapshot } from '@/lib/schemas/auction';
import type { TournamentSettings } from '@/lib/schemas/settings';
import { useAuctionRealtime, type AuctionRealtime } from '../realtime/use-auction-realtime';

/**
 * One live auction per screen: wraps `useAuctionRealtime` and shares it with every component
 * below, plus the settings and names the snapshot doesn't carry.
 */
export interface AuctionScreenInfo {
  tournamentId: string;
  tournamentName: string;
  settings: TournamentSettings;
  /** userId → display name (organisers), for the controller banner. */
  organiserNames: Record<string, string>;
  /** teamId → captain user id, for presence dots. */
  captainUserIds: Record<string, string | null>;
}

interface AuctionContextValue extends AuctionRealtime {
  info: AuctionScreenInfo;
}

const AuctionContext = createContext<AuctionContextValue | null>(null);

export interface AuctionProviderProps {
  info: AuctionScreenInfo;
  initialSnapshot: AuctionSnapshot;
  liveCode?: string;
  children: ReactNode;
}

export function AuctionProvider({
  info,
  initialSnapshot,
  liveCode,
  children,
}: AuctionProviderProps) {
  const realtime = useAuctionRealtime({
    tournamentId: info.tournamentId,
    initialSnapshot,
    increments: info.settings.bidIncrements,
    liveCode,
  });
  return (
    <AuctionContext.Provider value={{ ...realtime, info }}>{children}</AuctionContext.Provider>
  );
}

export function useAuction(): AuctionContextValue {
  const value = useContext(AuctionContext);
  if (!value) throw new Error('useAuction must be used inside <AuctionProvider>');
  return value;
}
