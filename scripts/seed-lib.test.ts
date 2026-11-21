import { and, eq, sql } from 'drizzle-orm';
import { connect, type Connection } from '../src/server/db/connect';
import { migrateConnection } from '../src/server/db/migrate';
import { rows } from '../src/server/db/sql';
import { leaders, matches, players, tournaments } from '../src/server/db/schema';
import { SEED_STAGES, seedDatabase } from './seed-lib';

let conn: Connection;

beforeAll(async () => {
  conn = connect('pglite:memory');
  await migrateConnection(conn);
});
afterAll(async () => {
  await conn.close();
});

describe.each(SEED_STAGES)('seed stage %s', (stage) => {
  it('creates two unrelated organisers at that stage, within every constraint', async () => {
    const summary = await conn.db.transaction((tx) =>
      seedDatabase(tx, stage, { passwordHash: 'x' }),
    );
    expect(summary.tournaments.map((t) => t.owner)).toEqual(['ravi', 'meera']);

    const tours = await conn.db.select().from(tournaments);
    expect(tours).toHaveLength(2);
    expect(new Set(tours.map((t) => t.ownerId)).size).toBe(2);

    // Purses always add up: remaining = total - what the squad cost.
    const [bad] = await rows<{ n: number }>(
      conn.db,
      sql`select count(*)::int as n from leaders l
          left join teams t on t.leader_id = l.id
          where l.purse_remaining <> l.purse_total - coalesce((
            select sum(p.sold_price) from players p where p.team_id = t.id), 0)`,
    );
    expect(bad?.n).toBe(0);

    if (['allocated', 'groups', 'knockout'].includes(stage)) {
      const unplaced = await conn.db
        .select({ id: players.id })
        .from(players)
        .where(sql`${players.teamId} is null`);
      expect(unplaced).toHaveLength(0);
      // Squads within min..max (captain included).
      const sizes = await rows<{ size: number }>(
        conn.db,
        sql`select 1 + count(p.id)::int as size from teams t left join players p on p.team_id = t.id group by t.id`,
      );
      for (const { size } of sizes) {
        expect(size).toBeGreaterThanOrEqual(4);
        expect(size).toBeLessThanOrEqual(6);
      }
    }

    if (stage === 'draft') {
      const pending = await conn.db
        .select({ id: leaders.id })
        .from(leaders)
        .where(eq(leaders.approval, 'PENDING'));
      expect(pending).toHaveLength(1);
    }

    if (stage === 'knockout') {
      const liveSemi = await conn.db
        .select({ id: matches.id })
        .from(matches)
        .where(and(eq(matches.stage, 'KNOCKOUT'), eq(matches.status, 'LIVE')));
      expect(liveSemi).toHaveLength(1);
    }
  });
});
