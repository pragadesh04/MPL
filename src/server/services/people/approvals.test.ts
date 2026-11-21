import { eq } from 'drizzle-orm';
import { leaders, notifications, players } from '@/server/db/schema';
import { AppError } from '@/server/errors';
import { clearPublishedEvents, getPublishedEvents } from '@/server/realtime/publisher';
import { setupTestDb } from '@/test/db';
import { makeLeader, makePlayer, makeTeam, makeTournament, makeUser } from '@/test/factories';
import { approvePending, rejectPending, switchRole } from './approvals';

const t = setupTestDb();

async function expectStatus(p: Promise<unknown>, status: number): Promise<void> {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.status === status);
}

async function setup() {
  const owner = await makeUser(t.db, { isOrganiser: true });
  const tour = await makeTournament(t.db, { ownerId: owner.id });
  return { owner, tour };
}

describe('approvals (path B, PLAN §2.3 B)', () => {
  it('bulk-approves pending soldiers with one base price and notifies them live', async () => {
    const { owner, tour } = await setup();
    const u1 = await makeUser(t.db);
    const u2 = await makeUser(t.db);
    const p1 = await makePlayer(t.db, {
      tournamentId: tour.id,
      userId: u1.id,
      status: 'PENDING_APPROVAL',
      source: 'ORGANISER_KEY',
      basePrice: 0,
    });
    const p2 = await makePlayer(t.db, {
      tournamentId: tour.id,
      userId: u2.id,
      status: 'PENDING_APPROVAL',
      source: 'ORGANISER_KEY',
      basePrice: 0,
    });
    clearPublishedEvents();
    const res = await approvePending(owner.id, tour.id, 'PLAYER', {
      ids: [p1.id, p2.id],
      basePrice: 3,
    });
    expect(res.approved.sort()).toEqual([p1.id, p2.id].sort());
    const rows = await t.db.select().from(players).where(eq(players.tournamentId, tour.id));
    expect(rows.every((r) => r.status === 'POOL' && r.basePrice === 3)).toBe(true);
    const inbox = getPublishedEvents().filter((e) => e.channel === `u:${u1.id}`);
    expect(inbox.map((e) => e.envelope.type)).toEqual(['notification.new', 'approval.changed']);
    const [n] = await t.db.select().from(notifications).where(eq(notifications.userId, u1.id));
    expect(n?.type).toBe('approval.approved');
  });

  it('approves a captain with the default purse; refuses a base price under the minimum', async () => {
    const { owner, tour } = await setup();
    const cap = await makeLeader(t.db, {
      tournamentId: tour.id,
      approval: 'PENDING',
      source: 'ORGANISER_KEY',
      purseTotal: 0,
      purseRemaining: 0,
    });
    await approvePending(owner.id, tour.id, 'LEADER', { ids: [cap.id] });
    const [row] = await t.db.select().from(leaders).where(eq(leaders.id, cap.id));
    expect(row).toMatchObject({ approval: 'APPROVED', purseTotal: 50, purseRemaining: 50 });
    const sol = await makePlayer(t.db, {
      tournamentId: tour.id,
      status: 'PENDING_APPROVAL',
      source: 'ORGANISER_KEY',
    });
    await expectStatus(
      approvePending(owner.id, tour.id, 'PLAYER', { ids: [sol.id], basePrice: 0 }),
      400,
    );
    await expectStatus(approvePending(owner.id, tour.id, 'LEADER', { ids: [cap.id] }), 409);
  });

  it('rejects with a reason', async () => {
    const { owner, tour } = await setup();
    const u = await makeUser(t.db);
    const sol = await makePlayer(t.db, {
      tournamentId: tour.id,
      userId: u.id,
      status: 'PENDING_APPROVAL',
      source: 'ORGANISER_KEY',
    });
    await rejectPending(owner.id, tour.id, 'PLAYER', sol.id, { reason: 'Full squad list' });
    const [row] = await t.db.select().from(players).where(eq(players.id, sol.id));
    expect(row).toMatchObject({ status: 'REJECTED', rejectReason: 'Full squad list' });
    await expectStatus(
      rejectPending(owner.id, tour.id, 'PLAYER', sol.id, { reason: 'again' }),
      404,
    );
  });

  it('switches captain ⇄ soldier keeping the approval state; drops the team', async () => {
    const { owner, tour } = await setup();
    const u = await makeUser(t.db);
    const cap = await makeLeader(t.db, {
      tournamentId: tour.id,
      userId: u.id,
      approval: 'PENDING',
      source: 'ORGANISER_KEY',
    });
    const toSoldier = await switchRole(owner.id, tour.id, 'LEADER', cap.id);
    expect(toSoldier.kind).toBe('PLAYER');
    const [p] = await t.db.select().from(players).where(eq(players.id, toSoldier.id));
    expect(p).toMatchObject({ userId: u.id, status: 'PENDING_APPROVAL', source: 'ORGANISER_KEY' });
    expect(await t.db.select().from(leaders).where(eq(leaders.id, cap.id))).toHaveLength(0);

    const approvedCap = await makeLeader(t.db, {
      tournamentId: tour.id,
      userId: (await makeUser(t.db)).id,
    });
    await makeTeam(t.db, { tournamentId: tour.id, leaderId: approvedCap.id });
    const sw = await switchRole(owner.id, tour.id, 'LEADER', approvedCap.id);
    const [p2] = await t.db.select().from(players).where(eq(players.id, sw.id));
    expect(p2).toMatchObject({ status: 'POOL', basePrice: 1 });

    const back = await switchRole(owner.id, tour.id, 'PLAYER', sw.id);
    const [l] = await t.db.select().from(leaders).where(eq(leaders.id, back.id));
    expect(l).toMatchObject({ approval: 'APPROVED', purseTotal: 50 });
  });
});

describe('tenant isolation: organiser A on organiser B’s tournament → 404', () => {
  it('404s on every approval service', async () => {
    const a = await setup();
    const b = await setup();
    const cap = await makeLeader(t.db, {
      tournamentId: b.tour.id,
      approval: 'PENDING',
      source: 'ORGANISER_KEY',
    });
    await expectStatus(approvePending(a.owner.id, b.tour.id, 'LEADER', { ids: [cap.id] }), 404);
    await expectStatus(
      rejectPending(a.owner.id, b.tour.id, 'LEADER', cap.id, { reason: 'x' }),
      404,
    );
    await expectStatus(switchRole(a.owner.id, b.tour.id, 'LEADER', cap.id), 404);
    // B's row through A's own tournament: nothing to approve / not found.
    await expectStatus(approvePending(a.owner.id, a.tour.id, 'LEADER', { ids: [cap.id] }), 409);
    await expectStatus(switchRole(a.owner.id, a.tour.id, 'LEADER', cap.id), 404);
  });
});
