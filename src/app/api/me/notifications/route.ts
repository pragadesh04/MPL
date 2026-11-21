import { requireSessionUserId } from '@/server/auth/session';
import { handle, json } from '@/server/http';
import { listNotifications } from '@/server/services/notifications/notifications';

/** GET /api/me/notifications — inbox + unread count (bell badge). */
export const GET = handle(async () => json(await listNotifications(await requireSessionUserId())));
