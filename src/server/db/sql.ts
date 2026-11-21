/**
 * Small helpers over raw SQL that behave the same on Neon, node-postgres and PGlite.
 * Prefer the query builder (including `.for('update')` for row locks); use these for the odd
 * statement the builder can't express. No `server-only` (scripts use it too).
 */
import { sql, type SQL } from 'drizzle-orm';
import type { Db } from './connect';

/** Run a raw query and return its rows, typed by the caller. */
export async function rows<T extends Record<string, unknown>>(db: Db, query: SQL): Promise<T[]> {
  const result: unknown = await db.execute(query);
  // Neon, node-postgres and PGlite all return `{ rows: [...] }`; neon-http returns rows too.
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === 'object' && 'rows' in result && Array.isArray(result.rows)) {
    return result.rows as T[];
  }
  throw new Error('Unexpected driver result shape from db.execute');
}

/**
 * Postgres `now()` — THE clock (PLAN §6.1). Inside a transaction `now()` is the transaction
 * start time, so every step of one settle/bid sees the same instant.
 */
export async function dbNow(db: Db): Promise<Date> {
  const [row] = await rows<{ now: Date | string }>(db, sql`select now() as now`);
  if (!row) throw new Error('select now() returned no row');
  return row.now instanceof Date ? row.now : new Date(row.now);
}
