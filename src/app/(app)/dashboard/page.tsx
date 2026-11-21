import { ChevronRight, Users } from 'lucide-react';
import Link from 'next/link';
import { JetpackSoldier } from '@/components/mascots/jetpack-soldier';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusPill } from '@/components/ui/status-pill';
import { JoinWithKeyCard } from '@/features/identity/components/join-with-key-card';
import { MyTournamentCard } from '@/features/identity/components/my-tournament-card';
import { NewTournamentButton } from '@/features/identity/components/new-tournament-button';
import { OrganiserKeyCard } from '@/features/identity/components/organiser-key-card';
import { PendingInvitesBanner } from '@/features/identity/components/pending-invites-banner';
import { PlayerIdCard } from '@/features/identity/components/player-id-card';
import { RequestsInbox } from '@/features/identity/components/requests-inbox';
import { STATUS_LABEL, STATUS_TONE } from '@/features/identity/lib/labels';
import { requirePageUser } from '@/features/identity/server/page-access';
import { env } from '@/server/env';
import { getUser } from '@/server/services/accounts/accounts';
import { listMyRequests } from '@/server/services/joining/requests';
import { listMyOrganiserInvites } from '@/server/services/organisers/organisers';
import {
  getOrganiserDashboard,
  listMyTournaments,
} from '@/server/services/tournaments/tournaments';

export const metadata = { title: 'Dashboard' };

/** Home / dashboard (§7.1): organiser command post + player area for everyone. */
export default async function DashboardPage({ searchParams }: PageProps<'/dashboard'>) {
  const userId = await requirePageUser('/dashboard');
  const { key } = await searchParams;
  const [user, mine, requests] = await Promise.all([
    getUser(userId),
    listMyTournaments(userId),
    listMyRequests(userId),
  ]);
  const org = user.isOrganiser ? await getOrganiserDashboard(userId, mine) : null;
  const invites = await listMyOrganiserInvites(userId);
  const playing = mine.filter(
    (t) =>
      t.roles.includes('CAPTAIN') ||
      t.roles.includes('SOLDIER') ||
      t.pending !== null ||
      t.rejected !== null,
  );
  const appUrl = env().PUBLIC_APP_URL;

  return (
    <div className="grid gap-8">
      <PendingInvitesBanner invites={invites} />
      {org ? (
        <section aria-labelledby="command-post" className="grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 id="command-post" className="font-display text-3xl tracking-wide">
              Command post
            </h1>
            <NewTournamentButton
              activeName={org.active?.name ?? null}
              copySources={org.copySources}
            />
          </div>
          <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
            {org.active ? (
              <Card>
                <CardHeader>
                  <div className="flex flex-wrap gap-2">
                    <StatusPill tone={STATUS_TONE[org.active.status]}>
                      {STATUS_LABEL[org.active.status]}
                    </StatusPill>
                    <StatusPill tone="sand">{org.active.counts.captains} captains</StatusPill>
                    <StatusPill tone="sand">{org.active.counts.soldiers} soldiers</StatusPill>
                    {org.active.counts.pendingCaptains + org.active.counts.pendingSoldiers > 0 ? (
                      <StatusPill tone="amber">
                        {org.active.counts.pendingCaptains + org.active.counts.pendingSoldiers}{' '}
                        pending
                      </StatusPill>
                    ) : null}
                  </div>
                  <CardTitle className="font-display text-3xl tracking-wide">
                    {org.active.name}
                  </CardTitle>
                  <CardDescription>My active tournament</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  {org.active.status === 'DRAFT' || org.active.status === 'READY' ? (
                    <>
                      <Button asChild>
                        <Link href={`/t/${org.active.id}/setup`}>
                          Resume setup <ChevronRight aria-hidden />
                        </Link>
                      </Button>
                      <Button asChild variant="secondary">
                        <Link href={`/t/${org.active.id}/people`}>
                          <Users aria-hidden /> People
                        </Link>
                      </Button>
                    </>
                  ) : (
                    <Button asChild>
                      <Link href={`/t/${org.active.id}`}>
                        Open <ChevronRight aria-hidden />
                      </Link>
                    </Button>
                  )}
                  <Button asChild variant="ghost">
                    <Link href={`/t/${org.active.id}/settings`}>Settings</Link>
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card className="items-center justify-center p-8 text-center">
                <JetpackSoldier pose="cheer" className="size-24 text-lime" />
                <CardTitle className="font-display text-2xl tracking-wide">
                  Create your first tournament
                </CardTitle>
                <CardDescription>
                  Set the rules, bring captains and soldiers in, then start the auction.
                </CardDescription>
              </Card>
            )}
            {user.organiserKey ? (
              <OrganiserKeyCard organiserKey={user.organiserKey} appUrl={appUrl} />
            ) : null}
          </div>
          {org.organisingForOthers.length > 0 ? (
            <div className="grid gap-3">
              <h2 className="font-display text-xl tracking-wide">Organising for others</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {org.organisingForOthers.map((t) => (
                  <MyTournamentCard key={t.id} tournament={t} />
                ))}
              </div>
            </div>
          ) : null}
          {org.archive.length > 0 ? (
            <details className="grid gap-3">
              <summary className="cursor-pointer font-display text-xl tracking-wide">
                Archive ({org.archive.length})
              </summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {org.archive.map((t) => (
                  <MyTournamentCard key={t.id} tournament={t} />
                ))}
              </div>
            </details>
          ) : null}
        </section>
      ) : null}

      <section aria-labelledby="my-tournaments" className="grid gap-4">
        {org ? null : (
          <h1 className="font-display text-3xl tracking-wide">Welcome, {user.displayName}</h1>
        )}
        <div className="grid gap-4 lg:grid-cols-2">
          <PlayerIdCard playerCode={user.playerCode} />
          <JoinWithKeyCard initialKey={typeof key === 'string' ? key : ''} />
        </div>
        <RequestsInbox userId={userId} requests={requests} />
        <h2 id="my-tournaments" className="font-display text-2xl tracking-wide">
          My tournaments
        </h2>
        {playing.length === 0 ? (
          <Card className="p-6 text-center text-muted">
            You&apos;re not in a tournament yet. Share your Player ID or enter an organiser&apos;s
            key.
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {playing.map((t) => (
              <MyTournamentCard key={t.id} tournament={t} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
