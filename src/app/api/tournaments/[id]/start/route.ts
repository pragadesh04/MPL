import { confirmNameSchema } from '@/features/identity/schemas';
import { getSessionUserId, requireSessionUserId } from '@/server/auth/session';
import { handle, json, parseJson } from '@/server/http';
import { getReadiness, startTournament } from '@/server/services/start/start';

/** GET /api/tournaments/:id/start — the §3.5 checklist (organisers). */
export const GET = handle<{ id: string }>(async (_req, { params }) => {
  const { id } = await params;
  return json(await getReadiness(await getSessionUserId(), id));
});

/** POST /api/tournaments/:id/start — `{ confirmName }`; validate, lock, close, start. */
export const POST = handle<{ id: string }>(async (req, { params }) => {
  const userId = await requireSessionUserId();
  const { id } = await params;
  return json(await startTournament(userId, id, await parseJson(req, confirmNameSchema)));
});
