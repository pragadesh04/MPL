import 'server-only';
import { sql } from 'drizzle-orm';
import { getDb, type Db } from './db/client';
import { rows } from './db/sql';
import { rateLimited } from './errors';

/**
 * Postgres-backed fixed-window rate limiting (`rate_limits` table). In-memory counters don't work
 * across serverless instances (CLAUDE.md). One atomic upsert per call; the database clock decides
 * the window.
 *
 * Key convention: `<action>:<scope>:<value>`, e.g. `login:ip:1.2.3.4`, `login:user:ravi`,
 * `player-lookup:user:<uuid>`, `join-request:organiser:<uuid>:day`.
 */
export interface RateLimitResult {
  allowed: boolean;
  count: number;
  limit: number;
  retryAfterSeconds: number;
}

export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
  db: Db = getDb(),
): Promise<RateLimitResult> {
  const window = sql.raw(`interval '${Math.max(1, Math.floor(windowSeconds))} seconds'`);
  const [row] = await rows<{ count: number; retry_after: number }>(
    db,
    sql`
      insert into rate_limits (key, count, window_start)
      values (${key}, 1, now())
      on conflict (key) do update set
        count = case when rate_limits.window_start <= now() - ${window} then 1 else rate_limits.count + 1 end,
        window_start = case when rate_limits.window_start <= now() - ${window} then now() else rate_limits.window_start end
      returning count,
        greatest(0, ceil(extract(epoch from (window_start + ${window} - now()))))::int as retry_after
    `,
  );
  const count = Number(row?.count ?? 1);
  return {
    allowed: count <= limit,
    count,
    limit,
    retryAfterSeconds: Number(row?.retry_after ?? windowSeconds),
  };
}

/** Throws 429 (`RATE_LIMITED`) once `key` exceeds `limit` calls per `windowSeconds`. */
export async function enforceRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
  db: Db = getDb(),
): Promise<void> {
  const result = await checkRateLimit(key, limit, windowSeconds, db);
  if (!result.allowed) throw rateLimited(result.retryAfterSeconds);
}
