import { matchPatchSchema } from '@/features/format/schemas';
import { getSessionUserId } from '@/server/auth/session';
import { handle, json, parseJson } from '@/server/http';
import { updateMatch } from '@/server/services/matches/results';

/**
 * PATCH /api/tournaments/:id/matches/:mid — owner / co-admin: mark live, set the time, or enter /
 * edit a result (PLAN §5 API, §7.11). Body: `matchPatchSchema`.
 */
export const PATCH = handle<{ id: string; mid: string }>(async (req, { params }) => {
  const { id, mid } = await params;
  const body = await parseJson(req, matchPatchSchema);
  return json(await updateMatch(await getSessionUserId(), id, mid, body));
});
