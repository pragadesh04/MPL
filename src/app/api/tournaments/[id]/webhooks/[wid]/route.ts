import { getSessionUserId } from '@/server/auth/session';
import { handle, json, parseJson } from '@/server/http';
import { updateWebhookBodySchema } from '@/server/services/webhooks/schemas';
import { deleteWebhook, updateWebhook } from '@/server/services/webhooks/service';

export const runtime = 'nodejs';

type Params = { id: string; wid: string };

/** PATCH /api/tournaments/:id/webhooks/:wid — change events, enabled or URL. */
export const PATCH = handle<Params>(async (req, { params }) => {
  const { id, wid } = await params;
  const body = await parseJson(req, updateWebhookBodySchema);
  return json(await updateWebhook(await getSessionUserId(), id, wid, body));
});

/** DELETE /api/tournaments/:id/webhooks/:wid */
export const DELETE = handle<Params>(async (_req, { params }) => {
  const { id, wid } = await params;
  await deleteWebhook(await getSessionUserId(), id, wid);
  return new Response(null, { status: 204 });
});
