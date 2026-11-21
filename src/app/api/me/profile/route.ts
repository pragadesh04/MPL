import { updateProfileSchema } from '@/features/identity/schemas';
import { requireSessionUserId } from '@/server/auth/session';
import { handle, json, parseJson } from '@/server/http';
import { updateProfile } from '@/server/services/accounts/accounts';

/** PATCH /api/me/profile — my account profile; refreshes snapshots in unstarted tournaments. */
export const PATCH = handle(async (req) => {
  const userId = await requireSessionUserId();
  return json({ user: await updateProfile(userId, await parseJson(req, updateProfileSchema)) });
});
