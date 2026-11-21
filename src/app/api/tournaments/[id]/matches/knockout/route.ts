import { getSessionUserId } from '@/server/auth/session';
import { handle, json } from '@/server/http';
import { generateKnockout } from '@/server/services/matches/results';

/** POST /api/tournaments/:id/matches/knockout — Generate knockout from final standings (§4.4). */
export const POST = handle<{ id: string }>(async (_req, { params }) => {
  const { id } = await params;
  return json(await generateKnockout(await getSessionUserId(), id));
});
