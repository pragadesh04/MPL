import { getSessionUserId } from '@/server/auth/session';
import { handle, json } from '@/server/http';
import { sendTestWebhook } from '@/server/services/webhooks/service';

type Params = { id: string; wid: string };

/** POST /api/tournaments/:id/webhooks/:wid/test — send a sample `lot.sold` now (one attempt). */
export const POST = handle<Params>(async (_req, { params }) => {
  const { id, wid } = await params;
  return json(await sendTestWebhook(await getSessionUserId(), id, wid));
});
