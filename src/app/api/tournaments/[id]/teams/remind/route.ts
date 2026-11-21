import { requireSessionUserId } from '@/server/auth/session';
import { handle, json } from '@/server/http';
import { sendTeamReminder } from '@/server/services/people/teams';

/** POST /api/tournaments/:id/teams/remind — notify unfinished captains + links for WhatsApp. */
export const POST = handle<{ id: string }>(async (_req, { params }) => {
  const userId = await requireSessionUserId();
  const { id } = await params;
  return json(await sendTeamReminder(userId, id));
});
