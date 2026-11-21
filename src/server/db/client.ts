import 'server-only';
import { env } from '../env';
import { logger } from '../logger';
import { connect, type Connection, type Db, type Tx } from './connect';

export type { Db, Tx } from './connect';

/**
 * App database access.
 *
 * - `getDb()`: transactions and writes (Neon Pool over WebSocket in production).
 * - `getReadDb()`: one-shot reads (Neon HTTP driver). Never call `.transaction()` on it.
 * - `withTransaction(fn)`: runs `fn` in a transaction and then the `onCommit` callbacks,
 *   which is where Ably publishes and webhooks go (publish only AFTER commit, PLAN §6.1).
 *
 * The connection is cached on globalThis so dev HMR doesn't open a second PGlite on the same
 * directory. Tests swap it with `setTestDb()` (see `src/test/db.ts`).
 */

const g = globalThis as typeof globalThis & {
  __mplConnection?: Connection;
  __mplTestDb?: Db;
};

function connection(): Connection {
  if (!g.__mplConnection) g.__mplConnection = connect(env().DATABASE_URL);
  return g.__mplConnection;
}

export function getDb(): Db {
  return g.__mplTestDb ?? connection().db;
}

export function getReadDb(): Db {
  return g.__mplTestDb ?? connection().readDb;
}

export type OnCommit = (callback: () => void | Promise<void>) => void;

/**
 * Run `fn` inside one transaction. Register side effects (Ably publish, webhooks, `after()`)
 * with `onCommit`; they run only once the transaction has committed, in order. A failing
 * callback is logged and never turns a committed write into an error.
 *
 * Keep auction transactions tiny: no network calls inside `fn` (PLAN §9 item 28).
 */
export async function withTransaction<T>(
  fn: (tx: Tx, onCommit: OnCommit) => Promise<T>,
  db: Db = getDb(),
): Promise<T> {
  const callbacks: (() => void | Promise<void>)[] = [];
  const result = await db.transaction((tx) => fn(tx, (cb) => callbacks.push(cb)));
  for (const cb of callbacks) {
    try {
      await cb();
    } catch (err) {
      logger.error({ err }, 'withTransaction: onCommit callback failed');
    }
  }
  return result;
}

/** Tests only: route `getDb()` / `getReadDb()` to a PGlite test database (or back with null). */
export function setTestDb(db: Db | null): void {
  g.__mplTestDb = db ?? undefined;
}
