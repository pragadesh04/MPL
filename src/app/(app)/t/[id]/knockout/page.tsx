import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChampionScreen } from '@/features/format/components/champion-screen';
import { FormatProvider } from '@/features/format/components/match-context';
import { MatchRow } from '@/features/format/components/match-row';
import { TournamentHeader } from '@/features/format/components/tournament-header';
import { loadFormatPage } from '@/features/format/load-page';

export const metadata = { title: 'Knockout' };

/** Knockout screen (§7.12): rounds, then the champion once the final is decided. */
export default async function KnockoutPage({ params }: PageProps<'/t/[id]/knockout'>) {
  const { id } = await params;
  const data = await loadFormatPage(id);
  const champion = data.championTeamId
    ? data.teams.find((t) => t.id === data.championTeamId)
    : undefined;
  const { rounds, thirdPlace } = data.tree;
  const byId = new Map(data.matches.map((m) => [m.id, m]));

  return (
    <FormatProvider data={data}>
      <TournamentHeader
        tournament={data.tournament}
        isOrganiser={data.viewer.isOrganiser}
        title="Knockout"
      />
      <div className="space-y-8">
        {champion ? (
          <ChampionScreen
            team={champion}
            squad={data.players.filter((p) => p.teamId === champion.id)}
          />
        ) : null}
        {rounds.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No knockout yet</CardTitle>
              <CardDescription>
                The bracket appears as soon as the groups are drawn.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted">{data.plan.summary}</CardContent>
          </Card>
        ) : (
          <div className="grid gap-6 lg:auto-cols-fr lg:grid-flow-col">
            {rounds.map((r) => (
              <section key={r.round} className="space-y-2">
                <h2 className="font-display text-xl tracking-wide text-lime">{r.name}</h2>
                {r.nodes.map((n) => (
                  <MatchRow key={n.matchId} match={byId.get(n.matchId)!} showStage={false} />
                ))}
                {r.round === rounds.length && thirdPlace ? (
                  <>
                    <h3 className="pt-3 font-display text-lg tracking-wide text-sand">3rd place</h3>
                    <MatchRow match={byId.get(thirdPlace.matchId)!} showStage={false} />
                  </>
                ) : null}
              </section>
            ))}
          </div>
        )}
      </div>
    </FormatProvider>
  );
}
