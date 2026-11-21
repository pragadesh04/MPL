import { z } from 'zod';
import { getSessionUserId } from '@/server/auth/session';
import { handle, json, parseQuery } from '@/server/http';
import { getAuctionSnapshot, getLiveAuctionSnapshot } from '@/server/services/auction/snapshot';

export const dynamic = 'force-dynamic';

const querySchema = z.object({ liveCode: z.string().min(1).max(64).optional() });

/**
 * GET /api/tournaments/:id/auction — the auction snapshot (PLAN §5 API, §6.3). Any participant;
 * the big screen passes `?liveCode=` instead of a session. Settles anything due first.
 */
export const GET = handle<{ id: string }>(async (req, { params }) => {
  const { id } = await params;
  const { liveCode } = parseQuery(req, querySchema);
  const snapshot = liveCode
    ? await getLiveAuctionSnapshot(id, liveCode)
    : await getAuctionSnapshot(await getSessionUserId(), id);
  return json(snapshot, { headers: { 'Cache-Control': 'no-store' } });
});
