'use client';

import { StateIcon } from '@/components/ui/state-icon';
import { Gavel, Timer, TrophyIcon } from 'lucide-react';
import Image from 'next/image';
import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { MpAmount } from '@/components/ui/mp-amount';
import { formatAmount } from '@/lib/money';
import type { AuctionSnapshot } from '@/lib/schemas/auction';
import { teamStyle } from '@/lib/team-color';
import { cn } from '@/lib/utils';
import { useCountdown } from '../realtime/use-server-clock';
import { CountdownRing } from '../shared/countdown-ring';
import { SoldierPhoto, SquadCard } from '../shared/display';
import { RESULT_REASON_TEXT, findPlayer, findTeam, type AuctionPhase } from '../shared/phase';
import { AnimatedNumber } from './animated-number';

/**
 * The three big-screen stages (§7.7): the live lot (spotlight slide-in, rolling bid counter,
 * pulsing team badge), the closed lot (SOLD / UNSOLD stamp, then the card flies off) and the
 * idle squads grid between lots. Motion respects reduced motion through the parent MotionConfig.
 */

type Team = AuctionSnapshot['teams'][number];
type LastResult = NonNullable<AuctionSnapshot['lastResult']>;

export interface Stamp extends LastResult {
  key: string;
}

function TeamBadge({ team, size }: { team: Team; size: number }) {
  if (team.logoUrl) {
    return (
      <Image
        src={team.logoUrl}
        alt=""
        width={size}
        height={size}
        unoptimized
        className="rounded-md object-cover"
      />
    );
  }
  return <span aria-hidden="true">{team.emoji ?? team.shortName}</span>;
}

// ── Live lot ────────────────────────────────────────────────────────────────────────────

export interface LotStageProps {
  snapshot: AuctionSnapshot;
  offsetMs: number;
  timerSeconds: number;
  paused: boolean;
}

export function LotStage({ snapshot, offsetMs, timerSeconds, paused }: LotStageProps) {
  const lot = snapshot.current;
  const player = findPlayer(snapshot, lot?.playerId);
  if (!lot || !player) return null;
  const leader = findTeam(snapshot, lot.currentTeamId);
  const amount = lot.currentBid ?? lot.nextBid;

  return (
    <motion.section
      aria-label="Soldier on the block"
      initial={{ opacity: 0, x: 240, scale: 0.92 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.1 } }}
      transition={{ type: 'spring', stiffness: 120, damping: 18 }}
      className="relative grid items-center gap-10 lg:grid-cols-[1fr_1.3fr_auto]"
    >
      <motion.div
        aria-hidden="true"
        initial={{ opacity: 0, scale: 0.4 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        className="pointer-events-none absolute -inset-x-10 -top-24 bottom-0 bg-radial-[at_25%_10%] from-foreground/15 via-foreground/5 to-transparent"
      />

      <div className="relative flex flex-col items-center gap-4 text-center">
        <SoldierPhoto
          name={player.name}
          photoUrl={player.photoUrl}
          size="xl"
          className="size-64 text-8xl"
        />
        <div>
          <h2 className="font-display text-6xl tracking-wide">{player.name}</h2>
          {player.ign ? <p className="mt-1 text-2xl text-muted">In-game: {player.ign}</p> : null}
        </div>
        <div className="flex items-center gap-3 text-xl text-muted">
          <span>Base</span>
          {lot.isReauction ? (
            <>
              <span className="line-through">
                <MpAmount value={lot.originalBasePrice} size="lg" />
              </span>
              <MpAmount value={lot.basePrice} size="lg" className="text-amber" />
              <span className="rounded-sm bg-amber/15 px-2 py-1 text-sm font-bold tracking-widest text-amber uppercase">
                Re-auction
              </span>
            </>
          ) : (
            <MpAmount value={lot.basePrice} size="lg" />
          )}
        </div>
      </div>

      <div className="relative flex flex-col items-center gap-6 text-center">
        <span className="text-xl font-bold tracking-[0.3em] text-muted uppercase">
          {lot.currentBid === null ? 'Opening bid' : 'Current bid'}
        </span>
        <div className="flex items-baseline gap-4">
          <AnimatedNumber
            value={amount}
            className="tabular font-numeric text-[10rem] leading-none font-bold"
          />
          <span className="rounded-md bg-lime/15 px-3 py-1 text-3xl font-bold tracking-widest text-lime">
            MP
          </span>
          <span className="sr-only">
            {lot.currentBid === null ? 'Opening bid' : 'Current bid'} {formatAmount(amount)} MP
          </span>
        </div>
        {leader ? (
          <div
            style={teamStyle(leader.color)}
            className="bg-team text-on-team flex items-center gap-4 rounded-xl px-8 py-4 font-display text-4xl tracking-wide shadow-lg"
          >
            <motion.span
              key={`${leader.id}:${lot.currentBid ?? 0}`}
              initial={{ scale: 1.8 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 12 }}
              className="inline-flex"
            >
              <TeamBadge team={leader} size={56} />
            </motion.span>
            <span>
              {leader.name} ({leader.shortName}) leads
            </span>
          </div>
        ) : (
          <p className="text-3xl text-muted">No bids yet</p>
        )}
      </div>

      <div className="relative flex flex-col items-center gap-3">
        <CountdownRing
          deadline={lot.endsAt}
          offsetMs={offsetMs}
          totalSeconds={timerSeconds}
          pausedMs={paused ? snapshot.pausedRemainingMs : null}
          size="lg"
        />
        {paused ? (
          <span className="rounded-full border border-amber/40 bg-amber/10 px-4 py-1 text-lg font-bold tracking-widest text-amber uppercase">
            Paused
          </span>
        ) : null}
      </div>
    </motion.section>
  );
}

// ── Closed lot: the stamp ───────────────────────────────────────────────────────────────

export interface ClosedStageProps {
  snapshot: AuctionSnapshot;
  stamp: Stamp;
}

export function ClosedStage({ snapshot, stamp }: ClosedStageProps) {
  const player = findPlayer(snapshot, stamp.playerId);
  const team = findTeam(snapshot, stamp.teamId);
  const sold = stamp.result === 'SOLD';
  return (
    <motion.section
      aria-label={sold ? 'Sold' : 'Unsold'}
      initial={{ opacity: 1, y: 0, scale: 1 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 420, scale: 0.2, rotate: sold ? -12 : 0 }}
      transition={{ duration: 0.6, ease: 'easeIn' }}
      className="relative mx-auto flex w-full max-w-3xl flex-col items-center gap-5 text-center"
    >
      <div className="relative">
        <SoldierPhoto
          name={player?.name ?? 'Soldier'}
          photoUrl={player?.photoUrl ?? null}
          size="xl"
          className={cn('size-64 text-8xl', !sold && 'grayscale')}
        />
        <motion.div
          initial={{ scale: 3, opacity: 0, rotate: -30 }}
          animate={{ scale: 1, opacity: 1, rotate: -14 }}
          transition={{ type: 'spring', stiffness: 500, damping: 18 }}
          className={cn(
            'absolute inset-0 m-auto grid h-fit w-fit place-items-center rounded-lg border-8 px-8 py-3 font-display text-8xl tracking-widest uppercase',
            sold
              ? 'border-gold bg-background/70 text-gold'
              : 'border-muted bg-background/70 text-muted',
          )}
        >
          {sold ? 'Sold' : 'Unsold'}
        </motion.div>
      </div>
      <h2 className="font-display text-6xl tracking-wide">{player?.name ?? 'Soldier'}</h2>
      {sold && team ? (
        <div
          style={teamStyle(team.color)}
          className="bg-team text-on-team flex items-center gap-4 rounded-xl px-8 py-4 font-display text-4xl tracking-wide"
        >
          <TeamBadge team={team} size={56} />
          <span>
            {team.name} ({team.shortName})
          </span>
          {stamp.price !== null ? <span>· {formatAmount(stamp.price)} MP</span> : null}
        </div>
      ) : (
        <p className="text-3xl text-muted">
          {stamp.reason ? (RESULT_REASON_TEXT[stamp.reason] ?? stamp.reason) : 'No bids'}
        </p>
      )}
    </motion.section>
  );
}

// ── Idle: squads grid ───────────────────────────────────────────────────────────────────

export interface IdleStageProps {
  snapshot: AuctionSnapshot;
  phase: AuctionPhase;
  maxPlayers: number;
  hidePurses: boolean;
  offsetMs: number;
}

export function IdleStage({ snapshot, phase, maxPlayers, hidePurses, offsetMs }: IdleStageProps) {
  return (
    <motion.section
      aria-label="Squads"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-6"
    >
      <IdleHeadline phase={phase} nextAt={snapshot.nextAt} offsetMs={offsetMs} />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
        {snapshot.teams.map((t) => (
          <SquadCard key={t.id} team={t} maxPlayers={maxPlayers} hidePurse={hidePurses} />
        ))}
      </div>
    </motion.section>
  );
}

function IdleHeadline({
  phase,
  nextAt,
  offsetMs,
}: {
  phase: AuctionPhase;
  nextAt: string | null;
  offsetMs: number;
}) {
  const { seconds } = useCountdown(nextAt, offsetMs);
  let icon: ReactNode = <StateIcon icon={Gavel} size="lg" />;
  let text: ReactNode;
  switch (phase) {
    case 'LOBBY':
      text = 'Auction starts soon';
      break;
    case 'BREAK':
      icon = <StateIcon icon={Timer} size="lg" tone="lime" />;
      text = (
        <>
          Next soldier in <span className="tabular font-numeric text-lime">{seconds}</span>…
        </>
      );
      break;
    case 'PAUSED':
      text = 'Auction paused';
      break;
    case 'COMPLETE':
      icon = <TrophyIcon aria-hidden="true" className="size-20 text-gold" />;
      text = 'Auction complete';
      break;
    case 'WAITING':
      text = 'Waiting for the organisers';
      break;
    case 'LOT':
      text = 'Bidding open';
      break;
  }
  return (
    <div className="flex items-center justify-center gap-6">
      {icon}
      <h2 className="font-display text-6xl tracking-wide uppercase">{text}</h2>
    </div>
  );
}
