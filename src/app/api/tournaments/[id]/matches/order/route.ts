import { reorderRequestSchema } from '@/features/format/schemas';
import { getSessionUserId } from '@/server/auth/session';
import { handle, json, parseJson } from '@/server/http';
import { reorderMatches } from '@/server/services/matches/results';

/** PATCH /api/tournaments/:id/matches/order — reorder unplayed matches within a stage (§4.6). */
export const PATCH = handle<{ id: string }>(async (req, { params }) => {
  const { id } = await params;
  const { orderedIds } = await parseJson(req, reorderRequestSchema);
  return json(await reorderMatches(await getSessionUserId(), id, orderedIds));
});
