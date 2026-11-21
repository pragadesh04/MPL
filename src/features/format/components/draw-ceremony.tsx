'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Play, RotateCcw, SkipForward } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { TeamChip } from '@/components/ui/team-chip';
import { useSoundEnabled } from '@/lib/sound';
import { teamStyle } from '@/lib/team-color';
import { cn } from '@/lib/utils';
import { playDrumHit, playFanfare } from '../sfx';
import type { GroupView, TeamView } from '../types';

export interface CeremonyStep {
  groupIndex: number;
  teamId: string;
  pot: number | null;
}

/**
 * Reveal order for the ceremony (§4.2, §7.11): pot by pot, one team into Group A, B, C… A manual
 * placement (no pots) reveals group by group instead.
 */
export function ceremonySteps(groups: Pick<GroupView, 'teams'>[]): CeremonyStep[] {
  const withPots = groups.every((g) => g.teams.every((t) => t.pot !== null));
  const all = groups.flatMap((g, groupIndex) =>
    g.teams.map((t, i) => ({ groupIndex, teamId: t.teamId, pot: t.pot, i })),
  );
  return all
    .sort((a, b) =>
      withPots
        ? a.pot! - b.pot! || a.groupIndex - b.groupIndex
        : a.groupIndex - b.groupIndex || a.i - b.i,
    )
    .map(({ groupIndex, teamId, pot }) => ({ groupIndex, teamId, pot }));
}

const STEP_MS = 1100;

/**
 * Animated draw: team chips drop into group cards one by one with a team-colour flash and a drum
 * hit. Starts revealed when `autoPlay` is false or the user prefers reduced motion.
 */
export function DrawCeremony({
  groups,
  teams,
  autoPlay = true,
  large = false,
  onFinished,
}: {
  groups: GroupView[];
  teams: TeamView[];
  autoPlay?: boolean;
  /** Big-screen sizing. */
  large?: boolean;
  /** Called when the reveal completes or is skipped. */
  onFinished?: () => void;
}) {
  const reduced = useReducedMotion();
  const sound = useSoundEnabled();
  const steps = useMemo(() => ceremonySteps(groups), [groups]);
  const byId = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const [shown, setShown] = useState(autoPlay && !reduced ? 0 : steps.length);
  const [playing, setPlaying] = useState(autoPlay && !reduced);

  useEffect(() => {
    if (!playing || shown >= steps.length) return;
    const id = window.setTimeout(
      () => {
        if (sound) playDrumHit();
        const next = shown + 1;
        setShown(next);
        if (next >= steps.length) {
          setPlaying(false);
          onFinished?.();
          if (sound) window.setTimeout(playFanfare, 400);
        }
      },
      shown === 0 ? 600 : STEP_MS,
    );
    return () => window.clearTimeout(id);
  }, [playing, shown, steps.length, sound, onFinished]);

  const revealed = new Set(steps.slice(0, shown).map((s) => s.teamId));
  const current = shown > 0 ? steps[shown - 1] : undefined;
  const currentPot = playing ? (steps[shown]?.pot ?? current?.pot) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p
          className="text-sm font-semibold tracking-widest text-muted uppercase"
          aria-live="polite"
        >
          {playing
            ? currentPot
              ? `Drawing pot ${currentPot}…`
              : 'Drawing…'
            : shown >= steps.length
              ? 'Draw complete'
              : 'Ready'}
        </p>
        <div className="flex gap-2">
          {playing ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setShown(steps.length);
                setPlaying(false);
                onFinished?.();
              }}
            >
              <SkipForward aria-hidden /> Skip
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setShown(0);
                setPlaying(true);
              }}
            >
              {shown >= steps.length ? <RotateCcw aria-hidden /> : <Play aria-hidden />}
              {shown >= steps.length ? 'Replay draw' : 'Start'}
            </Button>
          )}
        </div>
      </div>
      <div
        className={cn(
          'grid gap-4',
          large ? 'grid-cols-2 xl:grid-cols-4' : 'sm:grid-cols-2 lg:grid-cols-4',
        )}
      >
        {groups.map((g, gi) => (
          <div
            key={g.id}
            className={cn(
              'rounded-lg border bg-surface/80 p-4 transition-colors',
              current?.groupIndex === gi && playing ? 'border-lime shadow-glow' : 'border-border',
            )}
          >
            <p
              className={cn(
                'mb-3 font-display tracking-wider text-lime',
                large ? 'text-4xl' : 'text-2xl',
              )}
            >
              Group {g.name}
            </p>
            <ul className="space-y-2">
              <AnimatePresence initial={false}>
                {g.teams
                  .filter((t) => revealed.has(t.teamId))
                  .map((t) => {
                    const team = byId.get(t.teamId);
                    if (!team) return null;
                    return (
                      <motion.li
                        key={t.teamId}
                        initial={reduced ? false : { opacity: 0, y: -40, scale: 1.4 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ type: 'spring', stiffness: 260, damping: 18 }}
                        style={teamStyle(team.color)}
                        className="border-team flex items-center justify-between gap-2 rounded-md border-l-4 bg-surface-2/60 px-3 py-2"
                      >
                        <TeamChip
                          name={team.name}
                          shortName={team.shortName}
                          color={team.color}
                          size={large ? 'lg' : 'default'}
                        />
                        {t.pot ? (
                          <span className="text-xs font-bold text-muted">P{t.pot}</span>
                        ) : null}
                      </motion.li>
                    );
                  })}
              </AnimatePresence>
              {Array.from(
                { length: g.teams.filter((t) => !revealed.has(t.teamId)).length },
                (_, i) => (
                  <li
                    key={`empty-${i}`}
                    className="h-11 rounded-md border border-dashed border-border"
                    aria-hidden
                  />
                ),
              )}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
