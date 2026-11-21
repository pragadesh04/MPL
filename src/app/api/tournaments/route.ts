import { createTournamentSchema } from '@/features/identity/schemas';
import { requireSessionUserId } from '@/server/auth/session';
import { handle, json, parseJson } from '@/server/http';
import { createTournament } from '@/server/services/tournaments/tournaments';

/** POST /api/tournaments — create (409 if I already own an active tournament). */
export const POST = handle(async (req) => {
  const userId = await requireSessionUserId();
  const body = await parseJson(req, createTournamentSchema);
  return json(await createTournament(userId, body), { status: 201 });
});
