'use client';

import { BanIcon, FlagIcon, GavelIcon, PlayIcon, SkipForwardIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { AuctionSnapshot } from '@/lib/schemas/auction';
import { useCountdown } from '../realtime/use-server-clock';
import { CountdownRing } from '../shared/countdown-ring';
import { LastResultStrip, LotCard } from '../shared/display';
import type { AuctionPhase } from '../shared/phase';
import { waitingPool } from './console-state';

interface LotPanelProps {
  snapshot: AuctionSnapshot;
  offsetMs: number;
  phase: AuctionPhase;
  bidTimerSeconds: number;
  canAct: boolean;
  busy: boolean;
  soldBlocked: string | null;
  unsoldBlocked: string | null;
  nextBlocked: string | null;
  onSold: () => void;
  onUnsold: () => void;
  onNext: () => void;
  onPick: (playerId: string) => void;
}

/** Console centre (§7.6): the soldier on the block, the countdown and the lot controls. */
export function LotPanel({
  snapshot,
  offsetMs,
  phase,
  bidTimerSeconds,
  canAct,
  busy,
  soldBlocked,
  unsoldBlocked,
  nextBlocked,
  onSold,
  onUnsold,
  onNext,
  onPick,
}: LotPanelProps) {
  const lot = snapshot.current;
  const paused = snapshot.status === 'AUCTION_PAUSED';
  const pool = waitingPool(snapshot);
  const disabled = !canAct || busy;

  return (
    <section
      aria-label="Soldier on the block"
      className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5"
    >
      {lot ? (
        <div className="flex flex-col items-center gap-6 lg:flex-row lg:items-start lg:justify-center">
          <LotCard snapshot={snapshot} className="flex-1" />
          <div className="flex flex-col items-center gap-2">
            <CountdownRing
              deadline={lot.endsAt}
              offsetMs={offsetMs}
              totalSeconds={bidTimerSeconds}
              pausedMs={paused ? (snapshot.pausedRemainingMs ?? 0) : null}
              size="lg"
              tick
            />
            {paused ? (
              <span className="text-xs font-bold tracking-widest text-amber uppercase">
                Clock frozen
              </span>
            ) : null}
          </div>
        </div>
      ) : (
        <IdleState snapshot={snapshot} offsetMs={offsetMs} phase={phase} />
      )}

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button
          type="button"
          variant="gold"
          size="lg"
          disabled={disabled || soldBlocked !== null}
          title={soldBlocked ?? undefined}
          onClick={onSold}
        >
          <GavelIcon aria-hidden="true" />
          Sold now
        </Button>
        <Button
          type="button"
          variant="outline"
          size="lg"
          disabled={disabled || unsoldBlocked !== null}
          title={unsoldBlocked ?? undefined}
          onClick={onUnsold}
        >
          <BanIcon aria-hidden="true" />
          Mark unsold
        </Button>
        {lot ? null : (
          <Button
            type="button"
            size="lg"
            disabled={disabled || nextBlocked !== null}
            title={nextBlocked ?? undefined}
            onClick={onNext}
          >
            <SkipForwardIcon aria-hidden="true" />
            Next soldier
          </Button>
        )}
      </div>
      {lot && soldBlocked && canAct ? (
        <p className="text-center text-xs text-muted">Sold now: {soldBlocked}.</p>
      ) : null}

      {!lot && pool.length > 0 ? (
        <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
          <span className="text-muted">Pick from the pool</span>
          <Select
            value=""
            disabled={disabled || nextBlocked !== null}
            onValueChange={(id) => {
              if (id) onPick(id);
            }}
          >
            <SelectTrigger aria-label="Pick a soldier from the pool" className="min-w-56">
              <SelectValue placeholder={`${pool.length} waiting…`} />
            </SelectTrigger>
            <SelectContent>
              {pool.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                  {p.ign ? ` · ${p.ign}` : ''} · {p.basePrice} MP
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <LastResultStrip snapshot={snapshot} />
    </section>
  );
}

interface IdleStateProps {
  snapshot: AuctionSnapshot;
  offsetMs: number;
  phase: AuctionPhase;
}

function IdleState({ snapshot, offsetMs, phase }: IdleStateProps) {
  if (phase === 'BREAK') return <BreakCountdown nextAt={snapshot.nextAt} offsetMs={offsetMs} />;
  const copy: Record<AuctionPhase, { title: string; body: string }> = {
    LOBBY: {
      title: 'Ready when you are',
      body: 'Start the auction to put the first soldier on the block.',
    },
    LOT: { title: 'Bidding open', body: '' },
    BREAK: { title: 'Next soldier coming up', body: '' },
    PAUSED: {
      title: 'Paused',
      body:
        snapshot.pausedRemainingMs !== null && snapshot.nextAt
          ? `The break resumes with ${Math.ceil(snapshot.pausedRemainingMs / 1000)} s left.`
          : 'Resume to carry on.',
    },
    WAITING: {
      title: 'Round over. Hold steady',
      body: 'Use Auction again on unsold soldiers, then Start new round, or assign them to a squad.',
    },
    COMPLETE: { title: 'Auction complete', body: 'Every soldier has been dealt with.' },
  };
  const { title, body } = copy[phase];
  const Icon = phase === 'LOBBY' ? PlayIcon : FlagIcon;
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center">
      <Icon className="size-10 text-lime" aria-hidden="true" />
      <h2 className="font-display text-3xl tracking-wide uppercase">{title}</h2>
      {body ? <p className="max-w-md text-sm text-muted">{body}</p> : null}
    </div>
  );
}

interface BreakCountdownProps {
  nextAt: string | null;
  offsetMs: number;
}

function BreakCountdown({ nextAt, offsetMs }: BreakCountdownProps) {
  const { seconds } = useCountdown(nextAt, offsetMs);
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center" aria-live="polite">
      <p className="text-xs tracking-widest text-muted uppercase">Break</p>
      <p className="font-display text-4xl tracking-wide">
        {seconds > 0 ? `Next soldier in ${seconds}…` : 'Next soldier coming up…'}
      </p>
      <p className="text-sm text-muted">Press Next soldier to skip the break.</p>
    </div>
  );
}
