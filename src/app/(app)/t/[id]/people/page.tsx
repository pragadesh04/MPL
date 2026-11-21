import { LiveRefresh } from '@/features/identity/components/live-refresh';
import { AddPersonSheet } from '@/features/identity/components/add-person-sheet';
import { ImportPeopleDialog } from '@/features/identity/components/import-people-dialog';
import { InviteByPlayerId } from '@/features/identity/components/invite-by-player-id';
import { OrganiserKeyCard } from '@/features/identity/components/organiser-key-card';
import { PeopleBoard } from '@/features/identity/components/people-board';
import { RegistrationControls } from '@/features/identity/components/registration-controls';
import { SetupShell } from '@/features/identity/components/setup-shell';
import { orNotFound, requirePageUser } from '@/features/identity/server/page-access';
import { can } from '@/lib/permissions';
import { getReadDb } from '@/server/db/client';
import { env } from '@/server/env';
import { getUser } from '@/server/services/accounts/accounts';
import { listOutgoingRequests } from '@/server/services/joining/requests';
import { listRoster } from '@/server/services/people/people';
import { getSetupOverview } from '@/server/services/tournaments/setup';
import { registrationCounter } from '@/server/services/tournaments/tournaments';

export const metadata = { title: 'People' };

/** Setup step 3 (§7.2): bring people in by all three paths; captains and soldiers tabs. */
export default async function PeoplePage({ params }: PageProps<'/t/[id]/people'>) {
  const { id } = await params;
  const userId = await requirePageUser(`/t/${id}/people`);
  const [overview, roster] = await orNotFound(() =>
    Promise.all([getSetupOverview(userId, id), listRoster(userId, id)]),
  );
  const { tournament: t, readiness } = overview;
  const setup = t.status === 'DRAFT' || t.status === 'READY';
  const manage = can(t.roles, 'people:manage');
  const [owner, counter, requests] = await Promise.all([
    getUser(t.ownerId),
    registrationCounter(getReadDb(), id),
    manage ? listOutgoingRequests(userId, id) : Promise.resolve([]),
  ]);

  return (
    <SetupShell
      tournament={t}
      step="people"
      done={readiness.checks.some((c) => !c.ok && c.fixStep === 'people') ? [] : ['people']}
      actions={
        manage && setup ? (
          <div className="flex flex-wrap gap-2">
            <AddPersonSheet
              tournamentId={id}
              tournamentName={t.name}
              defaultPurse={t.settings.defaultPurse}
              minBasePrice={t.settings.minBasePrice}
            />
            <ImportPeopleDialog tournamentId={id} />
          </div>
        ) : null
      }
    >
      <LiveRefresh tournamentId={id} />
      {manage && setup ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {owner.organiserKey ? (
            <OrganiserKeyCard organiserKey={owner.organiserKey} appUrl={env().PUBLIC_APP_URL}>
              <RegistrationControls
                tournamentId={id}
                open={t.registrationOpen}
                maxRegistrations={t.maxRegistrations}
                registered={counter.registered}
                pending={counter.pending}
                disabled={!can(t.roles, 'settings:edit')}
              />
            </OrganiserKeyCard>
          ) : null}
          <InviteByPlayerId
            tournamentId={id}
            defaultPurse={t.settings.defaultPurse}
            minBasePrice={t.settings.minBasePrice}
          />
        </div>
      ) : null}
      <PeopleBoard
        tournament={{
          id,
          name: t.name,
          setup,
          defaultPurse: t.settings.defaultPurse,
          minBasePrice: t.settings.minBasePrice,
          minPlayersPerTeam: t.settings.minPlayersPerTeam,
          maxPlayersPerTeam: t.settings.maxPlayersPerTeam,
        }}
        roster={roster}
        can={{
          manage,
          approve: can(t.roles, 'people:approve'),
          resetPasswords: can(t.roles, 'participants:reset-password'),
        }}
        requests={requests}
      />
    </SetupShell>
  );
}
