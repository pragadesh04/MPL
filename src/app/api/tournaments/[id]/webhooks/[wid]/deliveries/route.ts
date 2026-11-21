import { z } from 'zod';
import { getSessionUserId } from '@/server/auth/session';
import { handle, json, parseQuery } from '@/server/http';
import { listWebhookDeliveries } from '@/server/services/webhooks/service';

type Params = { id: string; wid: string };

const querySchema = z.object({ limit: z.coerce.number().int().min(1).max(200).optional() });

/** GET /api/tournaments/:id/webhooks/:wid/deliveries — recent deliveries, newest first. */
export const GET = handle<Params>(async (req, { params }) => {
  const { id, wid } = await params;
  const { limit } = parseQuery(req, querySchema);
  return json(await listWebhookDeliveries(await getSessionUserId(), id, wid, limit));
});
