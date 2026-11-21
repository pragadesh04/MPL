import { requireSessionUserId } from '@/server/auth/session';
import { handle, json } from '@/server/http';
import { cancelJoinRequest } from '@/server/services/joining/requests';

/** DELETE /api/tournaments/:id/requests/:rid — cancel a pending request. */
export const DELETE = handle<{ id: string; rid: string }>(async (_req, { params }) => {
  const userId = await requireSessionUserId();
  const { id, rid } = await params;
  await cancelJoinRequest(userId, id, rid);
  return json({ ok: true });
});
