import { updateBasicsSchema } from '@/features/identity/schemas';
import { getSessionUserId, requireSessionUserId } from '@/server/auth/session';
import { handle, json, parseJson } from '@/server/http';
import { getTournamentForOrganiser, updateBasics } from '@/server/services/tournaments/tournaments';

/** GET /api/tournaments/:id — detail + settings for organisers. */
export const GET = handle<{ id: string }>(async (_req, { params }) => {
  const { id } = await params;
  return json(await getTournamentForOrganiser(await getSessionUserId(), id));
});

/** PATCH /api/tournaments/:id — Basics step (name, logo). Before Start only. */
export const PATCH = handle<{ id: string }>(async (req, { params }) => {
  const userId = await requireSessionUserId();
  const { id } = await params;
  await updateBasics(userId, id, await parseJson(req, updateBasicsSchema));
  return json({ ok: true });
});
