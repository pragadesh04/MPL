import { getSessionUserId } from '@/server/auth/session';
import { getDb } from '@/server/db/client';
import { dbNow } from '@/server/db/sql';
import { assertDevTools } from '@/server/dev';
import { unauthenticated } from '@/server/errors';
import { handle, json } from '@/server/http';
import { getPublishedEvents, isRealtimeEnabled, publishInbox } from '@/server/realtime/publisher';

/**
 * POST /api/dev/realtime-ping — DEV ONLY. Publishes a test `notification.new` event to the
 * caller's own `u:<userId>` channel, to check the Ably key, token endpoint and client end to end
 * (PLAN §10 M0 "test publish"). Without ABLY_API_KEY the event is only recorded.
 */
export const POST = handle(async () => {
  assertDevTools();
  const userId = await getSessionUserId();
  if (!userId) throw unauthenticated();
  await publishInbox(userId, null, await dbNow(getDb()), 'notification.new', {
    notificationId: 1,
    type: 'dev.ping',
  });
  return json({
    sent: isRealtimeEnabled(),
    recorded: isRealtimeEnabled() ? 0 : getPublishedEvents().length,
  });
});
