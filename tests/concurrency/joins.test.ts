/**
 * Join / setup races on REAL Postgres (PLAN §9 items 11, 17, 20; Lane A handoff "concurrency of
 * joins was reasoned about but not tested"). Same setup as bids.test.ts:
 *
 *   CONCURRENCY_DATABASE_URL=postgres://postgres:mpl@localhost:55432/mpl_concurrency \
 *     npm run test:concurrency
 *
 * The database is wiped at the start. Never point it at a database you care about.
 */
import { and, eq, sql } from 'drizzle-orm';
import { connect, type Connection } from '@/server/db/connect';
import { migrateConnection } from '@/server/db/migrate';
import { setTestDb } from '@/server/db/client';
import { leaders, players, teams, tournaments } from '@/server/db/schema';
import { claimInvite } from '@/server/services/joining/personalLink';
import { joinWithKey } from '@/server/services/joining/organiserKey';
import { personalLink } from '@/server/services/people/links';
import { upsertMyTeam } from '@/server/services/people/teams';
import { createTournament } from '@/server/services/tournaments/tournaments';
import { makeLeader, makeTournament, makeUser, testKey } from '@/test/factories';

const url = process.env.CONCURRENCY_DATABASE_URL;
const suite = url ? describe : describe.skip;

const codeOf = (r: PromiseSettledResult<unknown>): string | null =>
  r.status === 'rejected' ? ((r.reason as { code?: string }).code ?? 'UNKNOWN') : null;

suite('join and setup races on real Postgres', () => {
  let conn: Connection;

  beforeAll(async () => {
    conn = connect(url!, { maxConnections: 30 });
    await migrateConnection(conn);
    await conn.db.execute(sql`
      TRUNCATE TABLE users, tournaments, rate_limits, password_resets, organiser_blocks,
        notifications, processed_commands, webhook_deliveries, webhooks, audit_log
      RESTART IDENTITY CASCADE
    `);
    setTestDb(conn.db);
  });

  afterAll(async () => {
    setTestDb(null);
    await conn?.close();
  });

  async function organiserWithTournament() {
    const owner = await makeUser(conn.db, { isOrganiser: true, organiserKey: testKey() });
    const t = await makeTournament(conn.db, { ownerId: owner.id });
    return { owner, t };
  }

  it('10 simultaneous "create tournament" from one organiser: exactly one is created', async () => {
    const owner = await makeUser(conn.db, { isOrganiser: true, organiserKey: testKey() });
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) => createTournament(owner.id, { name: `Race Cup ${i}` })),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.map(codeOf).filter(Boolean)).toEqual(Array(9).fill('CONFLICT'));
    const rows = await conn.db.select().from(tournaments).where(eq(tournaments.ownerId, owner.id));
    expect(rows).toHaveLength(1);
  });

  it('8 accounts claim the same personal link at once: exactly one gets the spot', async () => {
    const { t } = await organiserWithTournament();
    const leader = await makeLeader(conn.db, { tournamentId: t.id });
    const token = new URL(personalLink('LEADER', leader.id, t.id, leader.linkVersion)).pathname
      .split('/')
      .pop()!;
    const claimers = await Promise.all(Array.from({ length: 8 }, () => makeUser(conn.db)));
    const results = await Promise.allSettled(claimers.map((u) => claimInvite(u.id, token)));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const [row] = await conn.db.select().from(leaders).where(eq(leaders.id, leader.id));
    expect(claimers.map((u) => u.id)).toContain(row!.userId);
  });

  it('one account joins with the key as captain AND soldier at once: only one row exists', async () => {
    const { owner, t } = await organiserWithTournament();
    const player = await makeUser(conn.db);
    const results = await Promise.allSettled([
      joinWithKey(player.id, owner.organiserKey!, 'LEADER'),
      joinWithKey(player.id, owner.organiserKey!, 'PLAYER'),
      joinWithKey(player.id, owner.organiserKey!, 'LEADER'),
      joinWithKey(player.id, owner.organiserKey!, 'PLAYER'),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const asCaptain = await conn.db
      .select()
      .from(leaders)
      .where(and(eq(leaders.tournamentId, t.id), eq(leaders.userId, player.id)));
    const asSoldier = await conn.db
      .select()
      .from(players)
      .where(and(eq(players.tournamentId, t.id), eq(players.userId, player.id)));
    expect(asCaptain.length + asSoldier.length).toBe(1);
  });

  it('4 captains pick the same colour at once: exactly one team gets it', async () => {
    const { t } = await organiserWithTournament();
    const captains = await Promise.all(
      Array.from({ length: 4 }, async () => {
        const u = await makeUser(conn.db);
        await makeLeader(conn.db, { tournamentId: t.id, userId: u.id });
        return u;
      }),
    );
    const results = await Promise.allSettled(
      captains.map((u, i) =>
        upsertMyTeam(u.id, t.id, { name: `Race Team ${i}`, shortName: `RC${i}`, color: '#e53935' }),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.map(codeOf).filter(Boolean)).toEqual(Array(3).fill('CONFLICT'));
    const rows = await conn.db
      .select()
      .from(teams)
      .where(and(eq(teams.tournamentId, t.id), eq(teams.color, '#e53935')));
    expect(rows).toHaveLength(1);
  });
});
