import { confirmNameSchema } from '@/features/identity/schemas';
import { requireSessionUserId } from '@/server/auth/session';
import { handle, json, parseJson } from '@/server/http';
import { cancelTournament } from '@/server/services/tournaments/tournaments';

/** POST /api/tournaments/:id/cancel — owner only, `{ confirmName }` (frees the active slot). */
export const POST = handle<{ id: string }>(async (req, { params }) => {
  const userId = await requireSessionUserId();
  const { id } = await params;
  await cancelTournament(userId, id, await parseJson(req, confirmNameSchema));
  return json({ ok: true });
});
