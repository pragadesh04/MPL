import { z } from 'zod';
import { getSessionUserId } from '@/server/auth/session';
import { unauthenticated } from '@/server/errors';
import { handle, json, parseJson } from '@/server/http';
import { createLiveScreenTokenRequest, createUserTokenRequest } from '@/server/realtime/token';

const bodySchema = z.object({ liveCode: z.string().min(1).max(64).optional() });

/**
 * POST /api/realtime/token — Ably TokenRequest (PLAN §6.3). Logged-in users get subscribe-only
 * access to their own inbox and the tournaments they take part in; big-screen viewers send
 * `{ liveCode }` and get one tournament (only while its live screen is enabled).
 * 503 SERVICE_UNAVAILABLE when ABLY_API_KEY isn't configured.
 */
export const POST = handle(async (req) => {
  const { liveCode } = await parseJson(req, bodySchema);
  if (liveCode) return json(await createLiveScreenTokenRequest(liveCode));
  const userId = await getSessionUserId();
  if (!userId) throw unauthenticated();
  return json(await createUserTokenRequest(userId));
});
