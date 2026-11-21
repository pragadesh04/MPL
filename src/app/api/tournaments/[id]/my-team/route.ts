import { teamSetupSchema } from '@/features/identity/schemas';
import { getSessionUserId, requireSessionUserId } from '@/server/auth/session';
import { handle, json, parseJson } from '@/server/http';
import { getMyTeamSetup, upsertMyTeam } from '@/server/services/people/teams';

/** GET /api/tournaments/:id/my-team — my team + other teams' names / colours (captain). */
export const GET = handle<{ id: string }>(async (_req, { params }) => {
  const { id } = await params;
  return json(await getMyTeamSetup(await getSessionUserId(), id));
});

/** PUT /api/tournaments/:id/my-team — create / update my team (captain, before Start). */
export const PUT = handle<{ id: string }>(async (req, { params }) => {
  const userId = await requireSessionUserId();
  const { id } = await params;
  return json(await upsertMyTeam(userId, id, await parseJson(req, teamSetupSchema)));
});
