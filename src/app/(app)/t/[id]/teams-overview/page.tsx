import { eq } from 'drizzle-orm';
import { TeamsOverview } from '@/features/format/components/teams-overview';
import { TournamentHeader } from '@/features/format/components/tournament-header';
import { loadFormatPage } from '@/features/format/load-page';
import { parseSettings } from '@/lib/schemas/settings';
import { getReadDb } from '@/server/db/client';
import { tournaments } from '@/server/db/schema';

export const metadata = { title: 'Teams' };

/** Teams overview (§7.9) for every participant, with PNG export and a print view. */
export default async function TeamsOverviewPage({ params }: PageProps<'/t/[id]/teams-overview'>) {
  const { id } = await params;
  // Authorises first (404 for outsiders), then the settings read is safe.
  const data = await loadFormatPage(id);
  const [t] = await getReadDb()
    .select({ settings: tournaments.settings })
    .from(tournaments)
    .where(eq(tournaments.id, id));
  const settings = parseSettings(t?.settings);
  const slug = data.tournament.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return (
    <>
      <div className="print:hidden">
        <TournamentHeader
          tournament={data.tournament}
          isOrganiser={data.viewer.isOrganiser}
          title="Teams"
        />
      </div>
      <h1 className="mb-4 hidden font-display text-3xl print:block">
        {data.tournament.name} · Teams
      </h1>
      <TeamsOverview
        teams={data.teams}
        players={data.players}
        maxPlayers={settings.maxPlayersPerTeam}
        fileName={`${slug || 'mpl'}-teams.png`}
      />
    </>
  );
}
