import { getSessionUserId } from '@/server/auth/session';
import { handle, json } from '@/server/http';
import { runTiebreakDraw } from '@/server/services/matches/results';

/** POST /api/tournaments/:id/groups/:gid/tiebreak — organiser-run draw for level teams (§4.3). */
export const POST = handle<{ id: string; gid: string }>(async (_req, { params }) => {
  const { id, gid } = await params;
  return json(await runTiebreakDraw(await getSessionUserId(), id, gid));
});
