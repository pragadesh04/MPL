import { Hourglass } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LiveRefresh } from '@/features/identity/components/live-refresh';
import { TeamSetupForm } from '@/features/identity/components/team-setup-form';
import { firstName } from '@/features/identity/lib/labels';
import { orNotFound, requirePageUser } from '@/features/identity/server/page-access';
import { loadTournamentRole } from '@/server/services/roles';
import { getMyCard, getMyTeamSetup } from '@/server/services/people/teams';

export const metadata = { title: 'Team setup' };

/** Captain team setup (§7.4 step 2, §7.5): pending captains see "Waiting for … to approve you". */
export default async function TeamSetupPage({ params }: PageProps<'/t/[id]/teams/setup'>) {
  const { id } = await params;
  const userId = await requirePageUser(`/t/${id}/teams/setup`);
  const access = await loadTournamentRole(userId, id);
  if (!access) notFound();

  if (!access.leaderId) {
    if (!access.pending.leaderId) notFound();
    const card = await orNotFound(() => getMyCard(userId, id));
    return (
      <Card className="mx-auto max-w-lg text-center">
        <CardHeader className="items-center">
          <Hourglass aria-hidden className="size-10 text-amber" />
          <CardTitle className="font-display text-2xl tracking-wide">
            Waiting for {firstName(card.tournament.ownerName)} to approve you as captain
          </CardTitle>
          <CardDescription>
            {card.tournament.name}. You can set up your team as soon as you&apos;re approved — this
            page updates by itself.
          </CardDescription>
          <LiveRefresh userId={userId} />
        </CardHeader>
      </Card>
    );
  }

  const setup = await orNotFound(() => getMyTeamSetup(userId, id));
  const editable = setup.tournament.status === 'DRAFT' || setup.tournament.status === 'READY';
  return (
    <div className="grid gap-6">
      <LiveRefresh tournamentId={id} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">{setup.tournament.name}</p>
          <h1 className="font-display text-3xl tracking-wide">
            {setup.team ? 'Your team' : 'Set up your team'}
          </h1>
        </div>
        <Button asChild variant="ghost">
          <Link href={`/t/${id}/people/me`}>My card</Link>
        </Button>
      </div>
      {setup.team && editable ? (
        <p className="rounded-md border border-lime/40 bg-lime/10 px-3 py-2 text-sm text-lime">
          You&apos;re all set. On auction day, log in with your username and bid from your phone.
          Tip: add MPL to your home screen.
        </p>
      ) : null}
      <TeamSetupForm
        endpoint={`/api/tournaments/${id}/my-team`}
        captainName={setup.captainName}
        purse={setup.purse}
        initial={setup.team}
        otherTeams={setup.otherTeams}
        disabled={!editable}
      />
    </div>
  );
}
