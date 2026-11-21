'use client';

import { motion, useReducedMotion } from 'framer-motion';
import type { StandingRow } from '@/lib/rules/computeStandings';
import { TeamChip } from '@/components/ui/team-chip';
import { teamStyle } from '@/lib/team-color';
import { cn } from '@/lib/utils';
import type { TeamView } from '../types';

function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

/**
 * Group standings (§4.3 columns): Pos · Team · P · W · L · Games · GD · Kills · KD · Pts · Form.
 * Qualifying rows get a "Q" badge and a dashed cut-off line under the last qualifying place.
 * Standings are computed from results on every request, never stored. Rows slide to their new
 * place when positions change (off for reduced motion).
 */
export function StandingsTable({
  rows,
  teams,
  advance,
  myTeamId,
  compact = false,
}: {
  rows: StandingRow[];
  teams: ReadonlyMap<string, TeamView>;
  advance: number;
  myTeamId?: string | null;
  /** Mini table for the tree view / big screen: Pos · Team · P · Pts. */
  compact?: boolean;
}) {
  const reduced = useReducedMotion();
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-max text-sm">
        <thead>
          <tr className="text-left text-[0.6875rem] font-bold tracking-widest text-muted uppercase">
            <th scope="col" className="px-2 py-1.5">
              #
            </th>
            <th scope="col" className="px-2 py-1.5">
              Team
            </th>
            <th scope="col" className="px-2 py-1.5 text-right" title="Played">
              P
            </th>
            {compact ? null : (
              <>
                <th scope="col" className="px-2 py-1.5 text-right" title="Won">
                  W
                </th>
                <th scope="col" className="px-2 py-1.5 text-right" title="Lost">
                  L
                </th>
                <th scope="col" className="px-2 py-1.5 text-right" title="Games won–lost">
                  Games
                </th>
                <th scope="col" className="px-2 py-1.5 text-right" title="Game difference">
                  GD
                </th>
                <th scope="col" className="px-2 py-1.5 text-right" title="Kills for–against">
                  Kills
                </th>
                <th scope="col" className="px-2 py-1.5 text-right" title="Kill difference">
                  KD
                </th>
              </>
            )}
            <th scope="col" className="px-2 py-1.5 text-right" title="Points">
              Pts
            </th>
            {compact ? null : (
              <th scope="col" className="px-2 py-1.5" title="Last 3 results">
                Form
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const team = teams.get(r.teamId);
            const qualifies = r.position <= advance;
            const cutoff = r.position === advance && rows.length > advance;
            const mine = myTeamId === r.teamId;
            return (
              <motion.tr
                key={r.teamId}
                layout={reduced ? false : 'position'}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                style={team && mine ? teamStyle(team.color) : undefined}
                className={cn(
                  'border-t border-border/60',
                  cutoff && 'border-b-2 [border-bottom-style:dashed] border-b-lime/50',
                  mine && 'bg-surface-2/70',
                )}
              >
                <td className="tabular px-2 py-2 font-numeric">
                  <span className="inline-flex items-center gap-1">
                    {r.position}
                    {qualifies ? (
                      <span
                        className="rounded-sm bg-lime/15 px-1 text-[0.625rem] font-bold text-lime"
                        title="Qualifying place"
                      >
                        Q
                      </span>
                    ) : null}
                  </span>
                </td>
                <td className={cn('px-2 py-2', mine && 'border-team border-l-4')}>
                  {team ? (
                    <TeamChip
                      name={team.name}
                      shortName={team.shortName}
                      color={team.color}
                      size="sm"
                      hideName={compact}
                    />
                  ) : (
                    <span className="text-muted">Unknown team</span>
                  )}
                  {r.needsDraw && r.played > 0 ? (
                    <span
                      className="ml-2 text-[0.625rem] font-bold text-amber uppercase"
                      title="Level on every tie-break"
                    >
                      Draw needed
                    </span>
                  ) : null}
                </td>
                <td className="tabular px-2 py-2 text-right font-numeric">{r.played}</td>
                {compact ? null : (
                  <>
                    <td className="tabular px-2 py-2 text-right font-numeric">{r.won}</td>
                    <td className="tabular px-2 py-2 text-right font-numeric">{r.lost}</td>
                    <td className="tabular px-2 py-2 text-right font-numeric">
                      {r.gamesWon}–{r.gamesLost}
                    </td>
                    <td className="tabular px-2 py-2 text-right font-numeric">
                      {signed(r.gameDiff)}
                    </td>
                    <td className="tabular px-2 py-2 text-right font-numeric">
                      {r.killsFor}–{r.killsAgainst}
                    </td>
                    <td className="tabular px-2 py-2 text-right font-numeric">
                      {signed(r.killDiff)}
                    </td>
                  </>
                )}
                <td className="tabular px-2 py-2 text-right font-numeric text-base font-bold text-lime">
                  {r.points}
                </td>
                {compact ? null : (
                  <td className="px-2 py-2">
                    <span
                      className="flex gap-0.5"
                      aria-label={`Form: ${r.form.join(' ') || 'none'}`}
                    >
                      {r.form.map((f, i) => (
                        <span
                          key={i}
                          className={cn(
                            'grid size-5 place-items-center rounded-sm text-[0.625rem] font-bold',
                            f === 'W' ? 'bg-success/20 text-success' : 'bg-blood/20 text-blood',
                          )}
                        >
                          {f}
                        </span>
                      ))}
                    </span>
                  </td>
                )}
              </motion.tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
