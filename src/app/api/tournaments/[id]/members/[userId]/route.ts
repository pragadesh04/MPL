import { changeMemberRoleSchema } from '@/features/identity/schemas';
import { requireSessionUserId } from '@/server/auth/session';
import { handle, json, parseJson } from '@/server/http';
import { changeMemberRole, removeMember } from '@/server/services/organisers/organisers';

type Params = { id: string; userId: string };

/** PATCH /api/tournaments/:id/members/:userId — owner changes co-admin ⇄ auctioneer. */
export const PATCH = handle<Params>(async (req, { params }) => {
  const actor = await requireSessionUserId();
  const { id, userId } = await params;
  await changeMemberRole(actor, id, userId, await parseJson(req, changeMemberRoleSchema));
  return json({ ok: true });
});

/** DELETE /api/tournaments/:id/members/:userId — owner removes an organiser. */
export const DELETE = handle<Params>(async (_req, { params }) => {
  const actor = await requireSessionUserId();
  const { id, userId } = await params;
  await removeMember(actor, id, userId);
  return json({ ok: true });
});
