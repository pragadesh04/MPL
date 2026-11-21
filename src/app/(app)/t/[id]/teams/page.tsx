import { LiveRefresh } from '@/features/identity/components/live-refresh';
import { SetupShell } from '@/features/identity/components/setup-shell';
import { TeamsBoard } from '@/features/identity/components/teams-board';
import { orNotFound, requirePageUser } from '@/features/identity/server/page-access';
import { can } from '@/lib/permissions';
import { getTeamsBoard } from '@/server/services/people/teams';
import { getSetupOverview } from '@/server/services/tournaments/setup';

export const metadata = { title: 'Teams' };

/** Setup step 4 (§7.2): the onboarding tracker for every approved captain. */
export default async function TeamsPage({ params }: PageProps<'/t/[id]/teams'>) {
  const { id } = await params;
  const userId = await requirePageUser(`/t/${id}/teams`);
  const [overview, captains] = await orNotFound(() =>
    Promise.all([getSetupOverview(userId, id), getTeamsBoard(userId, id)]),
  );
  const t = overview.tournament;
  const setup = t.status === 'DRAFT' || t.status === 'READY';
  return (
    <SetupShell
      tournament={t}
      step="teams"
      done={overview.readiness.checks.some((c) => !c.ok && c.fixStep === 'teams') ? [] : ['teams']}
    >
      <LiveRefresh tournamentId={id} />
      <TeamsBoard
        tournamentId={id}
        tournamentName={t.name}
        captains={captains}
        canManage={can(t.roles, 'people:manage')}
        canEdit={can(t.roles, 'settings:edit')}
        setup={setup}
      />
    </SetupShell>
  );
}
