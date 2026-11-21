import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormatProvider } from '@/features/format/components/match-context';
import { MatchesHub } from '@/features/format/components/matches-hub';
import { TournamentHeader } from '@/features/format/components/tournament-header';
import { loadFormatPage } from '@/features/format/load-page';

export const metadata = { title: 'Matches' };

/**
 * Matches hub (§7.10a): every participant role sees the running order (List) and the whole
 * tournament structure (Tree), both built from the same match rows. Outsiders get 404.
 */
export default async function MatchesPage({ params }: PageProps<'/t/[id]/matches'>) {
  const { id } = await params;
  const data = await loadFormatPage(id);
  const slug = data.tournament.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  return (
    <FormatProvider data={data}>
      <TournamentHeader
        tournament={data.tournament}
        isOrganiser={data.viewer.isOrganiser}
        title="Matches"
      />
      {data.matches.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No matches yet</CardTitle>
            <CardDescription>
              The full running order and tree appear as soon as the groups are drawn.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted">{data.plan.summary}</CardContent>
        </Card>
      ) : (
        <MatchesHub fileName={`${slug || 'mpl'}-bracket.png`} />
      )}
    </FormatProvider>
  );
}
