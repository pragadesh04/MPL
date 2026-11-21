/**
 * npm run db:seed -- --stage=draft|ready|auction|allocated|groups|knockout
 *
 * WIPES the database in DATABASE_URL (or local PGlite) and loads staged test data with two
 * unrelated organisers. Refuses to run when NODE_ENV=production (PLAN §13.8 I4).
 * PGlite: stop `next dev` first — PGlite is a single connection per directory.
 */
import './load-env';
import { mkdirSync } from 'node:fs';
import { hash } from '@node-rs/argon2';
import { connect, pgliteLocation } from '../src/server/db/connect';
import { migrateConnection } from '../src/server/db/migrate';
import { databaseUrls } from '../src/server/env-core';
import { SEED_PASSWORD, SEED_STAGES, seedDatabase, type SeedStage } from './seed-lib';

function parseStage(argv: string[]): SeedStage {
  const arg = argv.find((a) => a.startsWith('--stage='))?.slice('--stage='.length) ?? 'ready';
  if (!(SEED_STAGES as readonly string[]).includes(arg)) {
    console.error(`Unknown stage "${arg}". Use one of: ${SEED_STAGES.join(', ')}`);
    process.exit(1);
  }
  return arg as SeedStage;
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to seed: NODE_ENV=production.');
    process.exit(1);
  }
  const stage = parseStage(process.argv.slice(2));
  const url = databaseUrls().direct;
  if (url.startsWith('pglite:')) {
    const dir = pgliteLocation(url);
    if (dir) mkdirSync(dir, { recursive: true });
  }
  const conn = connect(url, { maxConnections: 2 });
  console.log(`Seeding stage "${stage}" into ${conn.kind}…`);
  try {
    await migrateConnection(conn);
    const passwordHash = await hash(SEED_PASSWORD, {
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });
    const summary = await conn.db.transaction((tx) => seedDatabase(tx, stage, { passwordHash }));
    console.log(`\n${summary.users} accounts, password for all: ${SEED_PASSWORD}`);
    for (const t of summary.tournaments) {
      console.log(
        `  ${t.name} [${t.status}]  owner=${t.owner}  id=${t.id}  live=/live/${t.liveCode}`,
      );
    }
    console.log(
      '\nOther accounts: ravi_coadmin, ravi_auctioneer, free_agent, dual_soldier,' +
        ' a_cap1..8, a_sol01..26, b_cap1..4, b_sol01..12',
    );
    console.log('Log in without a password at /dev/login-as?username=<name> (dev only).');
  } finally {
    await conn.close();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
