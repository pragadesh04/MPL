'use client';

import { StateIcon } from '@/components/ui/state-icon';
import {
  GavelIcon,
  HourglassIcon,
  Info,
  ShieldQuestionIcon,
  ShuffleIcon,
  UsersIcon,
} from 'lucide-react';
import { StatusPill } from '@/components/ui/status-pill';
import { TeamChip } from '@/components/ui/team-chip';
import { formatAmount } from '@/lib/money';
import { teamStyle } from '@/lib/team-color';
import { cn } from '@/lib/utils';
import { useCountdown } from '../realtime/use-server-clock';
import { useAuction } from '../shared/auction-context';
import { CountdownRing } from '../shared/countdown-ring';
import { LastResultStrip, LotCard, SquadCard } from '../shared/display';
import { PHASE_TEXT, auctionPhase } from '../shared/phase';
import { soldierStatus, type SoldierStatus } from './soldier-status';

/**
 * Soldier status card (PLAN §7.5) and the soldier's auction page. The card is self-contained
 * inside an `<AuctionProvider>`, so the soldier portal can reuse it: it reads the live snapshot
 * and changes as the soldier goes from the pool to the block to a squad (or the unsold list).
 */

const mp = (value: number): string => `${formatAmount(value)} MP`;

export interface SoldierStatusCardProps {
  playerId: string;
}

export function SoldierStatusCard({ playerId }: SoldierStatusCardProps) {
  const { snapshot, offsetMs, info } = useAuction();
  const status = soldierStatus(snapshot, playerId);
  const team = status.kind === 'IN_SQUAD' ? status.team : null;

  return (
    <section
      aria-label="My auction status"
      aria-live="polite"
      style={team ? teamStyle(team.color) : undefined}
      className={cn(
        'overflow-hidden rounded-lg border bg-surface',
        team
          ? 'border-team'
          : status.kind === 'ON_BLOCK'
            ? 'border-lime shadow-glow'
            : 'border-border',
      )}
    >
      {team ? <div className="bg-team h-1.5" aria-hidden="true" /> : null}
      <div className="space-y-4 p-4">
        <StatusBody
          status={status}
          offsetMs={offsetMs}
          timerSeconds={info.settings.bidTimerSeconds}
          pausedMs={snapshot.pausedRemainingMs}
        />
        {team ? (
          <SquadCard team={team} maxPlayers={info.settings.maxPlayersPerTeam} highlight />
        ) : null}
      </div>
    </section>
  );
}

function StatusBody({
  status,
  offsetMs,
  timerSeconds,
  pausedMs,
}: {
  status: SoldierStatus;
  offsetMs: number;
  timerSeconds: number;
  pausedMs: number | null;
}) {
  switch (status.kind) {
    case 'ON_BLOCK': {
      const amount = status.currentBid ?? status.nextBid;
      return (
        <div className="flex items-center gap-4">
          <div className="min-w-0 flex-1 space-y-1">
            <StatusPill tone="lime" live>
              {status.paused ? 'Paused' : 'Live'}
            </StatusPill>
            <h2 className="font-display text-2xl tracking-wide">You&apos;re on the block!</h2>
            <p className="text-sm">
              {status.currentBid === null
                ? `Opening bid ${mp(amount)} · no bids yet`
                : `Current bid ${mp(amount)}${status.leader ? ` (${status.leader.name})` : ''}`}
            </p>
            {status.leader ? (
              <TeamChip
                name={status.leader.name}
                shortName={status.leader.shortName}
                color={status.leader.color}
                size="sm"
              />
            ) : null}
          </div>
          <CountdownRing
            deadline={status.endsAt}
            offsetMs={offsetMs}
            totalSeconds={timerSeconds}
            pausedMs={status.paused ? pausedMs : null}
            size="sm"
          />
        </div>
      );
    }
    case 'IN_SQUAD': {
      const { team, member } = status;
      const headline =
        member.acquiredVia === 'AUCTION' ? (
          <>
            You have been drafted to <strong className="text-team">{team.name}</strong> (
            {mp(member.price)})
          </>
        ) : member.acquiredVia === 'AUTO_ALLOCATED' ? (
          <>Auto-assigned to {team.name}</>
        ) : member.acquiredVia === 'RANDOM_SQUAD' ? (
          <>Sent to {team.name} by random draw</>
        ) : (
          <>Picked for {team.name} by the organisers</>
        );
      const Icon =
        member.acquiredVia === 'AUCTION'
          ? GavelIcon
          : member.acquiredVia === 'RANDOM_SQUAD'
            ? ShuffleIcon
            : UsersIcon;
      return (
        <div className="flex items-start gap-3">
          <Icon className="text-team mt-1 size-6 shrink-0" aria-hidden="true" />
          <div className="min-w-0 space-y-1.5">
            <p className="font-display text-xl leading-snug tracking-wide">{headline}</p>
            <TeamChip name={team.name} shortName={team.shortName} color={team.color} size="sm" />
          </div>
        </div>
      );
    }
    case 'UNSOLD':
      return (
        <div className="flex items-start gap-3">
          <ShieldQuestionIcon className="mt-1 size-6 shrink-0 text-amber" aria-hidden="true" />
          <p className="text-base">
            You are on the unsold list for now. The admin can still put you in a squad, so stay
            tuned.
          </p>
        </div>
      );
    case 'POOL':
      return (
        <div className="flex items-start gap-3">
          <HourglassIcon className="mt-1 size-6 shrink-0 text-sand" aria-hidden="true" />
          <p className="text-base">
            In the waiting pool · base price {mp(status.player.basePrice)}
          </p>
        </div>
      );
    case 'UNKNOWN':
      return (
        <div className="flex items-center gap-3">
          <StateIcon icon={Info} size="sm" />
          <p className="text-sm text-muted">
            Your auction status shows here once you are in the auction.
          </p>
        </div>
      );
  }
}

export interface SoldierAuctionViewProps {
  playerId: string;
}

/** The soldier's auction page: the status card, a read-only live lot and every squad. */
export function SoldierAuctionView({ playerId }: SoldierAuctionViewProps) {
  const { snapshot, offsetMs, info } = useAuction();
  const phase = auctionPhase(snapshot);
  const myTeamId = snapshot.teams.find((t) => t.members.some((m) => m.playerId === playerId))?.id;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 pb-10">
      <SoldierStatusCard playerId={playerId} />

      <section
        aria-labelledby="live-lot-title"
        className="space-y-3 rounded-lg border border-border bg-surface p-4"
      >
        <div className="flex items-center justify-between gap-2">
          <h2
            id="live-lot-title"
            className="text-sm font-bold tracking-widest text-muted uppercase"
          >
            Live auction
          </h2>
          <StatusPill
            tone={phase === 'LOT' ? 'lime' : phase === 'PAUSED' ? 'amber' : 'neutral'}
            live={phase === 'LOT'}
          >
            {PHASE_TEXT[phase]}
          </StatusPill>
        </div>
        {snapshot.current ? (
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center sm:gap-10">
            <LotCard snapshot={snapshot} />
            <CountdownRing
              deadline={snapshot.current.endsAt}
              offsetMs={offsetMs}
              totalSeconds={info.settings.bidTimerSeconds}
              pausedMs={phase === 'PAUSED' ? snapshot.pausedRemainingMs : null}
            />
          </div>
        ) : phase === 'BREAK' ? (
          <BreakLine nextAt={snapshot.nextAt} offsetMs={offsetMs} />
        ) : (
          <p className="text-center text-sm text-muted">{PHASE_TEXT[phase]}</p>
        )}
        <LastResultStrip snapshot={snapshot} />
      </section>

      <section aria-labelledby="squads-title" className="space-y-3">
        <h2 id="squads-title" className="text-sm font-bold tracking-widest text-muted uppercase">
          Squads
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {snapshot.teams.map((t) => (
            <SquadCard
              key={t.id}
              team={t}
              maxPlayers={info.settings.maxPlayersPerTeam}
              highlight={t.id === myTeamId}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function BreakLine({ nextAt, offsetMs }: { nextAt: string | null; offsetMs: number }) {
  const { seconds } = useCountdown(nextAt, offsetMs);
  return (
    <p className="text-center font-display text-2xl tracking-wide uppercase">
      Next soldier in <span className="tabular font-numeric text-lime">{seconds}</span>…
    </p>
  );
}
