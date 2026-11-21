import { getDb } from '@/server/db/client';
import { dbNow } from '@/server/db/sql';
import { json } from '@/server/http';
import { logger } from '@/server/logger';
import { isRealtimeEnabled } from '@/server/realtime/publisher';

/** GET /api/health — database ping (PLAN §10 M0). 503 when the database is unreachable. */
export async function GET(): Promise<Response> {
  try {
    const serverNow = await dbNow(getDb());
    return json({
      ok: true,
      db: 'up',
      realtime: isRealtimeEnabled() ? 'enabled' : 'disabled',
      serverNow: serverNow.toISOString(),
    });
  } catch (err) {
    logger.error({ err }, 'health check failed');
    return json({ ok: false, db: 'down' }, { status: 503 });
  }
}
