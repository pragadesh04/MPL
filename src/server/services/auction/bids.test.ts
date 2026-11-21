import { eq } from 'drizzle-orm';
import { setupTestDb } from '@/test/db';
import { makeUser } from '@/test/factories';
import { auctionState, auditLog, bids, leaders, players } from '@/server/db/schema';
import { clearPublishedEvents, getPublishedEvents } from '@/server/realtime/publisher';
import { clearQueuedWebhookEvents, getQueuedWebhookEvents } from '../webhooks/dispatch';
import { placeBid } from './bids';
import { runAuctionCommand } from './commands';
import { getAuctionSnapshot, tickAuction } from './snapshot';
import { cid, expireBreak, expireLot, makeAuction, type AuctionFixture } from './test-fixtures';

const t = setupTestDb();

async function openFirstLot(f: AuctionFixture) {
  const { snapshot } = await runAuctionCommand(f.ownerId, f.tournamentId, {
    type: 'next',
    expectedVersion: 0,
    commandId: cid(),
  });
  return snapshot;
}

const types = () => getPublishedEvents().map((e) => e.envelope.type);

beforeEach(() => {
  clearPublishedEvents();
  clearQueuedWebhookEvents();
});

describe('opening the auction', () => {
  it('the first console command takes control, then opens the first soldier', async () => {
    const f = await makeAuction(t.db);
    const snap = await openFirstLot(f);
    expect(snap.controllerUserId).toBe(f.ownerId);
    expect(snap.version).toBe(2);
    expect(snap.current).toMatchObject({
      playerId: f.soldiers[0]!.id,
      basePrice: 2,
      currentBid: null,
      nextBid: 2,
      isReauction: false,
    });
    expect(snap.pool[0]).toMatchObject({ id: f.soldiers[0]!.id, status: 'ON_BLOCK' });
    expect(types()).toEqual(['control.changed', 'lot.opened']);
    expect(getPublishedEvents().map((e) => e.envelope.version)).toEqual([1, 2]);
    const hooks = getQueuedWebhookEvents().flatMap((q) => q.events.map((e) => e.event));
    expect(hooks).toEqual(['auction.started', 'lot.opened']);
  });
});

describe('placeBid', () => {
  it('accepts a captain bid, extends the clock and publishes bid.placed after commit', async () => {
    const f = await makeAuction(t.db);
    const snap = await openFirstLot(f);
    clearPublishedEvents();
    const { snapshot } = await placeBid(f.captains[0]!.userId, f.tournamentId, {
      amount: 2,
      expectedVersion: snap.version,
      commandId: cid(),
    });
    expect(snapshot.current).toMatchObject({
      currentBid: 2,
      currentTeamId: f.captains[0]!.teamId,
      nextBid: 3,
    });
    expect(snapshot.version).toBe(3);
    expect(snapshot.recentBids[0]).toMatchObject({ amount: 2, isFallback: false });
    expect(getPublishedEvents()).toHaveLength(1);
    expect(getPublishedEvents()[0]!.envelope).toMatchObject({
      type: 'bid.placed',
      version: 3,
      data: { amount: 2, teamId: f.captains[0]!.teamId, isFallback: false },
    });
  });

  it('rejects a stale expectedVersion with 409 OUTBID', async () => {
    const f = await makeAuction(t.db);
    const snap = await openFirstLot(f);
    await placeBid(f.captains[0]!.userId, f.tournamentId, {
      amount: 2,
      expectedVersion: snap.version,
      commandId: cid(),
    });
    await expect(
      placeBid(f.captains[1]!.userId, f.tournamentId, {
        amount: 3,
        expectedVersion: snap.version,
        commandId: cid(),
      }),
    ).rejects.toMatchObject({ code: 'OUTBID', status: 409, details: { version: 3 } });
  });

  it('enforces canTeamBid on the server: leading team, low amount, over purse', async () => {
    const f = await makeAuction(t.db, { purse: 10 });
    let v = (await openFirstLot(f)).version;
    v = (
      await placeBid(f.captains[0]!.userId, f.tournamentId, {
        amount: 2,
        expectedVersion: v,
        commandId: cid(),
      })
    ).snapshot.version;
    const bid = (userIdx: number, amount: number) =>
      placeBid(f.captains[userIdx]!.userId, f.tournamentId, {
        amount,
        expectedVersion: v,
        commandId: cid(),
      });
    await expect(bid(0, 5)).rejects.toMatchObject({ details: { reason: 'ALREADY_LEADING' } });
    await expect(bid(1, 2)).rejects.toMatchObject({ details: { reason: 'AMOUNT_TOO_LOW' } });
    await expect(bid(1, 11)).rejects.toMatchObject({ details: { reason: 'AMOUNT_OVER_PURSE' } });
    // A whole-purse bid is allowed (no reserve rule).
    await expect(bid(1, 10)).resolves.toBeDefined();
  });

  it('a late bid settles the expired lot first, then fails with TOO_LATE', async () => {
    const f = await makeAuction(t.db);
    const v = (await openFirstLot(f)).version;
    await placeBid(f.captains[0]!.userId, f.tournamentId, {
      amount: 3,
      expectedVersion: v,
      commandId: cid(),
    });
    await expireLot(t.db, f.tournamentId);
    clearPublishedEvents();
    await expect(
      placeBid(f.captains[1]!.userId, f.tournamentId, {
        amount: 4,
        expectedVersion: v + 1,
        commandId: cid(),
      }),
    ).rejects.toMatchObject({ code: 'TOO_LATE' });

    // The settle committed: sold to captain 0 for 3, purse deducted, event published.
    const [p] = await t.db.select().from(players).where(eq(players.id, f.soldiers[0]!.id));
    expect(p).toMatchObject({
      status: 'SOLD',
      teamId: f.captains[0]!.teamId,
      soldPrice: 3,
      acquiredVia: 'AUCTION',
    });
    const [l] = await t.db.select().from(leaders).where(eq(leaders.id, f.captains[0]!.leaderId));
    expect(l?.purseRemaining).toBe(47);
    expect(types()).toEqual(['lot.closed', 'people.updated']);
    expect(await t.db.select().from(bids).where(eq(bids.teamId, f.captains[1]!.teamId))).toEqual(
      [],
    );
  });

  it('is idempotent per commandId (a double tap places one bid)', async () => {
    const f = await makeAuction(t.db);
    const v = (await openFirstLot(f)).version;
    const body = { amount: 2, expectedVersion: v, commandId: cid() };
    await placeBid(f.captains[0]!.userId, f.tournamentId, body);
    const again = await placeBid(f.captains[0]!.userId, f.tournamentId, body);
    expect(again.snapshot.version).toBe(v + 1);
    const rows = await t.db.select().from(bids).where(eq(bids.tournamentId, f.tournamentId));
    expect(rows).toHaveLength(1);
  });

  it('takes the team from the session: a captain cannot bid for another team', async () => {
    const f = await makeAuction(t.db);
    const v = (await openFirstLot(f)).version;
    await expect(
      placeBid(f.captains[0]!.userId, f.tournamentId, {
        amount: 2,
        expectedVersion: v,
        commandId: cid(),
        teamId: f.captains[1]!.teamId,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('lets the controlling organiser enter a logged fallback bid', async () => {
    const f = await makeAuction(t.db);
    const v = (await openFirstLot(f)).version;
    const { snapshot } = await placeBid(f.ownerId, f.tournamentId, {
      amount: 2,
      expectedVersion: v,
      commandId: cid(),
      teamId: f.captains[1]!.teamId,
    });
    expect(snapshot.recentBids[0]).toMatchObject({
      isFallback: true,
      teamId: f.captains[1]!.teamId,
    });
    const audit = await t.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.tournamentId, f.tournamentId));
    expect(audit.map((a) => a.action)).toContain('auction.fallback_bid');
  });

  it('refuses fallback bids from an organiser who is not in control', async () => {
    const f = await makeAuction(t.db);
    const v = (await openFirstLot(f)).version;
    await expect(
      placeBid(f.coAdminId, f.tournamentId, {
        amount: 2,
        expectedVersion: v,
        commandId: cid(),
        teamId: f.captains[1]!.teamId,
      }),
    ).rejects.toMatchObject({ details: { reason: 'NOT_CONTROLLER' } });
  });

  it('refuses fallback bids when the tournament turned them off', async () => {
    const f = await makeAuction(t.db, { settings: { allowAuctioneerBids: false } });
    const v = (await openFirstLot(f)).version;
    await expect(
      placeBid(f.ownerId, f.tournamentId, {
        amount: 2,
        expectedVersion: v,
        commandId: cid(),
        teamId: f.captains[1]!.teamId,
      }),
    ).rejects.toMatchObject({ details: { reason: 'FALLBACK_DISABLED' } });
  });

  it('refuses bids while paused and when nobody is on the block', async () => {
    const f = await makeAuction(t.db);
    await expect(
      placeBid(f.captains[0]!.userId, f.tournamentId, {
        amount: 2,
        expectedVersion: 0,
        commandId: cid(),
      }),
    ).rejects.toMatchObject({ details: { reason: 'NO_LOT' } });
    const v = (await openFirstLot(f)).version;
    const paused = await runAuctionCommand(f.ownerId, f.tournamentId, {
      type: 'pause',
      expectedVersion: v,
      commandId: cid(),
    });
    await expect(
      placeBid(f.captains[0]!.userId, f.tournamentId, {
        amount: 2,
        expectedVersion: paused.snapshot.version,
        commandId: cid(),
      }),
    ).rejects.toMatchObject({ details: { reason: 'AUCTION_NOT_LIVE' } });
  });

  it('soldiers cannot bid; people outside the tournament get 404', async () => {
    const f = await makeAuction(t.db);
    const v = (await openFirstLot(f)).version;
    const body = { amount: 2, expectedVersion: v, commandId: cid() };
    await expect(placeBid(f.soldiers[0]!.userId, f.tournamentId, body)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    const stranger = await makeUser(t.db);
    await expect(placeBid(stranger.id, f.tournamentId, body)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(placeBid(null, f.tournamentId, body)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('settleDue via snapshot and tick', () => {
  it('nobody nudges: the next snapshot read closes the lot, and the break opens the next', async () => {
    const f = await makeAuction(t.db);
    const v = (await openFirstLot(f)).version;
    await placeBid(f.captains[1]!.userId, f.tournamentId, {
      amount: 5,
      expectedVersion: v,
      commandId: cid(),
    });
    await expireLot(t.db, f.tournamentId);
    const afterClose = await getAuctionSnapshot(f.soldiers[2]!.userId, f.tournamentId);
    expect(afterClose.current).toBeNull();
    expect(afterClose.lastResult).toMatchObject({ result: 'SOLD', price: 5 });
    expect(afterClose.nextAt).not.toBeNull();
    const team = afterClose.teams.find((x) => x.id === f.captains[1]!.teamId)!;
    expect(team).toMatchObject({ purseRemaining: 45, spent: 5, squadSize: 2 });

    await expireBreak(t.db, f.tournamentId);
    const afterBreak = await tickAuction({ userId: f.captains[0]!.userId }, f.tournamentId);
    expect(afterBreak.current?.playerId).toBe(f.soldiers[1]!.id);
  });

  it('tick is a no-op when nothing is due', async () => {
    const f = await makeAuction(t.db);
    const v = (await openFirstLot(f)).version;
    clearPublishedEvents();
    const snap = await tickAuction({ userId: f.captains[0]!.userId }, f.tournamentId);
    expect(snap.version).toBe(v);
    expect(getPublishedEvents()).toHaveLength(0);
  });

  it('the big screen reads and ticks with the live code only', async () => {
    const f = await makeAuction(t.db);
    await openFirstLot(f);
    const snap = await tickAuction({ userId: null, liveCode: f.liveCode }, f.tournamentId);
    expect(snap.current).not.toBeNull();
    await expect(
      tickAuction({ userId: null, liveCode: 'WRONG' }, f.tournamentId),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('runs re-auction rounds at the reduced price, then moves to ALLOCATION', async () => {
    const f = await makeAuction(t.db, { soldierPrices: [10, 4] });
    await openFirstLot(f);
    // Round 1: nobody bids on either soldier.
    await expireLot(t.db, f.tournamentId);
    await tickAuction({ userId: f.ownerId }, f.tournamentId);
    await expireBreak(t.db, f.tournamentId);
    await tickAuction({ userId: f.ownerId }, f.tournamentId);
    await expireLot(t.db, f.tournamentId);
    const round2 = await tickAuction({ userId: f.ownerId }, f.tournamentId);
    expect(round2.round).toBe(2);
    expect(round2.unsold).toHaveLength(0);
    expect(round2.pool).toHaveLength(2);

    await expireBreak(t.db, f.tournamentId);
    const lot = await tickAuction({ userId: f.ownerId }, f.tournamentId);
    expect(lot.current).toMatchObject({ basePrice: 5, originalBasePrice: 10, isReauction: true });

    // Round 2: still no bids → allocation.
    await expireLot(t.db, f.tournamentId);
    await tickAuction({ userId: f.ownerId }, f.tournamentId);
    await expireBreak(t.db, f.tournamentId);
    await tickAuction({ userId: f.ownerId }, f.tournamentId);
    clearPublishedEvents();
    await expireLot(t.db, f.tournamentId);
    const done = await tickAuction({ userId: f.ownerId }, f.tournamentId);
    expect(done.status).toBe('ALLOCATION');
    expect(done.unsold).toHaveLength(2);
    expect(done.nextAt).toBeNull();
    expect(types()).toEqual(['lot.closed', 'tournament.status']);
    const hooks = getQueuedWebhookEvents().flatMap((q) => q.events.map((e) => e.event));
    expect(hooks).toContain('auction.completed');
  });

  it('RANDOM_SQUAD sends an unbid soldier straight to a squad with space', async () => {
    const f = await makeAuction(t.db, {
      soldierPrices: [3, 3],
      settings: { unsoldPolicy: 'RANDOM_SQUAD' },
    });
    await openFirstLot(f);
    await expireLot(t.db, f.tournamentId);
    const snap = await tickAuction({ userId: f.ownerId }, f.tournamentId);
    expect(snap.lastResult).toMatchObject({ result: 'UNSOLD', reason: 'RANDOM_SQUAD', price: 0 });
    const member = snap.teams
      .flatMap((x) => x.members)
      .find((m) => m.playerId === f.soldiers[0]!.id);
    expect(member).toMatchObject({ acquiredVia: 'RANDOM_SQUAD', price: 0 });
  });

  it('settles several due steps in one go and versions every event', async () => {
    const f = await makeAuction(t.db, { settings: { breakSeconds: 0 } });
    const v = (await openFirstLot(f)).version;
    await expireLot(t.db, f.tournamentId);
    clearPublishedEvents();
    const snap = await tickAuction({ userId: f.ownerId }, f.tournamentId);
    // close + (break of 0 s is due at once) open next.
    expect(types().slice(0, 2)).toEqual(['lot.closed', 'lot.opened']);
    expect(snap.version).toBe(v + 2);
    const [state] = await t.db
      .select()
      .from(auctionState)
      .where(eq(auctionState.tournamentId, f.tournamentId));
    expect(state?.version).toBe(v + 2);
  });
});
