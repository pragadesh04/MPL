import { notFound } from 'next/navigation';
import { BigScreenAuction } from '@/features/auction/big-screen/big-screen-auction';
import { AuctionProvider } from '@/features/auction/shared/auction-context';
import {
  AuctionNotStarted,
  isAuctionNotStarted,
  isNotFound,
} from '@/features/auction/shared/auction-unavailable';
import { RealtimeProvider } from '@/lib/realtime/provider';
import { isRealtimeEnabled } from '@/server/realtime/publisher';
import { getLiveAuctionPageData } from '@/server/services/auction/page-data';

export const metadata = { title: 'Live auction' };
export const dynamic = 'force-dynamic';

/**
 * `/live/[liveCode]/auction` — big-screen auction view (PLAN §7.7), no login. Lane C owns the
 * rest of `/live/[liveCode]`; integration links this view from there while the auction runs.
 */
export default async function LiveAuctionPage({ params }: PageProps<'/live/[liveCode]/auction'>) {
  const { liveCode } = await params;
  let data: Awaited<ReturnType<typeof getLiveAuctionPageData>>;
  try {
    data = await getLiveAuctionPageData(liveCode);
  } catch (err) {
    if (isNotFound(err)) notFound();
    if (isAuctionNotStarted(err)) return <AuctionNotStarted />;
    throw err;
  }
  return (
    <RealtimeProvider enabled={isRealtimeEnabled()} liveCode={liveCode}>
      <AuctionProvider
        liveCode={liveCode}
        initialSnapshot={data.snapshot}
        info={{
          tournamentId: data.tournament.id,
          tournamentName: data.tournament.name,
          settings: data.settings,
          organiserNames: {},
          captainUserIds: data.captainUserIds,
        }}
      >
        <BigScreenAuction />
      </AuctionProvider>
    </RealtimeProvider>
  );
}
