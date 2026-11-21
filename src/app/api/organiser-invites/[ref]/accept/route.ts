import { idSchema } from '@/lib/schemas/domain';
import { requireSessionUserId } from '@/server/auth/session';
import { handle, json } from '@/server/http';
import { acceptOrganiserInvite } from '@/server/services/organisers/organisers';

/**
 * POST /api/organiser-invites/:ref/accept — `ref` is the link token, or the invite id when
 * accepting from the dashboard banner (only the invited account can do that).
 */
export const POST = handle<{ ref: string }>(async (_req, { params }) => {
  const userId = await requireSessionUserId();
  const { ref } = await params;
  const target = idSchema.safeParse(ref).success ? { inviteId: ref } : { token: ref };
  return json(await acceptOrganiserInvite(userId, target));
});
