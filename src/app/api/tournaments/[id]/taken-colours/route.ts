import { getSessionUserId } from '@/server/auth/session';
import { handle, json } from '@/server/http';
import { listTakenColours } from '@/server/services/people/teams';

/** GET /api/tournaments/:id/taken-colours — for the colour picker (captains, organisers). */
export const GET = handle<{ id: string }>(async (_req, { params }) => {
  const { id } = await params;
  return json({ teams: await listTakenColours(await getSessionUserId(), id) });
});
