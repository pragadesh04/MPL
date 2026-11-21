import { transferOwnershipSchema } from '@/features/identity/schemas';
import { requireSessionUserId } from '@/server/auth/session';
import { handle, json, parseJson } from '@/server/http';
import { transferOwnership } from '@/server/services/organisers/organisers';

/** POST /api/tournaments/:id/transfer-ownership — owner hands the tournament to a co-admin. */
export const POST = handle<{ id: string }>(async (req, { params }) => {
  const userId = await requireSessionUserId();
  const { id } = await params;
  await transferOwnership(userId, id, await parseJson(req, transferOwnershipSchema));
  return json({ ok: true });
});
