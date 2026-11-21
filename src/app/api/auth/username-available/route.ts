import { clientIp, handle, json } from '@/server/http';
import { isUsernameAvailable } from '@/server/services/accounts/accounts';

/** GET /api/auth/username-available?u= — live check on the sign-up forms (rate-limited). */
export const GET = handle(async (req) => {
  const u = new URL(req.url).searchParams.get('u') ?? '';
  return json(await isUsernameAvailable(u, clientIp(req)));
});
