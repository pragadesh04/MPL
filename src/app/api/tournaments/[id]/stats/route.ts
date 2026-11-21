import { getSessionUserId } from '@/server/auth/session';
import { handle, json } from '@/server/http';
import { getStats } from '@/server/services/stats/stats';

/** GET /api/tournaments/:id/stats — leaderboards for any participant (§7.13). */
export const GET = handle<{ id: string }>(async (_req, { params }) => {
  const { id } = await params;
  const { leaderboards, serverNow } = await getStats(await getSessionUserId(), id);
  return json({ serverNow, leaderboards });
});
