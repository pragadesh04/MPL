import { z } from 'zod';
import { getSessionUserId } from '@/server/auth/session';
import { handle, json, parseJson } from '@/server/http';
import { tickAuction } from '@/server/services/auction/snapshot';

const bodySchema = z.object({ liveCode: z.string().min(1).max(64).optional() }).loose();

/**
 * POST /api/tournaments/:id/auction/tick — the idempotent nudge every connected client sends when
 * a countdown (lot or break) reaches 0 (PLAN §6.2). Exactly one caller applies each due step;
 * the rest are no-ops. Answers with the snapshot.
 */
export const POST = handle<{ id: string }>(async (req, { params }) => {
  const { id } = await params;
  const { liveCode } = await parseJson(req, bodySchema);
  const userId = liveCode ? null : await getSessionUserId();
  return json(await tickAuction({ userId, liveCode }, id));
});
