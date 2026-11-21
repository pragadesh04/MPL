import { sendRequestSchema } from '@/features/identity/schemas';
import { getSessionUserId, requireSessionUserId } from '@/server/auth/session';
import { handle, json, parseJson } from '@/server/http';
import { listOutgoingRequests, sendJoinRequest } from '@/server/services/joining/requests';

/** GET /api/tournaments/:id/requests — outgoing Player ID requests. */
export const GET = handle<{ id: string }>(async (_req, { params }) => {
  const { id } = await params;
  return json({ requests: await listOutgoingRequests(await getSessionUserId(), id) });
});

/** POST /api/tournaments/:id/requests — `{ playerCode, role, purse? | basePrice? }`. */
export const POST = handle<{ id: string }>(async (req, { params }) => {
  const userId = await requireSessionUserId();
  const { id } = await params;
  return json(await sendJoinRequest(userId, id, await parseJson(req, sendRequestSchema)), {
    status: 201,
  });
});
