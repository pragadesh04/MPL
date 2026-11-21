import { and, eq } from 'drizzle-orm';
import { setupTestDb } from '@/test/db';
import { makeUser } from '@/test/factories';
import { auditLog, bids, leaders, tournaments } from '@/server/db/schema';
import { clearPublishedEvents, getPublishedEvents } from '@/server/realtime/publisher';
import type { AuctionCommand } from '@/lib/schemas/auction';
import { placeBid } from './bids';
import { runAuctionCommand } from './commands';
import { buildSnapshot, getAuctionSnapshot, tickAuction } from './snapshot';
import { cid, expireBreak, expireLot, makeAuction, type AuctionFixture } from './test-fixtures';

const t = setupTestDb();

type Cmd = AuctionCommand extends infer C
  ? C extends AuctionCommand
    ? Omit<C, 'commandId' | 'expectedVersion'>
    : never
  : never;

async function command(f: AuctionFixture, userId: string, cmd: Cmd) {
  const { version } = await buildSnapshot(f.tournamentId);
  return (
    await runAuctionCommand(userId, f.tournamentId, {
      ...cmd,
      expectedVersion: version,
      commandId: cid(),
    } as AuctionCommand)
  ).snapshot;
}

async function sellFirstTo(f: AuctionFixture, captainIdx: number, amount: number) {
  const snap = await command(f, f.ownerId, { type: 'next' });
  await placeBid(f.captains[captainIdx]!.userId, f.tournamentId, {
    amount,
    expectedVersion: snap.version,
    commandId: cid(),
  });
  return command(f, f.ownerId, { type: 'sold' });
}

const audits = async (f: AuctionFixture) =>
  (await t.db.select().from(auditLog).where(eq(auditLog.tournamentId, f.tournamentId))).map(
    (a) => a.action,
  );

beforeEach(() => clearPublishedEvents());

describe('console commands', () => {
  it('sold now closes the lot to the leader and starts the break', async () => {
    const f = await makeAuction(t.db);
    const snap = await sellFirstTo(f, 0, 7);
    expect(snap.current).toBeNull();
    expect(snap.lastResult).toMatchObject({
      result: 'SOLD',
      price: 7,
      teamId: f.captains[0]!.teamId,
      reason: 'CLOSED_BY_ORGANISER',
    });
    expect(snap.nextAt).not.toBeNull();
    expect(await audits(f)).toContain('auction.sold');
  });

  it('sold without a bid is refused; mark unsold closes even with bids', async () => {
    const f = await makeAuction(t.db);
    const open = await command(f, f.ownerId, { type: 'next' });
    await expect(command(f, f.ownerId, { type: 'sold' })).rejects.toMatchObject({
      details: { reason: 'NO_BIDS' },
    });
    await placeBid(f.captains[0]!.userId, f.tournamentId, {
      amount: 2,
      expectedVersion: open.version,
      commandId: cid(),
    });
    const snap = await command(f, f.ownerId, { type: 'unsold' });
    expect(snap.lastResult).toMatchObject({ result: 'UNSOLD', reason: 'CLOSED_BY_ORGANISER' });
    expect(snap.unsold.map((p) => p.id)).toEqual([f.soldiers[0]!.id]);
  });

  it('next refuses while a lot runs and when the pool is empty; can pick a soldier', async () => {
    const f = await makeAuction(t.db, { soldierPrices: [1, 2] });
    const snap = await command(f, f.ownerId, { type: 'next', playerId: f.soldiers[1]!.id });
    expect(snap.current?.playerId).toBe(f.soldiers[1]!.id);
    await expect(command(f, f.ownerId, { type: 'next' })).rejects.toMatchObject({
      details: { reason: 'LOT_RUNNING' },
    });
    await command(f, f.ownerId, { type: 'unsold' });
    await command(f, f.ownerId, { type: 'next' });
    await command(f, f.ownerId, { type: 'unsold' });
    // Both unsold with one re-auction round configured → round 2 starts automatically.
    const r2 = await buildSnapshot(f.tournamentId);
    expect(r2.round).toBe(2);
  });

  it('pause freezes the remaining time and resume restores it', async () => {
    const f = await makeAuction(t.db);
    await command(f, f.ownerId, { type: 'next' });
    const paused = await command(f, f.ownerId, { type: 'pause' });
    expect(paused.status).toBe('AUCTION_PAUSED');
    expect(paused.pausedRemainingMs).toBeGreaterThan(55_000);
    // Time passing while paused never closes the lot.
    await expireLot(t.db, f.tournamentId);
    const still = await tickAuction({ userId: f.ownerId }, f.tournamentId);
    expect(still.current).not.toBeNull();
    const resumed = await command(f, f.ownerId, { type: 'resume' });
    expect(resumed.status).toBe('AUCTION_LIVE');
    expect(resumed.pausedRemainingMs).toBeNull();
    const left =
      new Date(resumed.current!.endsAt!).getTime() - new Date(resumed.serverNow).getTime();
    expect(left).toBeGreaterThan(55_000);
    await expect(command(f, f.ownerId, { type: 'resume' })).rejects.toMatchObject({
      details: { reason: 'NOT_PAUSED' },
    });
    const [tour] = await t.db.select().from(tournaments).where(eq(tournaments.id, f.tournamentId));
    expect(tour?.status).toBe('AUCTION_LIVE');
  });

  it('pause during the break keeps the break remainder', async () => {
    const f = await makeAuction(t.db, { settings: { breakSeconds: 30 } });
    await command(f, f.ownerId, { type: 'next' });
    await command(f, f.ownerId, { type: 'unsold' });
    const paused = await command(f, f.ownerId, { type: 'pause' });
    expect(paused.pausedRemainingMs).toBeGreaterThan(25_000);
    await expireBreak(t.db, f.tournamentId);
    const resumed = await command(f, f.ownerId, { type: 'resume' });
    expect(resumed.current).toBeNull();
    expect(new Date(resumed.nextAt!).getTime()).toBeGreaterThan(Date.now() + 20_000);
  });

  it('a stale expectedVersion is refused for console commands', async () => {
    const f = await makeAuction(t.db);
    await expect(
      runAuctionCommand(f.ownerId, f.tournamentId, {
        type: 'next',
        expectedVersion: 99,
        commandId: cid(),
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT', details: { reason: 'STALE_VERSION' } });
  });

  it('undo refunds the last sale and puts the soldier up next', async () => {
    const f = await makeAuction(t.db);
    await sellFirstTo(f, 0, 9);
    const snap = await command(f, f.ownerId, { type: 'undo', reason: 'Wrong team' });
    const team = snap.teams.find((x) => x.id === f.captains[0]!.teamId)!;
    expect(team).toMatchObject({ purseRemaining: 50, squadSize: 1 });
    expect(snap.pool[0]?.id).toBe(f.soldiers[0]!.id);
    expect(snap.lastResult).toBeNull();
    const [entry] = await t.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.tournamentId, f.tournamentId), eq(auditLog.action, 'auction.undo')));
    expect(entry?.reason).toBe('Wrong team');
    expect(getPublishedEvents().at(-1)?.envelope.type).toBe('people.updated');
    await expect(command(f, f.ownerId, { type: 'undo', reason: 'again' })).rejects.toMatchObject({
      details: { reason: 'NOTHING_TO_UNDO' },
    });
  });

  it('start new round reopens the pool after Auction again', async () => {
    const f = await makeAuction(t.db, {
      soldierPrices: [8],
      settings: { unsoldPolicy: 'ADMIN_DECIDES' },
    });
    await command(f, f.ownerId, { type: 'next' });
    const waiting = await command(f, f.ownerId, { type: 'unsold' });
    expect(waiting.status).toBe('AUCTION_LIVE');
    expect(waiting.nextAt).toBeNull();
    await expect(command(f, f.ownerId, { type: 'start-round' })).rejects.toMatchObject({
      details: { reason: 'NO_POOL' },
    });
    await command(f, f.coAdminId, { type: 'auction-again', playerId: f.soldiers[0]!.id });
    await command(f, f.ownerId, { type: 'take-control' });
    const r2 = await command(f, f.ownerId, { type: 'start-round' });
    expect(r2.round).toBe(2);
    expect(r2.current).toMatchObject({ basePrice: 4, originalBasePrice: 8, isReauction: true });
  });
});

describe('controller lock', () => {
  it('only the controller runs the console; take control is logged', async () => {
    const f = await makeAuction(t.db);
    await command(f, f.ownerId, { type: 'next' });
    await expect(command(f, f.auctioneerId, { type: 'unsold' })).rejects.toMatchObject({
      details: { reason: 'NOT_CONTROLLER' },
    });
    const snap = await command(f, f.auctioneerId, { type: 'take-control' });
    expect(snap.controllerUserId).toBe(f.auctioneerId);
    await expect(command(f, f.auctioneerId, { type: 'unsold' })).resolves.toBeDefined();
    expect(await audits(f)).toContain('auction.control_taken');
  });
});

describe('roster commands', () => {
  it('release refunds what was paid and sends the soldier to the back of the pool', async () => {
    const f = await makeAuction(t.db);
    await sellFirstTo(f, 1, 6);
    const snap = await command(f, f.coAdminId, {
      type: 'release',
      playerId: f.soldiers[0]!.id,
      reason: 'Left the group',
    });
    expect(snap.teams.find((x) => x.id === f.captains[1]!.teamId)).toMatchObject({
      purseRemaining: 50,
      squadSize: 1,
    });
    expect(snap.pool.at(-1)?.id).toBe(f.soldiers[0]!.id);
    await expect(
      command(f, f.coAdminId, { type: 'release', playerId: f.soldiers[0]!.id }),
    ).rejects.toMatchObject({ details: { reason: 'NOT_IN_SQUAD' } });
  });

  it('assign puts an unsold soldier in a squad at 0 and completes the auction when done', async () => {
    const f = await makeAuction(t.db, {
      soldierPrices: [5],
      settings: { unsoldPolicy: 'ADMIN_DECIDES' },
    });
    await command(f, f.ownerId, { type: 'next' });
    await command(f, f.ownerId, { type: 'unsold' });
    const snap = await command(f, f.coAdminId, {
      type: 'assign',
      playerId: f.soldiers[0]!.id,
      teamId: f.captains[0]!.teamId,
    });
    expect(snap.teams[0]?.members[0]).toMatchObject({ acquiredVia: 'ADMIN_PICK', price: 0 });
    expect(snap.status).toBe('ALLOCATION');
  });

  it('assign refuses a full squad; auction again refuses a soldier who is not unsold', async () => {
    const f = await makeAuction(t.db, {
      soldierPrices: [1, 1],
      settings: { maxPlayersPerTeam: 2, minPlayersPerTeam: 1, unsoldPolicy: 'ADMIN_DECIDES' },
    });
    await sellFirstTo(f, 0, 1);
    await expireBreak(t.db, f.tournamentId);
    await tickAuction({ userId: f.ownerId }, f.tournamentId);
    await command(f, f.ownerId, { type: 'unsold' });
    await expect(
      command(f, f.ownerId, {
        type: 'assign',
        playerId: f.soldiers[1]!.id,
        teamId: f.captains[0]!.teamId,
      }),
    ).rejects.toMatchObject({ details: { reason: 'SQUAD_FULL' } });
    await expect(
      command(f, f.ownerId, { type: 'auction-again', playerId: f.soldiers[0]!.id }),
    ).rejects.toMatchObject({ details: { reason: 'NOT_UNSOLD' } });
  });
});

describe('reset', () => {
  it('needs the typed name, then clears bids and sales and refunds every purse', async () => {
    const f = await makeAuction(t.db);
    await sellFirstTo(f, 0, 10);
    await expect(
      command(f, f.ownerId, { type: 'reset', confirmName: 'nope' }),
    ).rejects.toMatchObject({ details: { reason: 'CONFIRM_MISMATCH' } });
    const snap = await command(f, f.ownerId, { type: 'reset', confirmName: f.name.toUpperCase() });
    expect(snap.round).toBe(1);
    expect(snap.current).toBeNull();
    expect(snap.lastResult).toBeNull();
    expect(snap.pool).toHaveLength(3);
    expect(snap.teams.every((x) => x.purseRemaining === 50 && x.squadSize === 1)).toBe(true);
    expect(await t.db.select().from(bids).where(eq(bids.tournamentId, f.tournamentId))).toEqual([]);
    const ls = await t.db.select().from(leaders).where(eq(leaders.tournamentId, f.tournamentId));
    expect(ls.every((l) => l.purseRemaining === l.purseTotal)).toBe(true);
  });
});

describe('permissions and tenant isolation', () => {
  it('maps commands to the §2.4 table', async () => {
    const f = await makeAuction(t.db);
    await expect(
      command(f, f.auctioneerId, { type: 'release', playerId: f.soldiers[0]!.id }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      command(f, f.coAdminId, { type: 'reset', confirmName: f.name }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(command(f, f.captains[0]!.userId, { type: 'next' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(command(f, f.auctioneerId, { type: 'next' })).resolves.toBeDefined();
  });

  it("an organiser of another tournament gets 404 on this one's auction", async () => {
    const a = await makeAuction(t.db);
    const b = await makeAuction(t.db);
    await expect(command(a, b.ownerId, { type: 'next' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(getAuctionSnapshot(b.ownerId, a.tournamentId)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(
      placeBid(b.captains[0]!.userId, a.tournamentId, {
        amount: 2,
        expectedVersion: 0,
        commandId: cid(),
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    // A soldier id from tournament B is unknown in A.
    await command(a, a.ownerId, { type: 'next' });
    await command(a, a.ownerId, { type: 'unsold' });
    await expect(
      command(a, a.ownerId, {
        type: 'assign',
        playerId: b.soldiers[0]!.id,
        teamId: a.captains[0]!.teamId,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      command(a, a.ownerId, {
        type: 'assign',
        playerId: a.soldiers[0]!.id,
        teamId: b.captains[0]!.teamId,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const stranger = await makeUser(t.db);
    await expect(getAuctionSnapshot(stranger.id, a.tournamentId)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('a tournament without an auction yet reports AUCTION_NOT_STARTED', async () => {
    const owner = await makeUser(t.db, { isOrganiser: true });
    const { makeTournament } = await import('@/test/factories');
    const tour = await makeTournament(t.db, { ownerId: owner.id, status: 'READY' });
    await expect(getAuctionSnapshot(owner.id, tour.id)).rejects.toMatchObject({
      details: { reason: 'AUCTION_NOT_STARTED' },
    });
    await expect(
      runAuctionCommand(owner.id, tour.id, { type: 'next', expectedVersion: 0, commandId: cid() }),
    ).rejects.toMatchObject({ details: { reason: 'AUCTION_NOT_STARTED' } });
  });
});
