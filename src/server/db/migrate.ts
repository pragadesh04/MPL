/**
 * Applies the committed SQL migrations in `drizzle/` to a connection. Used by
 * `npm run db:migrate`, the seed script and `createTestDb()`. No `server-only` (scripts use it).
 */
import path from 'node:path';
import type { NeonDatabase } from 'drizzle-orm/neon-serverless';
import { migrate as migrateNeon } from 'drizzle-orm/neon-serverless/migrator';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate as migrateNodePg } from 'drizzle-orm/node-postgres/migrator';
import type { PgliteDatabase } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import type { Connection, Schema } from './connect';

export const MIGRATIONS_FOLDER = path.resolve(process.cwd(), 'drizzle');

export async function migrateConnection(conn: Connection, migrationsFolder = MIGRATIONS_FOLDER): Promise<void> {
  const config = { migrationsFolder };
  // Each driver ships its own migrator; `conn.db` was built by the matching driver in connect().
  switch (conn.kind) {
    case 'pglite':
      return migratePglite(conn.db as unknown as PgliteDatabase<Schema>, config);
    case 'neon':
      return migrateNeon(conn.db as unknown as NeonDatabase<Schema>, config);
    case 'postgres':
      return migrateNodePg(conn.db as unknown as NodePgDatabase<Schema>, config);
  }
}
