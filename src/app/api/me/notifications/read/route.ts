import { markReadSchema } from '@/features/identity/schemas';
import { requireSessionUserId } from '@/server/auth/session';
import { handle, json, parseJson } from '@/server/http';
import { markNotificationsRead } from '@/server/services/notifications/notifications';

/** POST /api/me/notifications/read — `{ ids? }` (all when omitted). */
export const POST = handle(async (req) => {
  const userId = await requireSessionUserId();
  const { ids } = await parseJson(req, markReadSchema);
  return json(await markNotificationsRead(userId, ids));
});
