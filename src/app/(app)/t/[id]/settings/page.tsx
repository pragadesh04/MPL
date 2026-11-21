import { ChevronRight, ShieldCheck, SlidersHorizontal, Users } from 'lucide-react';
import Link from 'next/link';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CancelTournamentCard } from '@/features/identity/components/cancel-tournament-card';
import { STATUS_LABEL } from '@/features/identity/lib/labels';
import { orNotFound, requirePageUser } from '@/features/identity/server/page-access';
import { can } from '@/lib/permissions';
import { getTournamentForOrganiser } from '@/server/services/tournaments/tournaments';

export const metadata = { title: 'Settings' };

/** Tournament settings index (organisers). Integrations (webhooks) are added by Lane B. */
export default async function SettingsPage({ params }: PageProps<'/t/[id]/settings'>) {
  const { id } = await params;
  const userId = await requirePageUser(`/t/${id}/settings`);
  const t = await orNotFound(() => getTournamentForOrganiser(userId, id));
  const finished = t.status === 'COMPLETED' || t.status === 'CANCELLED';
  const links = [
    {
      href: `/t/${id}/setup?step=rules`,
      title: 'Rules',
      help: 'Purses, squad sizes, bidding and format',
      Icon: SlidersHorizontal,
    },
    {
      href: `/t/${id}/people`,
      title: 'People',
      help: 'Captains, soldiers, organiser key and requests',
      Icon: Users,
    },
    {
      href: `/t/${id}/settings/organisers`,
      title: 'Organisers',
      help: 'Co-admins, auctioneers, invites and ownership',
      Icon: ShieldCheck,
    },
  ];
  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <div>
        <h1 className="font-display text-3xl tracking-wide">{t.name}</h1>
        <p className="text-muted">Settings · {STATUS_LABEL[t.status]}</p>
      </div>
      <div className="grid gap-3">
        {links.map(({ href, title, help, Icon }) => (
          <Link key={href} href={href} className="block rounded-xl">
            <Card className="transition-colors hover:border-lime-dim">
              <CardHeader className="flex-row items-center gap-3">
                <Icon aria-hidden className="size-5 text-lime" />
                <div className="flex-1">
                  <CardTitle>{title}</CardTitle>
                  <CardDescription>{help}</CardDescription>
                </div>
                <ChevronRight aria-hidden className="size-5 text-muted" />
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
      {can(t.roles, 'tournament:delete') && !finished ? (
        <CancelTournamentCard tournamentId={id} tournamentName={t.name} />
      ) : null}
    </div>
  );
}
