import { requireSessionUserId } from '@/server/auth/session';
import { handle, json } from '@/server/http';
import { issueParticipantReset } from '@/server/services/passwords/passwords';

/** POST /api/tournaments/:id/participants/:userId/reset-password — one-time link (30 min). */
export const POST = handle<{ id: string; userId: string }>(async (_req, { params }) => {
  const actor = await requireSessionUserId();
  const { id, userId } = await params;
  return json(await issueParticipantReset(actor, id, userId));
});
