import { requireSessionUserId } from '@/server/auth/session';
import { handle, json } from '@/server/http';
import { claimInvite } from '@/server/services/joining/personalLink';

/** POST /api/invites/:token/claim — link my account to this spot (one-time). */
export const POST = handle<{ token: string }>(async (_req, { params }) => {
  const userId = await requireSessionUserId();
  const { token } = await params;
  return json(await claimInvite(userId, token));
});
