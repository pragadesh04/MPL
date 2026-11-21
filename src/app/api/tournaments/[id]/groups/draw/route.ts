import { drawRequestSchema } from '@/features/format/schemas';
import { getSessionUserId } from '@/server/auth/session';
import { handle, json, parseJson } from '@/server/http';
import { drawGroups, undoGroupDraw } from '@/server/services/format/groupDraw';

/** POST /api/tournaments/:id/groups/draw — run the group draw (owner / co-admin, PLAN §4.2). */
export const POST = handle<{ id: string }>(async (req, { params }) => {
  const { id } = await params;
  const body = await parseJson(req, drawRequestSchema);
  return json(await drawGroups(await getSessionUserId(), id, body));
});

/** DELETE /api/tournaments/:id/groups/draw — undo the draw while nothing has been played. */
export const DELETE = handle<{ id: string }>(async (_req, { params }) => {
  const { id } = await params;
  return json(await undoGroupDraw(await getSessionUserId(), id));
});
