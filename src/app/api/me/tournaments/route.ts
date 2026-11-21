import { requireSessionUserId } from '@/server/auth/session';
import { handle, json } from '@/server/http';
import { listMyTournaments } from '@/server/services/tournaments/tournaments';

/** GET /api/me/tournaments — every tournament I'm in, with my role(s). Feeds the switcher. */
export const GET = handle(async () =>
  json({ tournaments: await listMyTournaments(await requireSessionUserId()) }),
);
