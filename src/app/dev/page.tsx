import { asc } from 'drizzle-orm';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getReadDb } from '@/server/db/client';
import { tournaments, users } from '@/server/db/schema';
import { isDevToolsEnabled } from '@/server/dev';

export const metadata = { title: 'Dev tools' };

/**
 * DEV ONLY (404 in production). Lists seeded accounts with one-click /dev/login-as links.
 * Seed with `npm run db:seed -- --stage=draft|ready|auction|allocated|groups|knockout`.
 */
export default async function DevPage() {
  if (!isDevToolsEnabled()) notFound();
  const db = getReadDb();
  const [allUsers, allTournaments] = await Promise.all([
    db
      .select({
        username: users.username,
        displayName: users.displayName,
        isOrganiser: users.isOrganiser,
      })
      .from(users)
      .orderBy(asc(users.username))
      .limit(200),
    db
      .select({
        id: tournaments.id,
        name: tournaments.name,
        status: tournaments.status,
        liveCode: tournaments.liveCode,
      })
      .from(tournaments)
      .orderBy(asc(tournaments.name)),
  ]);

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8">
      <h1 className="font-display text-3xl">Dev tools</h1>
      <Card>
        <CardHeader>
          <CardTitle>Tournaments</CardTitle>
        </CardHeader>
        <CardContent>
          {allTournaments.length === 0 ? (
            <p className="text-muted">No data. Run npm run db:seed -- --stage=ready</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {allTournaments.map((t) => (
                <li key={t.id} className="font-mono">
                  {t.name} · {t.status} · id {t.id} · live {t.liveCode}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Log in as (password for all: password123)</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {allUsers.map((u) => (
              <li key={u.username}>
                <Link
                  className="text-lime hover:underline"
                  href={`/dev/login-as?username=${encodeURIComponent(u.username)}`}
                  prefetch={false}
                >
                  {u.username}
                </Link>{' '}
                <span className="text-muted">
                  {u.displayName}
                  {u.isOrganiser ? ' · organiser' : ''}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </main>
  );
}
