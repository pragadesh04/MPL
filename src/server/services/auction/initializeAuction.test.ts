import { eq } from 'drizzle-orm';
import { setupTestDb } from '@/test/db';
import { makeLeader, makePlayer, makeTeam, makeTournament, makeUser } from '@/test/factories';
import { withTransaction } from '@/server/db/client';
import { auctionState, auditLog, leaders, players } from '@/server/db/schema';
import { DEFAULT_SETTINGS } from '@/lib/schemas/settings';
import { initializeAuction } from './initializeAuction';
import { orderPlayers } from './pool';

const t = setupTestDb();

async function setup(playerOrder: 'random' | 'byBasePriceDesc' | 'manualQueue' = 'random') {
  const owner = await makeUser(t.db, { isOrganiser: true });
  const tour = await makeTournament(t.db, {
    ownerId: owner.id,
    status: 'AUCTION_LIVE',
    settings: { ...DEFAULT_SETTINGS, playerOrder },
  });
  const leader = await makeLeader(t.db, {
    tournamentId: tour.id,
    purseTotal: 50,
    purseRemaining: 12,
  });
  await makeTeam(t.db, { tournamentId: tour.id, leaderId: leader.id });
  const soldiers = [];
  for (const [i, price] of [3, 9, 1, 5].entries()) {
    soldiers.push(
      await makePlayer(t.db, { tournamentId: tour.id, basePrice: price, auctionOrder: 4 - i }),
    );
  }
  const pending = await makePlayer(t.db, { tournamentId: tour.id, status: 'PENDING_APPROVAL' });
  return { tour, leader, soldiers, pending };
}

describe('initializeAuction', () => {
  it('creates auction_state, resets purses and numbers the pool 1…n', async () => {
    const { tour, leader, soldiers, pending } = await setup();
    await withTransaction((tx) => initializeAuction(tx, tour.id));

    const [state] = await t.db
      .select()
      .from(auctionState)
      .where(eq(auctionState.tournamentId, tour.id));
    expect(state).toMatchObject({ round: 1, version: 0, currentPlayerId: null, nextAt: null });

    const [l] = await t.db.select().from(leaders).where(eq(leaders.id, leader.id));
    expect(l?.purseRemaining).toBe(50);

    const rows = await t.db.select().from(players).where(eq(players.tournamentId, tour.id));
    const orders = rows
      .filter((r) => soldiers.some((s) => s.id === r.id))
      .map((r) => r.auctionOrder)
      .sort();
    expect(orders).toEqual([1, 2, 3, 4]);
    expect(rows.find((r) => r.id === pending.id)?.auctionOrder).toBeNull();

    const audit = await t.db.select().from(auditLog).where(eq(auditLog.tournamentId, tour.id));
    expect(audit.map((a) => a.action)).toContain('auction.initialized');
  });

  it('orders by base price when the setting says so', async () => {
    const { tour } = await setup('byBasePriceDesc');
    await withTransaction((tx) => initializeAuction(tx, tour.id));
    const rows = await t.db.select().from(players).where(eq(players.tournamentId, tour.id));
    const pool = rows
      .filter((r) => r.status === 'POOL')
      .sort((a, b) => (a.auctionOrder ?? 0) - (b.auctionOrder ?? 0));
    expect(pool.map((r) => r.basePrice)).toEqual([9, 5, 3, 1]);
  });

  it('is idempotent', async () => {
    const { tour } = await setup('manualQueue');
    await withTransaction((tx) => initializeAuction(tx, tour.id));
    const before = await t.db.select().from(players).where(eq(players.tournamentId, tour.id));
    await withTransaction((tx) => initializeAuction(tx, tour.id));
    const after = await t.db.select().from(players).where(eq(players.tournamentId, tour.id));
    expect(after.map((r) => [r.id, r.auctionOrder]).sort()).toEqual(
      before.map((r) => [r.id, r.auctionOrder]).sort(),
    );
  });

  it('404s for an unknown tournament', async () => {
    await expect(
      withTransaction((tx) => initializeAuction(tx, '00000000-0000-4000-8000-000000000000')),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('orderPlayers', () => {
  const p = (id: string, basePrice: number, auctionOrder: number | null, ms = 0) => ({
    id,
    basePrice,
    auctionOrder,
    createdAt: new Date(ms),
  });
  const list = [p('c', 1, null, 2), p('a', 5, 2), p('b', 9, 1), p('d', 5, null, 1)];

  it('manual queue keeps auction order, then creation time', () => {
    expect(orderPlayers(list, 'manualQueue', () => 0).map((x) => x.id)).toEqual([
      'b',
      'a',
      'd',
      'c',
    ]);
  });

  it('by base price is descending and stable', () => {
    expect(orderPlayers(list, 'byBasePriceDesc', () => 0).map((x) => x.id)).toEqual([
      'b',
      'a',
      'd',
      'c',
    ]);
  });

  it('random is a permutation driven only by the random source', () => {
    const one = orderPlayers(list, 'random', () => 0.5).map((x) => x.id);
    const two = orderPlayers(list, 'random', () => 0.5).map((x) => x.id);
    expect(one).toEqual(two);
    expect([...one].sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(orderPlayers(list, 'random', () => 0.999).map((x) => x.id)).toEqual([
      'b',
      'a',
      'd',
      'c',
    ]);
  });

  it('breaks full ties by id', () => {
    const tie = [p('y', 1, null), p('x', 1, null)];
    expect(orderPlayers(tie, 'manualQueue', () => 0).map((x) => x.id)).toEqual(['x', 'y']);
  });
});
