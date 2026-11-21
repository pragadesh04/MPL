import { requireSessionUserId } from '@/server/auth/session';
import { handle, json } from '@/server/http';
import { regenerateOrganiserKey } from '@/server/services/accounts/accounts';

/** POST /api/me/organiser-key/regenerate — new key; the old one stops working (§2.3 B). */
export const POST = handle(async () =>
  json(await regenerateOrganiserKey(await requireSessionUserId())),
);
