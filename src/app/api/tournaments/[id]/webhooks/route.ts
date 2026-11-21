import { getSessionUserId } from '@/server/auth/session';
import { handle, json, parseJson } from '@/server/http';
import { createWebhookBodySchema } from '@/server/services/webhooks/schemas';
import { createWebhook, listWebhooks } from '@/server/services/webhooks/service';

type Params = { id: string };

/** GET /api/tournaments/:id/webhooks — the tournament's webhooks (masked URLs). Owner / co-admin. */
export const GET = handle<Params>(async (_req, { params }) => {
  const { id } = await params;
  return json(await listWebhooks(await getSessionUserId(), id));
});

/**
 * POST /api/tournaments/:id/webhooks — add a Discord or generic webhook. The response carries a
 * GENERIC webhook's signing secret once (`signingSecret`); it is never shown again.
 */
export const POST = handle<Params>(async (req, { params }) => {
  const { id } = await params;
  const body = await parseJson(req, createWebhookBodySchema);
  return json(await createWebhook(await getSessionUserId(), id, body), { status: 201 });
});
