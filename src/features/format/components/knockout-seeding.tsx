'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { useFormat } from './match-context';
import { TeamSlot } from './team-slot';

/**
 * Knockout seeding (§7.12 "Seeding shown first (A1 v B2 …)"): the first-round pairings with their
 * group positions, and the teams once they are known.
 */
export function KnockoutSeeding() {
  const { data, teams } = useFormat();
  const reduced = useReducedMotion();
  const first = data.tree.rounds[0];
  if (!first) return null;
  const pos = (
    label: string | null,
    teamId: string | null,
    source: { type: string; ref: string } | null,
  ): string => {
    if (source?.type === 'GROUP_POS') {
      const [groupId, p] = source.ref.split(':');
      const g = data.groups.find((x) => x.id === groupId);
      if (g) return `${g.name}${p}`;
    }
    return teamId ? '' : (label ?? '');
  };

  return (
    <section aria-labelledby="seeding-heading" className="space-y-2">
      <h2 id="seeding-heading" className="font-display text-xl tracking-wide text-sand">
        Seeding · {first.name}
      </h2>
      <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {first.nodes.map((n, i) => {
          const m = n.match;
          return (
            <motion.li
              key={n.matchId}
              initial={reduced ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              className="rounded-md border border-border bg-surface/80 px-3 py-2 text-sm"
            >
              <p className="mb-1 font-numeric text-xs font-bold text-lime">
                {m.matchNumber ? `M${m.matchNumber}` : 'BYE'} ·{' '}
                {pos(n.labelA, m.teamAId, m.sourceA)} v{' '}
                {m.isBye ? 'BYE' : pos(n.labelB, m.teamBId, m.sourceB)}
              </p>
              <div className="flex flex-col gap-1">
                <TeamSlot
                  team={m.teamAId ? teams.get(m.teamAId) : undefined}
                  label={n.labelA}
                  size="sm"
                />
                <TeamSlot
                  team={m.teamBId ? teams.get(m.teamBId) : undefined}
                  label={n.labelB}
                  size="sm"
                />
              </div>
            </motion.li>
          );
        })}
      </ol>
    </section>
  );
}
