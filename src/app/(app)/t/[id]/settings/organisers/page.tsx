import Link from 'next/link';
import { OrganisersPanel } from '@/features/identity/components/organisers-panel';
import { orNotFound, requirePageUser } from '@/features/identity/server/page-access';
import { can } from '@/lib/permissions';
import { listMembers } from '@/server/services/organisers/organisers';
import { getTournamentForOrganiser } from '@/server/services/tournaments/tournaments';

export const metadata = { title: 'Organisers' };

/** Settings → Organisers (§7.3). Everyone on the organiser team sees it; only the owner acts. */
export default async function OrganisersPage({ params }: PageProps<'/t/[id]/settings/organisers'>) {
  const { id } = await params;
  const userId = await requirePageUser(`/t/${id}/settings/organisers`);
  const [t, view] = await orNotFound(() =>
    Promise.all([getTournamentForOrganiser(userId, id), listMembers(userId, id)]),
  );
  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <div>
        <Link href={`/t/${id}/settings`} className="text-sm text-muted hover:text-foreground">
          ← Settings
        </Link>
        <h1 className="font-display text-3xl tracking-wide">{t.name}</h1>
      </div>
      <OrganisersPanel
        tournamentId={id}
        tournamentName={t.name}
        view={view}
        currentUserId={userId}
        isOwner={can(t.roles, 'organisers:manage')}
      />
    </div>
  );
}
