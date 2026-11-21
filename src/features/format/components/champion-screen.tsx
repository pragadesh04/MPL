'use client';

import confetti from 'canvas-confetti';
import { motion, useReducedMotion } from 'framer-motion';
import { Trophy } from 'lucide-react';
import { useEffect } from 'react';
import { Avatar, AvatarFallback, getInitials } from '@/components/ui/avatar';
import { TeamChip } from '@/components/ui/team-chip';
import { useSoundEnabled } from '@/lib/sound';
import { teamStyle } from '@/lib/team-color';
import { cn } from '@/lib/utils';
import { playFanfare } from '../sfx';
import type { PlayerView, TeamView } from '../types';

/**
 * Champion screen (§7.12): trophy, the winning squad and confetti in the team's colours. Confetti,
 * the trophy bounce and the fanfare are skipped for `prefers-reduced-motion` (§7.13).
 */
export function ChampionScreen({
  team,
  squad,
  large = false,
}: {
  team: TeamView;
  squad: PlayerView[];
  large?: boolean;
}) {
  const reduced = useReducedMotion();
  const sound = useSoundEnabled();

  useEffect(() => {
    if (reduced) return;
    // Team colours are runtime data (lowercase #rrggbb), the only colours canvas-confetti accepts.
    const colors = [team.color];
    const burst = (x: number): void => {
      void confetti({
        particleCount: 90,
        spread: 75,
        startVelocity: 45,
        origin: { x, y: 0.6 },
        colors,
        disableForReducedMotion: true,
      });
    };
    burst(0.2);
    burst(0.8);
    const id = window.setTimeout(() => burst(0.5), 600);
    if (sound) playFanfare();
    return () => window.clearTimeout(id);
  }, [reduced, sound, team.color]);

  return (
    <section
      style={teamStyle(team.color)}
      aria-label={`Champions: ${team.name}`}
      className={cn(
        'border-team relative overflow-hidden rounded-xl border-2 bg-surface/90 text-center',
        large ? 'p-12' : 'p-6 sm:p-10',
      )}
    >
      <div aria-hidden className="bg-team pointer-events-none absolute inset-0 opacity-10" />
      <motion.div
        initial={reduced ? false : { scale: 0.4, rotate: -12, opacity: 0 }}
        animate={{ scale: 1, rotate: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 180, damping: 12 }}
        className="relative mx-auto mb-4 grid size-24 place-items-center rounded-full bg-gold/15 text-gold"
      >
        <Trophy className={large ? 'size-16' : 'size-12'} aria-hidden />
      </motion.div>
      <p className="relative text-sm font-bold tracking-[0.3em] text-gold uppercase">Champions</p>
      <h2
        className={cn(
          'relative font-display tracking-wide',
          large ? 'text-7xl' : 'text-4xl sm:text-5xl',
        )}
      >
        {team.emoji ? <span className="mr-3">{team.emoji}</span> : null}
        {team.name}
      </h2>
      <div className="relative mt-3 flex justify-center">
        <TeamChip
          name={team.name}
          shortName={team.shortName}
          color={team.color}
          size="lg"
          hideName
        />
      </div>
      {team.motto ? <p className="relative mt-2 text-muted italic">“{team.motto}”</p> : null}
      <ul className="relative mt-6 flex flex-wrap justify-center gap-4">
        {[
          { id: 'captain', name: team.captainName, ign: null, captain: true },
          ...squad.map((p) => ({ id: p.id, name: p.name, ign: p.ign, captain: false })),
        ].map((p) => (
          <li key={p.id} className="flex w-24 flex-col items-center gap-1.5">
            <Avatar className={cn('size-14 border-2', p.captain ? 'border-gold' : 'border-team')}>
              <AvatarFallback className="bg-surface-2 font-display text-lg">
                {getInitials(p.name)}
              </AvatarFallback>
            </Avatar>
            <span className="w-full truncate text-sm font-semibold">{p.name}</span>
            {p.captain ? (
              <span className="text-[0.625rem] font-bold tracking-widest text-gold uppercase">
                Captain
              </span>
            ) : p.ign ? (
              <span className="w-full truncate text-xs text-muted">{p.ign}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
