import { and, eq } from 'drizzle-orm';
import { setupTestDb } from '@/test/db';
import { auditLog, players, tournaments } from '@/server/db/schema';
import { clearPublishedEvents, getPublishedEvents } from '@/server/realtime/publisher';
import { clearQueuedWebhookEvents, getQueuedWebhookEvents } from '../webhooks/dispatch';
import { placeBid } from '../auction/bids';
import { runAuctionCommand } from '../auction/commands';
import { tickAuction } from '../auction/snapshot';
import { cid, makeAuction, type AuctionFixture } from '../auction/test-fixtures';
import { confirmAllocation, previewAllocation } from './allocation';

const t = setupTestDb();

async function cmd(f: AuctionFixture, type: 'next' | 'sold' | 'unsold') {
  const { version } = await tickAuction({ userId: f.ownerId }, f.tournamentId);
  return runAuctionCommand(f.ownerId, f.tournamentId, {
    type,
    expectedVersion: version,
    commandId: cid(),
  });
}

/**
 * 2 captains (squad max 3 → 2 soldiers each), 4 soldiers, no re-auction rounds.
 * Captain 0 buys soldiers 1 and 2; soldiers 3 and 4 go unsold → ALLOCATION.
 */
async function toAllocation() {
  const f = await makeAuction(t.db, {
    soldierPrices: [5, 4, 3, 2],
    settings: {
      maxPlayersPerTeam: 3,
      minPlayersPerTeam: 2,
      unsoldReauctionRounds: 0,
      breakSeconds: 60,
    },
  });
  for (let i = 0; i < 2; i++) {
    const snap = (await cmd(f, 'next')).snapshot;
    await placeBid(f.captains[0]!.userId, f.tournamentId, {
      amount: snap.current!.nextBid,
      expectedVersion: snap.version,
      commandId: cid(),
    });
    await cmd(f, 'sold');
  }
  await cmd(f, 'next');
  await cmd(f, 'unsold');
  await cmd(f, 'next');
  const done = (await cmd(f, 'unsold')).snapshot;
  expect(done.status).toBe('ALLOCATION');
  return f;
}

beforeEach(() => {
  clearPublishedEvents();
  clearQueuedWebhookEvents();
});

describe('previewAllocation', () => {
  it('plans fewest-players first with reasons and squad sizes after', async () => {
    const f = await toAllocation();
    const p = await previewAllocation(f.coAdminId, f.tournamentId);
    expect(p.leftovers).toHaveLength(2);
    expect(p.steps.map((s) => [s.playerId, s.teamId])).toEqual([
      [f.soldiers[2]!.id, f.captains[1]!.teamId],
      [f.soldiers[3]!.id, f.captains[1]!.teamId],
    ]);
    expect(p.steps[0]).toMatchObject({ reason: 'Fewest players: 1', basePrice: 3 });
    expect(p.teams.find((x) => x.teamId === f.captains[1]!.teamId)?.squadSizeAfter).toBe(3);
    expect(p.belowMinimum).toEqual([]);
    // Preview writes nothing.
    const [row] = await t.db.select().from(players).where(eq(players.id, f.soldiers[2]!.id));
    expect(row?.status).toBe('UNSOLD');
  });

  it('is organiser-only and tenant-scoped', async () => {
    const f = await toAllocation();
    const other = await makeAuction(t.db);
    await expect(previewAllocation(f.captains[0]!.userId, f.tournamentId)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(previewAllocation(other.ownerId, f.tournamentId)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('confirmAllocation', () => {
  it('allocates at price 0, emits a step per soldier and moves to GROUP_DRAW', async () => {
    const f = await toAllocation();
    clearPublishedEvents();
    clearQueuedWebhookEvents();
    const res = await confirmAllocation(f.ownerId, f.tournamentId, { commandId: cid() });
    expect(res).toEqual({ status: 'GROUP_DRAW', allocated: 2 });
    const rows = await t.db.select().from(players).where(eq(players.tournamentId, f.tournamentId));
    expect(rows.filter((r) => r.status === 'ALLOCATED')).toHaveLength(2);
    expect(rows.find((r) => r.id === f.soldiers[3]!.id)).toMatchObject({
      teamId: f.captains[1]!.teamId,
      soldPrice: 0,
      acquiredVia: 'AUTO_ALLOCATED',
    });
    const [tour] = await t.db.select().from(tournaments).where(eq(tournaments.id, f.tournamentId));
    expect(tour?.status).toBe('GROUP_DRAW');
    expect(getPublishedEvents().map((e) => e.envelope.type)).toEqual([
      'allocation.step',
      'allocation.step',
      'tournament.status',
    ]);
    const hooks = getQueuedWebhookEvents().flatMap((q) => q.events.map((e) => e.event));
    expect(hooks).toEqual(['allocation.completed']);
    await expect(
      confirmAllocation(f.ownerId, f.tournamentId, { commandId: cid() }),
    ).rejects.toMatchObject({ details: { reason: 'NOT_ALLOCATION' } });
  });

  it('applies overrides with a reason and logs them; blocks squads over the limit', async () => {
    const f = await toAllocation();
    await expect(
      confirmAllocation(f.ownerId, f.tournamentId, {
        commandId: cid(),
        overrides: [{ playerId: f.soldiers[2]!.id, teamId: f.captains[0]!.teamId }],
      }),
    ).rejects.toMatchObject({ details: { reason: 'REASON_REQUIRED' } });
    await expect(
      confirmAllocation(f.ownerId, f.tournamentId, {
        commandId: cid(),
        overrides: [{ playerId: f.soldiers[2]!.id, teamId: f.captains[0]!.teamId }],
        reason: 'Swap',
      }),
    ).rejects.toMatchObject({ details: { reason: 'SQUAD_FULL' } });
  });

  it('logs an accepted override as an admin pick', async () => {
    const f = await makeAuction(t.db, {
      soldierPrices: [2, 1],
      settings: {
        maxPlayersPerTeam: 3,
        minPlayersPerTeam: 1,
        unsoldReauctionRounds: 0,
        breakSeconds: 60,
      },
    });
    await cmd(f, 'next');
    await cmd(f, 'unsold');
    await cmd(f, 'next');
    await cmd(f, 'unsold');
    const res = await confirmAllocation(f.ownerId, f.tournamentId, {
      commandId: cid(),
      overrides: [{ playerId: f.soldiers[0]!.id, teamId: f.captains[1]!.teamId }],
      reason: 'Friends play together',
    });
    expect(res.allocated).toBe(2);
    const [row] = await t.db.select().from(players).where(eq(players.id, f.soldiers[0]!.id));
    expect(row).toMatchObject({ teamId: f.captains[1]!.teamId, acquiredVia: 'ADMIN_PICK' });
    const [entry] = await t.db
      .select()
      .from(auditLog)
      .where(
        and(eq(auditLog.tournamentId, f.tournamentId), eq(auditLog.action, 'allocation.completed')),
      );
    expect(entry?.reason).toBe('Friends play together');
  });

  it('blocks a plan that leaves a squad below the minimum', async () => {
    const f = await makeAuction(t.db, {
      captains: 2,
      soldierPrices: [1],
      settings: { maxPlayersPerTeam: 3, minPlayersPerTeam: 2, unsoldReauctionRounds: 0 },
    });
    await cmd(f, 'next');
    await cmd(f, 'unsold');
    const p = await previewAllocation(f.ownerId, f.tournamentId);
    expect(p.belowMinimum).toHaveLength(1);
    await expect(
      confirmAllocation(f.ownerId, f.tournamentId, { commandId: cid() }),
    ).rejects.toMatchObject({ details: { reason: 'BELOW_MINIMUM' } });
  });

  it('auctioneers cannot run allocation', async () => {
    const f = await toAllocation();
    await expect(
      confirmAllocation(f.auctioneerId, f.tournamentId, { commandId: cid() }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
