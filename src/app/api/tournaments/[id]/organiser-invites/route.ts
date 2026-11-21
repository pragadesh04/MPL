import { createOrganiserInviteSchema } from '@/features/identity/schemas';
import { requireSessionUserId } from '@/server/auth/session';
import { handle, json, parseJson } from '@/server/http';
import { createOrganiserInvite } from '@/server/services/organisers/organisers';

/** POST /api/tournaments/:id/organiser-invites — owner: `{ emailOrUsername, role }` → link. */
export const POST = handle<{ id: string }>(async (req, { params }) => {
  const userId = await requireSessionUserId();
  const { id } = await params;
  const invite = await createOrganiserInvite(
    userId,
    id,
    await parseJson(req, createOrganiserInviteSchema),
  );
  return json(invite, { status: 201 });
});
