import { getSessionUserId } from '@/server/auth/session';
import { handle, json } from '@/server/http';
import { listMembers } from '@/server/services/organisers/organisers';

/** GET /api/tournaments/:id/members — organisers + pending invites (any organiser). */
export const GET = handle<{ id: string }>(async (_req, { params }) => {
  const { id } = await params;
  return json(await listMembers(await getSessionUserId(), id));
});
