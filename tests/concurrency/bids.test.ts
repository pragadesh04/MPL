/**
 * Bid races on REAL Postgres (PLAN §9 items 1, 3, 29; §13.5 B9). PGlite is one connection and
 * can't race, so this suite needs `CONCURRENCY_DATABASE_URL` (a throwaway Neon branch or Docker):
 *
 *   docker run -d --name mpl-pg -e POSTGRES_PASSWORD=mpl -e POSTGRES_DB=mpl_concurrency \
 *     -p 55432:5432 postgres:17-alpine
 *   CONCURRENCY_DATABASE_URL=postgres://postgres:mpl@localhost:55432/mpl_concurrency \
 *     npm run test:concurrency
 *
 * The database is wiped at the start. Never point it at a database you care about.
 */
import { eq, sql } from 'drizzle-orm';
import { connect, type Connection } from '@/server/db/connect';
import { migrateConnection } from '@/server/db/migrate';
import { setTestDb } from '@/server/db/client';
import { auctionState, bids, leaders, players } from '@/server/db/schema';
import { clearPublishedEvents, getPublishedEvents } from '@/server/realtime/publisher';
import { placeBid } from '@/server/services/auction/bids';
import { runAuctionCommand } from '@/server/services/auction/commands';
import { buildSnapshot, tickAuction } from '@/server/services/auction/snapshot';
import {
  cid,
  expireLot,
  makeAuction,
  type AuctionFixture,
} from '@/server/services/auction/test-fixtures';

const url = process.env.CONCURRENCY_DATABASE_URL;
const suite = url ? describe : describe.skip;

suite('auction races on real Postgres', () => {
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

  beforeEach(() => clearPublishedEvents());

  async function openLot(f: AuctionFixture) {
    return (
      await runAuctionCommand(f.ownerId, f.tournamentId, {
        type: 'next',
        expectedVersion: (await buildSnapshot(f.tournamentId)).version,
        commandId: cid(),
      })
    ).snapshot;
  }

  it('20 simultaneous bids on one version: exactly one wins, 19 are OUTBID', async () => {
    const f = await makeAuction(conn.db, { captains: 20, purse: 50, soldierPrices: [3, 3] });
    const snap = await openLot(f);
    clearPublishedEvents();

    const results = await Promise.allSettled(
      f.captains.map((c) =>
        placeBid(c.userId, f.tournamentId, {
          amount: snap.current!.nextBid,
          expectedVersion: snap.version,
          commandId: cid(),
        }),
      ),
    );

    const won = results.filter((r) => r.status === 'fulfilled');
    const lost = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(19);
    expect(lost.every((r) => (r.reason as { code?: string }).code === 'OUTBID')).toBe(true);

    const rows = await conn.db.select().from(bids).where(eq(bids.tournamentId, f.tournamentId));
    expect(rows).toHaveLength(1);
    const [state] = await conn.db
      .select()
      .from(auctionState)
      .where(eq(auctionState.tournamentId, f.tournamentId));
    expect(state?.version).toBe(snap.version + 1);
    expect(getPublishedEvents().filter((e) => e.envelope.type === 'bid.placed')).toHaveLength(1);
  });

  it('a bidding storm: one winner per version, strictly rising amounts, no gaps', async () => {
    const f = await makeAuction(conn.db, { captains: 20, purse: 1000, soldierPrices: [1] });
    await openLot(f);
    clearPublishedEvents();

    // Every captain keeps re-reading the version and bidding for a while.
    await Promise.all(
      f.captains.map(async (c, i) => {
        for (let attempt = 0; attempt < 6; attempt++) {
          const s = await buildSnapshot(f.tournamentId);
          if (!s.current || s.current.currentTeamId === c.teamId) continue;
          await placeBid(c.userId, f.tournamentId, {
            amount: s.current.nextBid + (i % 3),
            expectedVersion: s.version,
            commandId: cid(),
          }).catch(() => undefined);
        }
      }),
    );

    const rows = await conn.db
      .select()
      .from(bids)
      .where(eq(bids.tournamentId, f.tournamentId))
      .orderBy(bids.id);
    expect(rows.length).toBeGreaterThan(1);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i]!.amount).toBeGreaterThan(rows[i - 1]!.amount);
      expect(rows[i]!.teamId).not.toBe(rows[i - 1]!.teamId);
    }
    const versions = getPublishedEvents()
      .filter((e) => e.envelope.type === 'bid.placed')
      .map((e) => e.envelope.version!)
      .sort((a, b) => a - b);
    expect(versions).toHaveLength(rows.length);
    expect(new Set(versions).size).toBe(versions.length);
    for (let i = 1; i < versions.length; i++) expect(versions[i]).toBe(versions[i - 1]! + 1);
  });

  it('whole-purse bids race: the purse never goes negative and the soldier sells once', async () => {
    const f = await makeAuction(conn.db, { captains: 20, purse: 5, soldierPrices: [5, 1] });
    const snap = await openLot(f);
    await Promise.allSettled(
      f.captains.map((c) =>
        placeBid(c.userId, f.tournamentId, {
          amount: 5,
          expectedVersion: snap.version,
          commandId: cid(),
        }),
      ),
    );
    // 10 organiser "Sold now" presses and 20 ticks race to close the same lot.
    const after = await buildSnapshot(f.tournamentId);
    await expireLot(conn.db, f.tournamentId);
    clearPublishedEvents();
    await Promise.allSettled([
      ...Array.from({ length: 10 }, () =>
        runAuctionCommand(f.ownerId, f.tournamentId, {
          type: 'sold',
          expectedVersion: after.version,
          commandId: cid(),
        }),
      ),
      ...f.captains.map((c) => tickAuction({ userId: c.userId }, f.tournamentId)),
    ]);

    const closed = getPublishedEvents().filter((e) => e.envelope.type === 'lot.closed');
    expect(closed).toHaveLength(1);
    const [soldier] = await conn.db.select().from(players).where(eq(players.id, f.soldiers[0]!.id));
    expect(soldier).toMatchObject({ status: 'SOLD', soldPrice: 5 });
    const purses = await conn.db
      .select({ remaining: leaders.purseRemaining })
      .from(leaders)
      .where(eq(leaders.tournamentId, f.tournamentId));
    expect(purses.every((p) => p.remaining >= 0)).toBe(true);
    expect(purses.filter((p) => p.remaining === 0)).toHaveLength(1);
  });

  it('a double-tapped command id places one bid even when the taps race', async () => {
    const f = await makeAuction(conn.db, { captains: 2, soldierPrices: [2] });
    const snap = await openLot(f);
    const body = { amount: 2, expectedVersion: snap.version, commandId: cid() };
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => placeBid(f.captains[0]!.userId, f.tournamentId, body)),
    );
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
    const rows = await conn.db.select().from(bids).where(eq(bids.tournamentId, f.tournamentId));
    expect(rows).toHaveLength(1);
  });

  it('two tournaments bid at the same time without blocking each other', async () => {
    const a = await makeAuction(conn.db, { captains: 5, soldierPrices: [1] });
    const b = await makeAuction(conn.db, { captains: 5, soldierPrices: [1] });
    const [sa, sb] = await Promise.all([openLot(a), openLot(b)]);
    const results = await Promise.allSettled([
      ...a.captains.map((c) =>
        placeBid(c.userId, a.tournamentId, {
          amount: 1,
          expectedVersion: sa.version,
          commandId: cid(),
        }),
      ),
      ...b.captains.map((c) =>
        placeBid(c.userId, b.tournamentId, {
          amount: 1,
          expectedVersion: sb.version,
          commandId: cid(),
        }),
      ),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
  });
});
