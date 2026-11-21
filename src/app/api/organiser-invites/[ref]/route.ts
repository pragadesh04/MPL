import { requireSessionUserId } from '@/server/auth/session';
import { clientIp, handle, json } from '@/server/http';
import {
  getOrganiserInvitePreview,
  revokeOrganiserInvite,
} from '@/server/services/organisers/organisers';

/**
 * `[ref]` is the link token for GET / accept, and the invite id for DELETE (Next needs one
 * segment name per level).
 */

/** GET /api/organiser-invites/:token — preview (logged in or not; same 404 for any bad link). */
export const GET = handle<{ ref: string }>(async (req, { params }) => {
  const { ref } = await params;
  return json(await getOrganiserInvitePreview(ref, clientIp(req)));
});

/** DELETE /api/organiser-invites/:id — owner revokes a pending invite. */
export const DELETE = handle<{ ref: string }>(async (_req, { params }) => {
  const userId = await requireSessionUserId();
  const { ref } = await params;
  await revokeOrganiserInvite(userId, ref);
  return json({ ok: true });
});
