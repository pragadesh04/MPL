import { requireSessionUserId } from '@/server/auth/session';
import { clientIp, handle, json } from '@/server/http';
import { lookupPlayerCard } from '@/server/services/joining/requests';

/** GET /api/players/by-code/:playerCode — public card only (organisers, rate-limited). */
export const GET = handle<{ playerCode: string }>(async (req, { params }) => {
  const userId = await requireSessionUserId();
  const { playerCode } = await params;
  return json(await lookupPlayerCard(userId, decodeURIComponent(playerCode), clientIp(req)));
});
