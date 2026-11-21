import { requireSessionUserId } from '@/server/auth/session';
import { handle, json } from '@/server/http';
import { listMyRequests } from '@/server/services/joining/requests';

/** GET /api/me/requests — my incoming pending requests. */
export const GET = handle(async () =>
  json({ requests: await listMyRequests(await requireSessionUserId()) }),
);
