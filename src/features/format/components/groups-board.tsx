import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { FormatPageData } from '../types';
import { StandingsTable } from './standings-table';

/** Standings for every group (§7.11). Fixtures and result entry are added in C3 / C5. */
export function GroupsBoard({ data }: { data: FormatPageData }) {
  const teams = new Map(data.teams.map((t) => [t.id, t]));
  return (
    <section aria-labelledby="standings-heading" className="space-y-3">
      <h2 id="standings-heading" className="font-display text-2xl tracking-wide">
        Standings
      </h2>
      <div className="grid gap-4 xl:grid-cols-2">
        {data.groups.map((g) => (
          <Card key={g.id}>
            <CardHeader>
              <CardTitle className="font-display text-xl tracking-wider text-lime">
                Group {g.name}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <StandingsTable
                rows={g.standings}
                teams={teams}
                advance={g.advance}
                myTeamId={data.viewer.myTeamId}
              />
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
