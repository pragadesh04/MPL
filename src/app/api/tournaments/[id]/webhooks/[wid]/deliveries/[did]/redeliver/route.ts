import { getSessionUserId } from '@/server/auth/session';
import { handle, json } from '@/server/http';
import { redeliverWebhookDelivery } from '@/server/services/webhooks/service';

type Params = { id: string; wid: string; did: string };

/**
 * POST /api/tournaments/:id/webhooks/:wid/deliveries/:did/redeliver — resend the stored payload
 * as a new delivery (one attempt, made now). Returns the new delivery.
 */
export const POST = handle<Params>(async (_req, { params }) => {
  const { id, wid, did } = await params;
  return json(await redeliverWebhookDelivery(await getSessionUserId(), id, wid, did));
});
