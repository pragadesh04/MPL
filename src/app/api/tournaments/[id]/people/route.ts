import { addPersonSchema } from '@/features/identity/schemas';
import { requireSessionUserId } from '@/server/auth/session';
import { handle, json, parseJson } from '@/server/http';
import { addPerson } from '@/server/services/people/people';

/** POST /api/tournaments/:id/people — `{ type: 'LEADER' | 'PLAYER', … }` → row + personal link. */
export const POST = handle<{ id: string }>(async (req, { params }) => {
  const userId = await requireSessionUserId();
  const { id } = await params;
  return json(await addPerson(userId, id, await parseJson(req, addPersonSchema)), { status: 201 });
});
