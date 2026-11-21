import { notFound } from 'next/navigation';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CaptainBidView } from '@/features/auction/captain/captain-bid-view';
import { AuctioneerConsole } from '@/features/auction/console/auctioneer-console';
import { AuctionProvider } from '@/features/auction/shared/auction-context';
import {
  AuctionNotStarted,
  isAuctionNotStarted,
  isNotFound,
} from '@/features/auction/shared/auction-unavailable';
import { SoldierAuctionView } from '@/features/auction/soldier/soldier-status-card';
import { getSessionUserId } from '@/server/auth/session';
import { getAuctionPageData, type AuctionPageData } from '@/server/services/auction/page-data';

export const metadata = { title: 'Auction room' };
export const dynamic = 'force-dynamic';

/**
 * `/t/[id]/auction` — the auction room (PLAN §7.6–7.8). One URL for every participant; the view
 * follows the role in THIS tournament: organisers get the console, captains the phone bidding
 * view, soldiers their live status card. Anyone else gets 404.
 */
export default async function AuctionPage({ params }: PageProps<'/t/[id]/auction'>) {
  const { id } = await params;
  let data: AuctionPageData;
  try {
    data = await getAuctionPageData(await getSessionUserId(), id);
  } catch (err) {
    if (isNotFound(err)) notFound();
    if (isAuctionNotStarted(err)) return <AuctionNotStarted />;
    throw err;
  }
  const { viewer } = data;
  const info = {
    tournamentId: data.tournament.id,
    tournamentName: data.tournament.name,
    settings: data.settings,
    organiserNames: Object.fromEntries(data.organisers.map((o) => [o.userId, o.name])),
    captainUserIds: data.captainUserIds,
  };

  let view: React.ReactNode;
  if (viewer.isOrganiser) view = <AuctioneerConsole viewer={viewer} />;
  else if (viewer.teamId) view = <CaptainBidView viewer={viewer} teamId={viewer.teamId} />;
  else if (viewer.playerId) view = <SoldierAuctionView playerId={viewer.playerId} />;
  else {
    view = (
      <Card className="mx-auto max-w-lg">
        <CardHeader>
          <CardTitle>Set up your team first</CardTitle>
          <CardDescription>Captains bid once their team card is ready.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <AuctionProvider info={info} initialSnapshot={data.snapshot}>
      {view}
    </AuctionProvider>
  );
}
