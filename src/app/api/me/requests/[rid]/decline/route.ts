import { declineRequestSchema } from '@/features/identity/schemas';
import { requireSessionUserId } from '@/server/auth/session';
import { handle, json, parseJson } from '@/server/http';
import { declineJoinRequest } from '@/server/services/joining/requests';

/** POST /api/me/requests/:rid/decline — `{ block?: true }` also blocks that organiser. */
export const POST = handle<{ rid: string }>(async (req, { params }) => {
  const userId = await requireSessionUserId();
  const { rid } = await params;
  await declineJoinRequest(userId, rid, await parseJson(req, declineRequestSchema));
  return json({ ok: true });
});
