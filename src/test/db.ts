/**
 * Test database helpers (PGlite, in-process). Services run against this in Vitest.
 * PGlite is ONE connection: race / concurrency tests belong in tests/concurrency (real Postgres).
 */
import { connect, type Connection, type Db } from '@/server/db/connect';
import { migrateConnection } from '@/server/db/migrate';
import { setTestDb } from '@/server/db/client';

export interface TestDb {
  db: Db;
  conn: Connection;
  close: () => Promise<void>;
}

/** A fresh in-memory PGlite database with every migration applied. */
export async function createTestDb(): Promise<TestDb> {
  const conn = connect('pglite:memory');
  await migrateConnection(conn);
  return { db: conn.db, conn, close: () => conn.close() };
}

/**
 * Vitest helper: one fresh database per test file, wired into `getDb()` so services under test
 * use it. Call at the top level of a test file:
 *
 *   const t = useTestDb();
 *   it('…', async () => { await t.db.insert(users)… });
 */
export function useTestDb(): { readonly db: Db } {
  let current: TestDb | undefined;
  beforeAll(async () => {
    current = await createTestDb();
    setTestDb(current.db);
  });
  afterAll(async () => {
    setTestDb(null);
    await current?.close();
  });
  return {
    get db(): Db {
      if (!current) throw new Error('useTestDb: database not ready (use it inside a test)');
      return current.db;
    },
  };
}
