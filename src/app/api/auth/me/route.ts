import { requireSessionUserId } from '@/server/auth/session';
import { handle, json } from '@/server/http';
import { getUser } from '@/server/services/accounts/accounts';

/** GET /api/auth/me — my public profile (never the password hash). 401 when logged out. */
export const GET = handle(async () => json({ user: await getUser(await requireSessionUserId()) }));
