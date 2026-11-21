import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { CommandPost } from '@/features/auction/command-post/command-post';
import { AuctionProvider } from '@/features/auction/shared/auction-context';
import {
  AuctionNotStarted,
  isAuctionNotStarted,
  isNotFound,
} from '@/features/auction/shared/auction-unavailable';
import { AnnouncementForm } from '@/features/public/components/announcement-form';
import { can } from '@/lib/permissions';
import { getSessionUserId } from '@/server/auth/session';
import { getReadDb } from '@/server/db/client';
import { tournaments } from '@/server/db/schema';
import { loadTournamentRole } from '@/server/services/roles';
import {
  getAuctionPageData,
  getCommandPostRoster,
  type AuctionPageData,
  type RosterPerson,
} from '@/server/services/auction/page-data';

export const metadata = { title: 'Command post' };
export const dynamic = 'force-dynamic';

/**
 * `/t/[id]/command-post` — organiser roster panel (PLAN §7.6a). Organisers only (404 otherwise).
 * Owners / co-admins also get the announcement field (Lane C's service) at the top.
 */
export default async function CommandPostPage({ params }: PageProps<'/t/[id]/command-post'>) {
  const { id } = await params;
  const userId = await getSessionUserId();
  let data: AuctionPageData;
  let roster: RosterPerson[];
  try {
    roster = await getCommandPostRoster(userId, id);
    data = await getAuctionPageData(userId, id);
  } catch (err) {
    if (isNotFound(err)) notFound();
    if (isAuctionNotStarted(err)) return <AuctionNotStarted />;
    throw err;
  }
  const access = userId ? await loadTournamentRole(userId, id) : null;
  const canAnnounce = access ? can(access.roles, 'announcement:post') : false;
  const [row] = canAnnounce
    ? await getReadDb()
        .select({ announcement: tournaments.announcement })
        .from(tournaments)
        .where(eq(tournaments.id, id))
    : [];
  return (
    <AuctionProvider
      info={{
        tournamentId: data.tournament.id,
        tournamentName: data.tournament.name,
        settings: data.settings,
        organiserNames: Object.fromEntries(data.organisers.map((o) => [o.userId, o.name])),
        captainUserIds: data.captainUserIds,
      }}
      initialSnapshot={data.snapshot}
    >
      {canAnnounce ? (
        <div className="mx-auto mb-5 w-full max-w-7xl">
          <AnnouncementForm tournamentId={id} current={row?.announcement ?? null} />
        </div>
      ) : null}
      <CommandPost viewer={data.viewer} roster={roster} />
    </AuctionProvider>
  );
}
