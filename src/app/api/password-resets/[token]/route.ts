import { consumeResetSchema } from '@/features/identity/schemas';
import { clientIp, handle, json, parseJson } from '@/server/http';
import { consumeReset, getResetPreview } from '@/server/services/passwords/passwords';

/** GET /api/password-resets/:token — who the link is for (generic 404 otherwise). */
export const GET = handle<{ token: string }>(async (req, { params }) => {
  const { token } = await params;
  return json(await getResetPreview(token, clientIp(req)));
});

/** POST /api/password-resets/:token — `{ password }`; single use. */
export const POST = handle<{ token: string }>(async (req, { params }) => {
  const { token } = await params;
  return json(await consumeReset(token, await parseJson(req, consumeResetSchema), clientIp(req)));
});
