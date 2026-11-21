import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChampionScreen } from '@/features/format/components/champion-screen';
import { KnockoutSeeding } from '@/features/format/components/knockout-seeding';
import { FormatProvider } from '@/features/format/components/match-context';
import { TournamentHeader } from '@/features/format/components/tournament-header';
import { TreeReveal } from '@/features/format/components/tree-reveal';
import { TreeView } from '@/features/format/components/tree-view';
import { loadFormatPage } from '@/features/format/load-page';

export const metadata = { title: 'Knockout' };

/**
 * Knockout screen (§7.12): seeding first (A1 v B2 …), then the tree animates in (rounds as
 * columns, connectors, BYE slots, team colours, winner path, zoom and pan). Tap a match for the
 * detail sheet / result entry. The champion screen tops the page once the final is decided.
 */
export default async function KnockoutPage({ params }: PageProps<'/t/[id]/knockout'>) {
  const { id } = await params;
  const data = await loadFormatPage(id);
  const champion = data.championTeamId
    ? data.teams.find((t) => t.id === data.championTeamId)
    : undefined;
  const slug = data.tournament.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

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
        {data.tree.rounds.length === 0 ? (
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
          <>
            <KnockoutSeeding />
            <TreeReveal>
              <TreeView showGroups={false} fileName={`${slug || 'mpl'}-knockout.png`} />
            </TreeReveal>
          </>
        )}
      </div>
    </FormatProvider>
  );
}
