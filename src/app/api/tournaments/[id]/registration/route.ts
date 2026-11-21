import { registrationSchema } from '@/features/identity/schemas';
import { requireSessionUserId } from '@/server/auth/session';
import { handle, json, parseJson } from '@/server/http';
import { setRegistration } from '@/server/services/tournaments/tournaments';

/** PATCH /api/tournaments/:id/registration — organiser-key sign-ups open/closed + cap. */
export const PATCH = handle<{ id: string }>(async (req, { params }) => {
  const userId = await requireSessionUserId();
  const { id } = await params;
  await setRegistration(userId, id, await parseJson(req, registrationSchema));
  return json({ ok: true });
});
