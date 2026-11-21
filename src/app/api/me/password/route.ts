import { changePasswordSchema } from '@/features/identity/schemas';
import { requireSessionUserId } from '@/server/auth/session';
import { handle, json, parseJson } from '@/server/http';
import { changePassword } from '@/server/services/accounts/accounts';

/** POST /api/me/password — change my password while logged in (§2.5). */
export const POST = handle(async (req) => {
  const userId = await requireSessionUserId();
  await changePassword(userId, await parseJson(req, changePasswordSchema));
  return json({ ok: true });
});
