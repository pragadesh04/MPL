import { updateSnapshotSchema } from '@/features/identity/schemas';
import { requireSessionUserId } from '@/server/auth/session';
import { handle, json, parseJson } from '@/server/http';
import { getMyCard, updateMySnapshot } from '@/server/services/people/teams';

/** GET /api/tournaments/:id/me — my captain / soldier card (also while pending). */
export const GET = handle<{ id: string }>(async (_req, { params }) => {
  const userId = await requireSessionUserId();
  const { id } = await params;
  return json(await getMyCard(userId, id));
});

/** PATCH /api/tournaments/:id/me — update my profile snapshot before Start. */
export const PATCH = handle<{ id: string }>(async (req, { params }) => {
  const userId = await requireSessionUserId();
  const { id } = await params;
  await updateMySnapshot(userId, id, await parseJson(req, updateSnapshotSchema));
  return json({ ok: true });
});
