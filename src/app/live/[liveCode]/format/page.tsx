import { notFound } from 'next/navigation';
import { BigScreenFormat } from '@/features/public/components/big-screen-format';
import { RealtimeProvider } from '@/lib/realtime/provider';
import { isAppError } from '@/server/errors';
import { isRealtimeEnabled } from '@/server/realtime/publisher';
import { loadLiveScreen } from '@/server/services/format/home';

export const metadata = { title: 'Big screen' };

/**
 * Big screen, format part (§7.7, §4.6): groups, bracket, match order and champion for the
 * projector. No login; the live code is the key and organisers can switch it off (then 404).
 * The auction part of `/live/[liveCode]` is Lane B's; Phase 2 decides which one the bare
 * `/live/[liveCode]` shows by status (see docs/lanes/LANE-C.md).
 */
export default async function LiveFormatPage({ params }: PageProps<'/live/[liveCode]/format'>) {
  const { liveCode } = await params;
  let data;
  try {
    data = await loadLiveScreen(liveCode);
  } catch (err) {
    if (isAppError(err) && err.code === 'NOT_FOUND') notFound();
    throw err;
  }
  const { counts, rules: _rules, ...format } = data;
  return (
    <RealtimeProvider enabled={isRealtimeEnabled()} liveCode={liveCode}>
      <BigScreenFormat data={format} counts={counts} />
    </RealtimeProvider>
  );
}
