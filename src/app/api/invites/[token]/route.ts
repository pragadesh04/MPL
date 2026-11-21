import { getSessionUserId } from '@/server/auth/session';
import { clientIp, handle, json } from '@/server/http';
import { previewInvite } from '@/server/services/joining/personalLink';

/** GET /api/invites/:token — public preview of a personal link (same 404 for anything invalid). */
export const GET = handle<{ token: string }>(async (req, { params }) => {
  const { token } = await params;
  return json(await previewInvite(token, clientIp(req), await getSessionUserId()));
});
