import { importPeopleSchema } from '@/features/identity/schemas';
import { requireSessionUserId } from '@/server/auth/session';
import { handle, json, parseJson } from '@/server/http';
import { importPeople } from '@/server/services/people/people';

/** POST /api/tournaments/:id/people/import — mapped CSV rows; all or nothing. */
export const POST = handle<{ id: string }>(async (req, { params }) => {
  const userId = await requireSessionUserId();
  const { id } = await params;
  const added = await importPeople(userId, id, await parseJson(req, importPeopleSchema));
  return json({ added }, { status: 201 });
});
