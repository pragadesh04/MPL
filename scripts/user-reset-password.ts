/**
 * npm run user:reset-password -- <username>
 *
 * Operator tool for locked-out organisers (PLAN §2.5): creates a one-time `password_resets` row
 * (valid 30 min, token stored hashed, created_by = null for the operator) and prints the reset
 * link built from PUBLIC_APP_URL. There is no email service; send the link yourself.
 * PGlite: stop `next dev` first — PGlite is a single connection per directory.
 */
import './load-env';
import { sql } from 'drizzle-orm';
import { connect } from '../src/server/db/connect';
import { users } from '../src/server/db/schema';
import { databaseUrls } from '../src/server/env-core';
import {
  createResetToken,
  resetLink,
  RESET_TTL_MINUTES,
} from '../src/server/services/passwords/reset-core';

async function main(): Promise<void> {
  const username = process.argv[2]?.trim();
  if (!username) {
    console.error('Usage: npm run user:reset-password -- <username>');
    process.exit(1);
  }
  const appUrl = process.env.PUBLIC_APP_URL?.trim() || 'http://localhost:3000';
  const conn = connect(databaseUrls().app, { maxConnections: 1 });
  try {
    const [user] = await conn.db
      .select({ id: users.id, username: users.username })
      .from(users)
      .where(sql`lower(${users.username}) = lower(${username})`)
      .limit(1);
    if (!user) {
      console.error(`No user called "${username}".`);
      process.exitCode = 1;
      return;
    }
    const { token, expiresAt } = await createResetToken(conn.db, user.id, null);
    console.log(
      `One-time reset link for @${user.username} (valid ${RESET_TTL_MINUTES} min, until ${expiresAt.toISOString()}):`,
    );
    console.log(resetLink(appUrl, token));
  } finally {
    await conn.close();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
