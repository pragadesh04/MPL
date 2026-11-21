'use client';

import {
  KeyboardIcon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
  SkipForwardIcon,
  Undo2Icon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusPill, type StatusPillTone } from '@/components/ui/status-pill';
import type { AuctionPhase } from '../shared/phase';
import { PHASE_TEXT } from '../shared/phase';

const PHASE_TONE: Record<AuctionPhase, StatusPillTone> = {
  LOBBY: 'neutral',
  LOT: 'lime',
  BREAK: 'sand',
  PAUSED: 'amber',
  WAITING: 'info',
  COMPLETE: 'gold',
};

interface ConsoleHeaderProps {
  tournamentName: string;
  phase: AuctionPhase;
  round: number;
  live: boolean;
  /** Console commands are accepted from this viewer. */
  canAct: boolean;
  busy: boolean;
  canReset: boolean;
  nextBlocked: string | null;
  startRoundBlocked: string | null;
  pauseBlocked: string | null;
  onStart: () => void;
  onStartRound: () => void;
  onTogglePause: () => void;
  onUndo: () => void;
  onReset: () => void;
  onShortcuts: () => void;
}

/** Console header (§7.6): phase, connection, Start / Start new round, Pause, Undo, Reset. */
export function ConsoleHeader({
  tournamentName,
  phase,
  round,
  live,
  canAct,
  busy,
  canReset,
  nextBlocked,
  startRoundBlocked,
  pauseBlocked,
  onStart,
  onStartRound,
  onTogglePause,
  onUndo,
  onReset,
  onShortcuts,
}: ConsoleHeaderProps) {
  const paused = phase === 'PAUSED';
  const lobby = phase === 'LOBBY';
  const roundReason = lobby ? null : startRoundBlocked;
  // Spell the reason out under the header between lots (tooltip only while a lot runs).
  const showRoundReason = roundReason !== null && phase !== 'LOT';
  return (
    <header className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto min-w-0">
          <p className="text-xs tracking-widest text-muted uppercase">Auctioneer console</p>
          <h1 className="truncate font-display text-2xl tracking-wide">{tournamentName}</h1>
        </div>
        <StatusPill tone={PHASE_TONE[phase]} live={phase === 'LOT'}>
          {PHASE_TEXT[phase]}
        </StatusPill>
        <StatusPill tone="neutral">Round {round}</StatusPill>
        <StatusPill
          tone={live ? 'success' : 'neutral'}
          live={live}
          title={live ? 'Live updates' : 'No live connection: refreshing every 2 seconds'}
        >
          {live ? 'Live' : 'Polling'}
        </StatusPill>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {lobby ? (
          <Button
            type="button"
            disabled={!canAct || busy || nextBlocked !== null}
            title={nextBlocked ?? undefined}
            onClick={onStart}
          >
            <PlayIcon aria-hidden="true" />
            Start auction
          </Button>
        ) : (
          <Button
            type="button"
            variant="secondary"
            disabled={!canAct || busy || roundReason !== null}
            title={roundReason ?? undefined}
            aria-describedby={showRoundReason ? 'start-round-reason' : undefined}
            onClick={onStartRound}
          >
            <SkipForwardIcon aria-hidden="true" />
            Start new round
          </Button>
        )}
        <Button
          type="button"
          variant={paused ? 'default' : 'outline'}
          disabled={!canAct || busy || pauseBlocked !== null}
          title={pauseBlocked ?? undefined}
          onClick={onTogglePause}
        >
          {paused ? <PlayIcon aria-hidden="true" /> : <PauseIcon aria-hidden="true" />}
          {paused ? 'Resume' : 'Pause'}
        </Button>
        <Button type="button" variant="outline" disabled={!canAct || busy} onClick={onUndo}>
          <Undo2Icon aria-hidden="true" />
          Undo last sale
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Keyboard shortcuts"
          title="Keyboard shortcuts (?)"
          onClick={onShortcuts}
        >
          <KeyboardIcon aria-hidden="true" />
        </Button>
        {canReset ? (
          <Button
            type="button"
            variant="destructive"
            className="ml-auto"
            disabled={busy}
            onClick={onReset}
          >
            <RotateCcwIcon aria-hidden="true" />
            Reset
          </Button>
        ) : null}
      </div>
      {showRoundReason ? (
        <p id="start-round-reason" className="text-xs text-muted">
          Start new round: {roundReason}.
        </p>
      ) : null}
      {lobby && nextBlocked ? (
        <p className="text-xs text-muted">Start auction: {nextBlocked}.</p>
      ) : null}
    </header>
  );
}
