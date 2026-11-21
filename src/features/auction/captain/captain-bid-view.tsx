'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { ChevronDownIcon, StarIcon, TrophyIcon, WifiOffIcon } from 'lucide-react';
import { JetpackSoldier } from '@/components/mascots/jetpack-soldier';
import { Button } from '@/components/ui/button';
import { MpAmount } from '@/components/ui/mp-amount';
import { toast } from '@/components/ui/sonner';
import { StatusPill } from '@/components/ui/status-pill';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatAmount } from '@/lib/money';
import type { ConnectionState } from '@/lib/realtime/provider';
import type { AuctionSnapshot } from '@/lib/schemas/auction';
import { useSoundEnabled } from '@/lib/sound';
import { teamStyle } from '@/lib/team-color';
import { cn } from '@/lib/utils';
import { useCountdown, useServerNow } from '../realtime/use-server-clock';
import { usePresence } from '../realtime/use-presence';
import { useAuction } from '../shared/auction-context';
import { CountdownRing } from '../shared/countdown-ring';
import { BidHistory, LastResultStrip, LotCard, SoldierPhoto, SquadCard } from '../shared/display';
import { haptic, playSound } from '../shared/effects';
import { auctionPhase, findPlayer, teamBidState } from '../shared/phase';
import type { AuctionViewer } from '../shared/types';
import { BidPanel } from './bid-panel';
import { CaptainLobby } from './captain-lobby';
import { useWatchlist } from './use-watchlist';

/**
 * Captain phone bidding view (PLAN §7.8): the main way to bid. Team-colour header, lobby with a
 * connection test, the live lot and the BID button, outbid alerts, status screens, bid history
 * and the My squad / Watchlist / All teams tabs. Rendered inside `<AuctionProvider>`.
 */

/** Ably states where bids can't reach anyone. 'disabled' (no Ably key) polls, so bids work. */
const OFFLINE_STATES: ReadonlySet<ConnectionState> = new Set([
  'disconnected',
  'suspended',
  'failed',
  'closing',
  'closed',
]);

export interface CaptainBidViewProps {
  viewer: AuctionViewer;
  teamId: string;
}

export function CaptainBidView({ teamId }: CaptainBidViewProps) {
  const { snapshot, offsetMs, connection, bid, onEvent, info } = useAuction();
  const { settings, tournamentId, captainUserIds } = info;
  const serverNow = useServerNow(offsetMs);
  const presence = usePresence(tournamentId, { enter: true });
  const watchlist = useWatchlist(tournamentId);
  const sound = useSoundEnabled();

  const phase = auctionPhase(snapshot);
  const team = snapshot.teams.find((t) => t.id === teamId) ?? null;
  const lot = snapshot.current;
  const offline = OFFLINE_STATES.has(connection);
  const bidState = teamBidState(snapshot, teamId, settings, serverNow);
  const leading = lot !== null && lot.currentTeamId === teamId;

  // ── Outbid alert: the lead moved from my team to another one ────────────────────────
  // Fed by `bid.placed` events (instant) and by snapshot changes (polling without Ably);
  // the ref makes the two paths idempotent.
  const leaderRef = useRef<{ playerId: string; teamId: string | null } | null>(null);
  const soundRef = useRef(sound);
  const starredRef = useRef(watchlist.starred);
  useEffect(() => {
    soundRef.current = sound;
    starredRef.current = watchlist.starred;
  });

  const noteLeaderRef = useRef((playerId: string, leaderTeamId: string | null): void => {
    const prev = leaderRef.current;
    leaderRef.current = { playerId, teamId: leaderTeamId };
    if (prev && prev.playerId === playerId && prev.teamId === teamId && leaderTeamId !== teamId) {
      haptic();
      if (soundRef.current) playSound('outbid');
      toast.warning('Outbid!', { description: 'Another team took the lead.' });
    }
  });

  const lotPlayerId = lot?.playerId ?? null;
  const lotLeader = lot?.currentTeamId ?? null;
  useEffect(() => {
    if (lotPlayerId) noteLeaderRef.current(lotPlayerId, lotLeader);
  }, [lotPlayerId, lotLeader]);

  useEffect(
    () =>
      onEvent((envelope) => {
        if (envelope.type === 'bid.placed') {
          noteLeaderRef.current(envelope.data.playerId, envelope.data.teamId);
        }
      }),
    [onEvent],
  );

  // ── Watchlist alert: a starred soldier's lot opened ──────────────────────────────────
  const lotKey = lot ? `${lot.playerId}:${snapshot.round}` : null;
  const lastLotKey = useRef<string | null>(lotKey);
  useEffect(() => {
    if (lotKey === lastLotKey.current) return;
    lastLotKey.current = lotKey;
    if (!lotKey || !lotPlayerId || !starredRef.current.has(lotPlayerId)) return;
    const player = findPlayer(snapshot, lotPlayerId);
    toast.info(`${player?.name ?? 'A starred soldier'} is on the block!`, {
      description: 'From your watchlist.',
    });
    if (soundRef.current) playSound('open');
  }, [lotKey, lotPlayerId, snapshot]);

  return (
    <div className="mx-auto w-full max-w-md space-y-4 pb-10">
      <ConnectionBanner connection={connection} offline={offline} />

      {team ? (
        <header
          style={teamStyle(team.color)}
          className="bg-team text-on-team flex items-center gap-3 rounded-lg px-4 py-3"
        >
          {team.emoji ? (
            <span aria-hidden="true" className="text-3xl">
              {team.emoji}
            </span>
          ) : null}
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-xl tracking-wide">{team.name}</h1>
            <p className="text-xs font-bold tracking-widest uppercase opacity-80">
              {team.shortName} · Captain {team.captainName}
            </p>
          </div>
          <dl className="grid shrink-0 grid-cols-2 gap-3 text-right">
            <div>
              <dt className="text-[0.625rem] font-bold tracking-widest uppercase opacity-80">
                MP left
              </dt>
              <dd className="tabular font-numeric text-2xl leading-none font-bold">
                {formatAmount(team.purseRemaining)}
              </dd>
            </div>
            <div>
              <dt className="text-[0.625rem] font-bold tracking-widest uppercase opacity-80">
                Squad
              </dt>
              <dd className="tabular font-numeric text-2xl leading-none font-bold">
                {team.squadSize}/{settings.maxPlayersPerTeam}
              </dd>
            </div>
          </dl>
        </header>
      ) : null}

      {phase === 'LOBBY' ? (
        <CaptainLobby
          snapshot={snapshot}
          captainUserIds={captainUserIds}
          online={presence.online}
          presenceAvailable={presence.available}
          myTeamId={teamId}
        />
      ) : null}

      {(phase === 'LOT' || phase === 'PAUSED') && lot ? (
        <section
          aria-label="Soldier on the block"
          className={cn(
            'space-y-4 rounded-lg border bg-surface p-4 transition-shadow',
            leading ? 'animate-pulse-glow border-lime shadow-glow' : 'border-border',
          )}
        >
          <div className="flex items-center justify-between gap-2">
            {phase === 'PAUSED' ? (
              <StatusPill tone="amber">Paused</StatusPill>
            ) : leading ? (
              <StatusPill tone="lime" live>
                You&apos;re winning
              </StatusPill>
            ) : (
              <StatusPill tone="lime" live>
                Bidding open
              </StatusPill>
            )}
            <CountdownRing
              deadline={lot.endsAt}
              offsetMs={offsetMs}
              totalSeconds={settings.bidTimerSeconds}
              pausedMs={phase === 'PAUSED' ? snapshot.pausedRemainingMs : null}
              size="sm"
              tick={phase === 'LOT' && sound}
            />
          </div>
          {phase === 'PAUSED' ? (
            <p role="status" className="text-center font-semibold text-amber">
              The admin paused the auction. Hold your position.
            </p>
          ) : null}
          <LotCard snapshot={snapshot} />
          <BidPanel
            snapshot={snapshot}
            state={bidState}
            settings={settings}
            offline={offline}
            bid={bid}
          />
        </section>
      ) : null}

      {phase === 'PAUSED' && !lot ? (
        <StatusScreen title="Auction paused">
          The admin paused the auction. Hold your position.
        </StatusScreen>
      ) : null}

      {phase === 'BREAK' ? <BreakScreen nextAt={snapshot.nextAt} offsetMs={offsetMs} /> : null}

      {phase === 'WAITING' ? (
        <StatusScreen title="Waiting for the organisers">
          This round is done. The organisers are deciding what happens next.
        </StatusScreen>
      ) : null}

      {phase === 'COMPLETE' ? (
        <StatusScreen title="Auction complete" mascot="cheer">
          Every soldier has been placed. Check your squad below.
        </StatusScreen>
      ) : null}

      {phase !== 'LOBBY' ? <LastResultStrip snapshot={snapshot} /> : null}

      {lot ? (
        <details className="group rounded-lg border border-border bg-surface">
          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-bold tracking-widest uppercase">
            Bid history
            <ChevronDownIcon
              aria-hidden="true"
              className="size-4 transition-transform group-open:rotate-180"
            />
          </summary>
          <div className="px-4 pb-4">
            <BidHistory snapshot={snapshot} playerId={lot.playerId} />
          </div>
        </details>
      ) : null}

      <Tabs defaultValue="squad">
        <TabsList className="w-full">
          <TabsTrigger value="squad">My squad</TabsTrigger>
          <TabsTrigger value="watchlist">Watchlist</TabsTrigger>
          <TabsTrigger value="teams">All teams</TabsTrigger>
        </TabsList>
        <TabsContent value="squad">
          {team ? (
            <SquadCard team={team} maxPlayers={settings.maxPlayersPerTeam} highlight />
          ) : (
            <p className="text-sm text-muted">Your team isn&apos;t in this auction.</p>
          )}
        </TabsContent>
        <TabsContent value="watchlist">
          <WatchlistPanel
            pool={snapshot.pool}
            onBlockId={lot?.playerId ?? null}
            isStarred={watchlist.isStarred}
            toggle={watchlist.toggle}
          />
        </TabsContent>
        <TabsContent value="teams" className="space-y-3">
          {snapshot.teams.map((t) => (
            <SquadCard
              key={t.id}
              team={t}
              maxPlayers={settings.maxPlayersPerTeam}
              highlight={t.id === teamId}
            />
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ConnectionBanner({
  connection,
  offline,
}: {
  connection: ConnectionState;
  offline: boolean;
}) {
  if (connection === 'connected' || connection === 'disabled') return null;
  return (
    <div
      role="alert"
      className={cn(
        'flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold',
        offline
          ? 'border-blood/50 bg-blood/15 text-blood'
          : 'border-amber/40 bg-amber/10 text-amber',
      )}
    >
      <WifiOffIcon className="size-4 shrink-0" aria-hidden="true" />
      {offline
        ? 'Connection lost. Reconnecting… Bidding is off until you are back online.'
        : 'Connecting to the live auction…'}
    </div>
  );
}

function StatusScreen({
  title,
  mascot = 'idle',
  children,
}: {
  title: string;
  mascot?: 'idle' | 'cheer';
  children: ReactNode;
}) {
  return (
    <section
      aria-live="polite"
      className="flex flex-col items-center gap-3 rounded-lg border border-border bg-surface p-6 text-center"
    >
      {mascot === 'cheer' ? (
        <TrophyIcon className="size-10 text-gold" aria-hidden="true" />
      ) : (
        <JetpackSoldier pose="idle" className="h-24 w-auto" />
      )}
      <h2 className="font-display text-2xl tracking-wide uppercase">{title}</h2>
      <p className="text-sm text-muted">{children}</p>
    </section>
  );
}

function BreakScreen({ nextAt, offsetMs }: { nextAt: string | null; offsetMs: number }) {
  const { seconds } = useCountdown(nextAt, offsetMs);
  return (
    <section
      aria-live="polite"
      className="flex flex-col items-center gap-2 rounded-lg border border-border bg-surface p-6 text-center"
    >
      <JetpackSoldier pose="flying" className="h-20 w-auto" />
      <h2 className="font-display text-2xl tracking-wide uppercase">
        Next soldier in <span className="tabular font-numeric text-lime">{seconds}</span>…
      </h2>
    </section>
  );
}

interface WatchlistPanelProps {
  pool: AuctionSnapshot['pool'];
  onBlockId: string | null;
  isStarred: (playerId: string) => boolean;
  toggle: (playerId: string) => void;
}

function WatchlistPanel({ pool, onBlockId, isStarred, toggle }: WatchlistPanelProps) {
  if (pool.length === 0) {
    return <p className="text-sm text-muted">No soldiers left in the waiting pool.</p>;
  }
  const sorted = [...pool].sort((a, b) => Number(isStarred(b.id)) - Number(isStarred(a.id)));
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted">Star soldiers to get an alert when they come up.</p>
      <ul className="space-y-1.5">
        {sorted.map((p) => {
          const starred = isStarred(p.id);
          return (
            <li
              key={p.id}
              className="flex items-center gap-2 rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
            >
              <SoldierPhoto name={p.name} photoUrl={p.photoUrl} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate">{p.name}</p>
                {p.ign ? <p className="truncate text-xs text-muted">In-game: {p.ign}</p> : null}
              </div>
              {p.id === onBlockId ? (
                <StatusPill tone="lime" live>
                  On the block
                </StatusPill>
              ) : null}
              <MpAmount value={p.basePrice} size="sm" />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-pressed={starred}
                aria-label={starred ? `Remove ${p.name} from watchlist` : `Star ${p.name}`}
                onClick={() => toggle(p.id)}
              >
                <StarIcon
                  aria-hidden="true"
                  className={cn('size-5', starred ? 'fill-gold text-gold' : 'text-muted')}
                />
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
