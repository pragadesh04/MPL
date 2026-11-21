import { sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { setSession } from '@/server/auth/session';
import { getDb } from '@/server/db/client';
import { users } from '@/server/db/schema';
import { assertDevTools } from '@/server/dev';
import { notFound } from '@/server/errors';
import { handle } from '@/server/http';

/**
 * GET /dev/login-as?username=ravi[&next=/dashboard] — DEV ONLY (404 in production).
 * Logs in as any seeded user without a password, for lanes and e2e tests (PLAN §13.1 rule 4).
 */
export const GET = handle(async (req) => {
  assertDevTools();
  const url = new URL(req.url);
  const username = url.searchParams.get('username')?.trim();
  if (!username) throw notFound();

  const [user] = await getDb()
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.username}) = lower(${username})`)
    .limit(1);
  if (!user) throw notFound(`No user called "${username}". Run npm run db:seed first.`);

  await setSession(user.id);
  const next = url.searchParams.get('next');
  const target = next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
  return NextResponse.redirect(new URL(target, url));
});
