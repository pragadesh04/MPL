import { registerSchema } from '@/features/identity/schemas';
import { setSession } from '@/server/auth/session';
import { clientIp, handle, json, parseJson } from '@/server/http';
import { enforceRateLimit } from '@/server/rate-limit';
import { registerOrganiser, registerPlayer } from '@/server/services/accounts/accounts';

/**
 * POST /api/auth/register — organiser or player sign-up (PLAN §2.1, §7.0). Logs the new account
 * in. A player with a valid organiser key also gets a pending row in that organiser's tournament.
 */
export const POST = handle(async (req) => {
  // Per IP, generous on purpose: a whole squad often signs up together on one venue Wi-Fi
  // (one public IP behind NAT). 60 / 10 min still stops bulk account creation.
  await enforceRateLimit(`register:ip:${clientIp(req)}`, 60, 600);
  const body = await parseJson(req, registerSchema);
  if (body.accountType === 'ORGANISER') {
    const user = await registerOrganiser(body);
    await setSession(user.id);
    return json({ user, join: null }, { status: 201 });
  }
  const result = await registerPlayer(body);
  await setSession(result.user.id);
  return json(result, { status: 201 });
});
