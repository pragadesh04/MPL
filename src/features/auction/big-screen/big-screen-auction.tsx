'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { EyeOffIcon, Volume2Icon, VolumeXIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusPill, type StatusPillTone } from '@/components/ui/status-pill';
import { setSoundEnabled, useSoundEnabled } from '@/lib/sound';
import { teamStyle } from '@/lib/team-color';
import { cn } from '@/lib/utils';
import { useCountdown } from '../realtime/use-server-clock';
import { useAuction } from '../shared/auction-context';
import { celebrateSale, playSound } from '../shared/effects';
import { PHASE_TEXT, auctionPhase, findTeam, type AuctionPhase } from '../shared/phase';
import { ClosedStage, IdleStage, LotStage, type Stamp } from './big-screen-stage';
import { BigScreenTicker } from './big-screen-ticker';

/**
 * Big screen / projector auction (PLAN §7.7): full-screen, cinematic, read-only, no login.
 * New lots slide in under a spotlight; each bid rolls the counter and floods the background with
 * the leading team's colour; SOLD slams a stamp (confetti + gavel) and the card flies off;
 * between lots the squads grid shows. Rendered inside `<AuctionProvider liveCode=…>`.
 */

/** How long the SOLD / UNSOLD stamp stays up when no new lot replaces it. */
const STAMP_MS = 3_500;

const PHASE_TONE: Record<AuctionPhase, StatusPillTone> = {
  LOBBY: 'sand',
  LOT: 'lime',
  BREAK: 'gold',
  PAUSED: 'amber',
  WAITING: 'neutral',
  COMPLETE: 'gold',
};

export function BigScreenAuction() {
  const { snapshot, offsetMs, info } = useAuction();
  const { settings, tournamentName } = info;
  const phase = auctionPhase(snapshot);
  const sound = useSoundEnabled();
  const [hidePurses, setHidePurses] = useState(false);

  // ── SOLD / UNSOLD stamp: shown when lastResult changes (not for the result already there) ─
  const r = snapshot.lastResult;
  const resultKey = r ? `${r.playerId}:${r.result}:${r.teamId ?? ''}:${r.price ?? ''}` : null;
  const [seenKey, setSeenKey] = useState(resultKey);
  const [stamp, setStamp] = useState<Stamp | null>(null);
  if (resultKey !== seenKey) {
    setSeenKey(resultKey);
    setStamp(r && resultKey ? { ...r, key: resultKey } : null);
  }

  const soundRef = useRef(sound);
  const teamsRef = useRef(snapshot.teams);
  useEffect(() => {
    soundRef.current = sound;
    teamsRef.current = snapshot.teams;
  });
  const celebrated = useRef<string | null>(null);
  useEffect(() => {
    if (!stamp) return;
    if (celebrated.current !== stamp.key) {
      celebrated.current = stamp.key;
      if (stamp.result === 'SOLD') {
        const buyer = teamsRef.current.find((t) => t.id === stamp.teamId);
        if (buyer) celebrateSale(buyer.color, { big: true });
        if (soundRef.current) playSound('gavel');
      } else if (soundRef.current) {
        playSound('unsold');
      }
    }
    const timer = setTimeout(
      () => setStamp((current) => (current?.key === stamp.key ? null : current)),
      STAMP_MS,
    );
    return () => clearTimeout(timer);
  }, [stamp]);

  // ── Background flood: leading team while bidding, the buyer while the SOLD stamp is up ──
  const lot = snapshot.current;
  const floodTeam = lot
    ? findTeam(snapshot, lot.currentTeamId)
    : stamp?.result === 'SOLD'
      ? findTeam(snapshot, stamp.teamId)
      : null;

  const stageKey = lot
    ? `lot:${lot.playerId}:${snapshot.round}`
    : stamp
      ? `closed:${stamp.key}`
      : `idle:${phase}`;

  return (
    <MotionConfig reducedMotion="user">
      <div
        style={floodTeam ? teamStyle(floodTeam.color) : undefined}
        className="relative isolate flex min-h-dvh flex-col overflow-hidden"
      >
        <div
          aria-hidden="true"
          className={cn(
            'bg-team pointer-events-none absolute inset-0 -z-10 transition-opacity duration-700',
            floodTeam ? 'opacity-20' : 'opacity-0',
          )}
        />
        {floodTeam && lot ? (
          <motion.div
            key={`flash:${lot.currentBid ?? 0}`}
            aria-hidden="true"
            initial={{ opacity: 0.35 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.9, ease: 'easeOut' }}
            className="bg-team pointer-events-none absolute inset-0 -z-10"
          />
        ) : null}

        <header className="flex flex-wrap items-center gap-4 px-8 py-5">
          <h1 className="font-display text-4xl tracking-wide">{tournamentName}</h1>
          <StatusPill tone={PHASE_TONE[phase]} live={phase === 'LOT'} className="text-sm">
            {PHASE_TEXT[phase]}
          </StatusPill>
          {snapshot.round > 1 ? <StatusPill tone="amber">Round {snapshot.round}</StatusPill> : null}
          {phase === 'BREAK' && stamp ? (
            <BreakChip nextAt={snapshot.nextAt} offsetMs={offsetMs} />
          ) : null}
          <div className="ml-auto flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-pressed={sound}
              onClick={() => {
                setSoundEnabled(!sound);
                // The click is the user gesture browsers need before audio can play.
                if (!sound) playSound('open');
              }}
            >
              {sound ? <Volume2Icon aria-hidden="true" /> : <VolumeXIcon aria-hidden="true" />}
              {sound ? 'Sound on' : 'Sound off'}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-pressed={hidePurses}
              onClick={() => setHidePurses((h) => !h)}
            >
              <EyeOffIcon aria-hidden="true" />
              Hide purses
            </Button>
          </div>
        </header>

        <main className="flex flex-1 flex-col justify-center px-8 pb-8">
          <AnimatePresence mode="wait" initial={false}>
            {lot ? (
              <LotStage
                key={stageKey}
                snapshot={snapshot}
                offsetMs={offsetMs}
                timerSeconds={settings.bidTimerSeconds}
                paused={phase === 'PAUSED'}
              />
            ) : stamp ? (
              <ClosedStage key={stageKey} snapshot={snapshot} stamp={stamp} />
            ) : (
              <IdleStage
                key={stageKey}
                snapshot={snapshot}
                phase={phase}
                maxPlayers={settings.maxPlayersPerTeam}
                hidePurses={hidePurses}
                offsetMs={offsetMs}
              />
            )}
          </AnimatePresence>
        </main>

        <BigScreenTicker snapshot={snapshot} hidePurses={hidePurses} />
      </div>
    </MotionConfig>
  );
}

function BreakChip({ nextAt, offsetMs }: { nextAt: string | null; offsetMs: number }) {
  const { seconds } = useCountdown(nextAt, offsetMs);
  return (
    <span className="font-display text-2xl tracking-wide text-gold uppercase">
      Next soldier in <span className="tabular font-numeric">{seconds}</span>…
    </span>
  );
}
