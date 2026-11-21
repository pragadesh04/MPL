import { requireSessionUserId } from '@/server/auth/session';
import { handle, json } from '@/server/http';
import { acceptJoinRequest } from '@/server/services/joining/requests';

/** POST /api/me/requests/:rid/accept — join already approved. */
export const POST = handle<{ rid: string }>(async (_req, { params }) => {
  const userId = await requireSessionUserId();
  const { rid } = await params;
  return json(await acceptJoinRequest(userId, rid));
});
