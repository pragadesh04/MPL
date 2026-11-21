import { placeBidRequestSchema } from '@/lib/schemas/auction';
import { getSessionUserId } from '@/server/auth/session';
import { handle, json, parseJson } from '@/server/http';
import { placeBid } from '@/server/services/auction/bids';

export const runtime = 'nodejs';

/**
 * POST /api/tournaments/:id/auction/bids — `{ amount, expectedVersion, commandId, teamId? }`.
 * 409 OUTBID when expectedVersion is stale, 409 TOO_LATE when the lot already closed, 409
 * RULE_VIOLATION with `details.reason` for a `canTeamBid` refusal. Answers with the snapshot.
 */
export const POST = handle<{ id: string }>(async (req, { params }) => {
  const { id } = await params;
  const body = await parseJson(req, placeBidRequestSchema);
  return json(await placeBid(await getSessionUserId(), id, body));
});
