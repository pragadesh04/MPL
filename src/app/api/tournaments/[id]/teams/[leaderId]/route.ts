import { teamSetupSchema } from '@/features/identity/schemas';
import { requireSessionUserId } from '@/server/auth/session';
import { handle, json, parseJson } from '@/server/http';
import { organiserUpdateTeam } from '@/server/services/people/teams';

/** PUT /api/tournaments/:id/teams/:leaderId — organisers fix a captain's team before Start. */
export const PUT = handle<{ id: string; leaderId: string }>(async (req, { params }) => {
  const userId = await requireSessionUserId();
  const { id, leaderId } = await params;
  return json(
    await organiserUpdateTeam(userId, id, leaderId, await parseJson(req, teamSetupSchema)),
  );
});
