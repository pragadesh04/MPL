import { loginSchema } from '@/features/identity/schemas';
import { setSession } from '@/server/auth/session';
import { clientIp, handle, json, parseJson } from '@/server/http';
import { login } from '@/server/services/accounts/accounts';

/** POST /api/auth/login — username + password, rate-limited per IP and username (§2.5). */
export const POST = handle(async (req) => {
  const user = await login(await parseJson(req, loginSchema), clientIp(req));
  await setSession(user.id);
  return json({ user });
});
