'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { Dices, Swords } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/components/ui/sonner';
import { TeamChip } from '@/components/ui/team-chip';
import { apiRequest, errorMessage } from '../client-api';
import { useFormat } from './match-context';

/**
 * End of the group stage (§7.11): the "Qualified!" reveal, any organiser tie-break draws that are
 * still needed, then Generate knockout. Shown when every group match is done.
 */
export function KnockoutActions() {
  const { data, teams } = useFormat();
  const router = useRouter();
  const reduced = useReducedMotion();
  const [busy, setBusy] = useState(false);
  if (!data.readyForKnockout) return null;
  const pendingDraw = data.groups.filter((g) => g.needsTiebreakDraw);
  const canAdvance = data.viewer.canAdvance;

  async function post(url: string, success: string): Promise<void> {
    setBusy(true);
    try {
      await apiRequest('POST', url, {});
      toast.success(success);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="border-lime/50 shadow-glow">
      <CardHeader>
        <CardTitle className="font-display text-3xl tracking-wider text-lime">Qualified!</CardTitle>
        <CardDescription>
          The group stage is over.{' '}
          {pendingDraw.length > 0
            ? 'Some teams are level on every tie-break: the organisers run a draw first.'
            : canAdvance
              ? 'Generate the knockout to fill the bracket.'
              : 'The organisers will generate the knockout next.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {data.groups.map((g, gi) => (
            <div key={g.id} className="rounded-md border border-border p-3">
              <p className="mb-2 text-xs font-bold tracking-widest text-muted uppercase">
                Group {g.name}
              </p>
              <ol className="space-y-1.5">
                {g.standings.slice(0, g.advance).map((r, i) => {
                  const team = teams.get(r.teamId);
                  return team ? (
                    <motion.li
                      key={r.teamId}
                      initial={reduced ? false : { opacity: 0, x: -16 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: (gi * g.advance + i) * 0.15 }}
                      className="flex items-center gap-2"
                    >
                      <span className="w-6 font-numeric text-sm text-lime">
                        {g.name}
                        {i + 1}
                      </span>
                      <TeamChip
                        name={team.name}
                        shortName={team.shortName}
                        color={team.color}
                        size="sm"
                      />
                    </motion.li>
                  ) : null;
                })}
              </ol>
              {g.needsTiebreakDraw && canAdvance ? (
                <Button
                  type="button"
                  size="sm"
                  variant="gold"
                  className="mt-3"
                  disabled={busy}
                  onClick={() =>
                    post(
                      `/api/tournaments/${data.tournament.id}/groups/${g.id}/tiebreak`,
                      `Draw done for Group ${g.name}`,
                    )
                  }
                >
                  <Dices aria-hidden /> Run tie-break draw
                </Button>
              ) : null}
            </div>
          ))}
        </div>
        {canAdvance ? (
          <Button
            type="button"
            size="lg"
            disabled={busy || pendingDraw.length > 0}
            onClick={() =>
              post(
                `/api/tournaments/${data.tournament.id}/matches/knockout`,
                'The knockout is set!',
              )
            }
          >
            <Swords aria-hidden /> Generate knockout
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
