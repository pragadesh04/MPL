import { joinWithKeySchema } from '@/features/identity/schemas';
import { requireSessionUserId } from '@/server/auth/session';
import { handle, json, parseJson } from '@/server/http';
import { joinWithKeyInput } from '@/server/services/joining/organiserKey';

/** POST /api/organiser-keys/:key/join — logged-in player joins as a PENDING captain/soldier. */
export const POST = handle<{ key: string }>(async (req, { params }) => {
  const userId = await requireSessionUserId();
  const { key } = await params;
  const { role } = await parseJson(req, joinWithKeySchema);
  return json(await joinWithKeyInput(userId, key, role));
});
