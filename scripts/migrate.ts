/**
 * npm run db:migrate — applies drizzle/*.sql using DATABASE_URL_UNPOOLED (direct URL), falling
 * back to DATABASE_URL, then to local PGlite (`pglite:../.pglite-<folder>`, outside the project).
 */
import './load-env';
import { mkdirSync } from 'node:fs';
import { connect, pgliteLocation } from '../src/server/db/connect';
import { migrateConnection } from '../src/server/db/migrate';
import { databaseUrls } from '../src/server/env-core';

async function main(): Promise<void> {
  const url = databaseUrls().direct;
  if (url.startsWith('pglite:')) {
    const dir = pgliteLocation(url);
    if (dir) mkdirSync(dir, { recursive: true });
  }
  const conn = connect(url, { maxConnections: 1 });
  console.log(`Migrating (${conn.kind})…`);
  try {
    await migrateConnection(conn);
    console.log('Migrations applied.');
  } finally {
    await conn.close();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
