import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TeamChip } from '@/components/ui/team-chip';
import type { LeaderRow } from '../leaderboards';
import type { TeamView } from '../types';

/** One leaderboard (§7.13): rank, soldier with their team, the ranked value and small print. */
export function LeaderboardCard({
  title,
  unit,
  rows,
  teams,
}: {
  title: string;
  unit: string;
  rows: LeaderRow[];
  teams: ReadonlyMap<string, TeamView>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-xl tracking-wide text-lime">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted">No stats recorded yet.</p>
        ) : (
          <ol className="space-y-2">
            {rows.map((r, i) => {
              const team = teams.get(r.player.teamId);
              return (
                <li key={r.player.id} className="flex items-center gap-3">
                  <span className="w-6 text-right font-numeric text-sm text-muted">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">
                      {r.player.name}
                      {r.player.ign ? (
                        <span className="ml-1 text-sm text-muted">({r.player.ign})</span>
                      ) : null}
                    </p>
                    <p className="flex items-center gap-2 text-xs text-muted">
                      {team ? (
                        <TeamChip
                          name={team.name}
                          shortName={team.shortName}
                          color={team.color}
                          size="sm"
                          hideName
                        />
                      ) : null}
                      {r.detail}
                    </p>
                  </div>
                  <span className="tabular font-numeric text-xl font-bold text-lime">
                    {r.value}
                    <span className="ml-1 text-xs text-muted">{unit}</span>
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
