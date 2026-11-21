import { getSessionUserId } from '@/server/auth/session';
import { handle, json, parseJson } from '@/server/http';
import {
  confirmAllocationSchema,
  confirmAllocation,
  previewAllocation,
} from '@/server/services/allocation/allocation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/tournaments/:id/auction/allocation — leftover allocation preview (§3.4). Organisers. */
export const GET = handle<{ id: string }>(async (_req, { params }) => {
  const { id } = await params;
  return json(await previewAllocation(await getSessionUserId(), id), {
    headers: { 'Cache-Control': 'no-store' },
  });
});

/**
 * POST /api/tournaments/:id/auction/allocation — confirm `{ commandId, overrides?, reason? }`.
 * Owner / co-admin. Ends with status GROUP_DRAW (Lane C's group draw takes over).
 */
export const POST = handle<{ id: string }>(async (req, { params }) => {
  const { id } = await params;
  const body = await parseJson(req, confirmAllocationSchema);
  return json(await confirmAllocation(await getSessionUserId(), id, body));
});
