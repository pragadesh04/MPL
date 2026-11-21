import { updateSettingsSchema } from '@/features/identity/schemas';
import { requireSessionUserId } from '@/server/auth/session';
import { handle, json, parseJson } from '@/server/http';
import { updateSettings } from '@/server/services/tournaments/tournaments';

/** PATCH /api/tournaments/:id/settings — Rules step (§3.1 + §4.1). Locked after Start except overrides. */
export const PATCH = handle<{ id: string }>(async (req, { params }) => {
  const userId = await requireSessionUserId();
  const { id } = await params;
  const settings = await updateSettings(userId, id, await parseJson(req, updateSettingsSchema));
  return json({ settings });
});
