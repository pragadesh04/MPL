import { notFound } from 'next/navigation';
import { CommandPost } from '@/features/auction/command-post/command-post';
import { AuctionProvider } from '@/features/auction/shared/auction-context';
import {
  AuctionNotStarted,
  isAuctionNotStarted,
  isNotFound,
} from '@/features/auction/shared/auction-unavailable';
import { getSessionUserId } from '@/server/auth/session';
import {
  getAuctionPageData,
  getCommandPostRoster,
  type AuctionPageData,
  type RosterPerson,
} from '@/server/services/auction/page-data';

export const metadata = { title: 'Command post' };
export const dynamic = 'force-dynamic';

/** `/t/[id]/command-post` — organiser roster panel (PLAN §7.6a). Organisers only (404 otherwise). */
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
      <CommandPost viewer={data.viewer} roster={roster} />
    </AuctionProvider>
  );
}
