import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CeremonyOnce } from '@/features/format/components/ceremony-once';
import { GroupDrawPanel } from '@/features/format/components/group-draw-panel';
import { GroupsBoard } from '@/features/format/components/groups-board';
import { TournamentHeader } from '@/features/format/components/tournament-header';
import { UndoDrawButton } from '@/features/format/components/undo-draw-button';
import { loadFormatPage } from '@/features/format/load-page';

export const metadata = { title: 'Groups' };

/** Groups screen (§7.11): draw at GROUP_DRAW, then the ceremony, standings and fixtures. */
export default async function GroupsPage({ params }: PageProps<'/t/[id]/groups'>) {
  const { id } = await params;
  const data = await loadFormatPage(id);
  const { tournament, viewer, groups, teams, plan, matches } = data;
  const nothingPlayed = matches.every((m) => m.isBye || m.status === 'SCHEDULED');

  return (
    <>
      <TournamentHeader tournament={tournament} isOrganiser={viewer.isOrganiser} title="Groups" />
      {tournament.status === 'GROUP_DRAW' ? (
        <GroupDrawPanel
          tournamentId={tournament.id}
          teams={teams}
          plan={plan}
          canAdvance={viewer.canAdvance}
        />
      ) : groups.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>
              {plan.kind === 'FINAL_ONLY' && matches.length > 0
                ? 'No groups'
                : 'Groups aren’t drawn yet'}
            </CardTitle>
            <CardDescription>
              {plan.kind === 'FINAL_ONLY' && matches.length > 0
                ? 'With 2 teams the tournament goes straight to the final.'
                : 'The group draw happens after the auction and leftover allocation.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted">{plan.summary}</CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          <section aria-labelledby="draw-heading" className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 id="draw-heading" className="font-display text-2xl tracking-wide">
                The draw
              </h2>
              {viewer.canAdvance && nothingPlayed && tournament.status === 'GROUP_STAGE' ? (
                <UndoDrawButton tournamentId={tournament.id} />
              ) : null}
            </div>
            <CeremonyOnce tournamentId={tournament.id} groups={groups} teams={teams} />
          </section>
          <GroupsBoard data={data} />
        </div>
      )}
    </>
  );
}
