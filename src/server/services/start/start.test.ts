import { eq } from 'drizzle-orm';
import { DEFAULT_SETTINGS } from '@/lib/schemas/settings';
import { auctionState, auditLog, joinRequests, memberships, tournaments } from '@/server/db/schema';
import { AppError } from '@/server/errors';
import { clearPublishedEvents, getPublishedEvents } from '@/server/realtime/publisher';
import { setupTestDb } from '@/test/db';
import { makeLeader, makePlayer, makeTeam, makeTournament, makeUser } from '@/test/factories';
import { addPerson } from '../people/people';
import { updateSettings } from '../tournaments/tournaments';
import { syncReadyStatus } from './readiness';
import { getReadiness, startTournament } from './start';

const t = setupTestDb();

async function expectStatus(p: Promise<unknown>, status: number): Promise<AppError> {
  try {
    await p;
  } catch (err) {
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).status).toBe(status);
    return err as AppError;
  }
  throw new Error(`expected ${status}`);
}

/** A tournament that passes every §3.5 check: 2 captains with teams, 6 soldiers. */
async function readyTournament() {
  const owner = await makeUser(t.db, { isOrganiser: true });
  const tour = await makeTournament(t.db, { ownerId: owner.id, name: 'Start Cup' });
  const colours = ['#e63946', '#4361ee'];
  for (const [i, color] of colours.entries()) {
    const u = await makeUser(t.db);
    const l = await makeLeader(t.db, { tournamentId: tour.id, userId: u.id });
    await makeTeam(t.db, {
      tournamentId: tour.id,
      leaderId: l.id,
      color,
      name: `Team ${i}`,
      shortName: `TM${i}`,
    });
  }
  for (let i = 0; i < 6; i++) await makePlayer(t.db, { tournamentId: tour.id });
  return { owner, tour };
}

describe('readiness (PLAN §3.5)', () => {
  it('keeps DRAFT ⇄ READY in step with the checks', async () => {
    const { owner, tour } = await readyTournament();
    expect(await syncReadyStatus(t.db, tour.id)).toBe(true);
    let [row] = await t.db.select().from(tournaments).where(eq(tournaments.id, tour.id));
    expect(row?.status).toBe('READY');
    // Adding a soldier beyond capacity drops it back to DRAFT (via afterRosterChange).
    for (let i = 0; i < 5; i++)
      await addPerson(owner.id, tour.id, { type: 'PLAYER', name: `Extra ${i}` });
    [row] = await t.db.select().from(tournaments).where(eq(tournaments.id, tour.id));
    expect(row?.status).toBe('DRAFT');
    expect(
      (await getReadiness(owner.id, tour.id)).checks.find((c) => c.id === 'CAPACITY')?.ok,
    ).toBe(false);
  });
});

describe('startTournament (PLAN §7.2 step 5)', () => {
  it('locks, closes registration, expires requests, audits, publishes and calls initializeAuction', async () => {
    const { owner, tour } = await readyTournament();
    const fa = await makeUser(t.db);
    await t.db.insert(joinRequests).values({
      tournamentId: tour.id,
      fromUserId: owner.id,
      toUserId: fa.id,
      role: 'PLAYER',
      basePrice: 1,
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    clearPublishedEvents();
    const res = await startTournament(owner.id, tour.id, { confirmName: 'start cup' });
    expect(res.status).toBe('AUCTION_LIVE');

    const [row] = await t.db.select().from(tournaments).where(eq(tournaments.id, tour.id));
    expect(row).toMatchObject({ status: 'AUCTION_LIVE', registrationOpen: false });
    expect(row?.startedAt).toBeInstanceOf(Date);
    expect(row?.lockedAt).toBeInstanceOf(Date);
    const [req] = await t.db
      .select()
      .from(joinRequests)
      .where(eq(joinRequests.tournamentId, tour.id));
    expect(req?.status).toBe('EXPIRED');
    expect(
      await t.db.select().from(auctionState).where(eq(auctionState.tournamentId, tour.id)),
    ).toHaveLength(1);
    const logs = await t.db.select().from(auditLog).where(eq(auditLog.tournamentId, tour.id));
    expect(logs.map((l) => l.action)).toContain('tournament.started');

    const events = getPublishedEvents();
    expect(events.find((e) => e.channel === `u:${fa.id}`)?.envelope.type).toBe('request.cancelled');
    expect(
      events.find((e) => e.envelope.type === 'tournament.status')?.envelope.data,
    ).toMatchObject({
      status: 'AUCTION_LIVE',
    });

    // Settings are locked now: a purse change needs a reason (logged override).
    await expectStatus(
      updateSettings(owner.id, tour.id, { settings: { ...DEFAULT_SETTINGS, defaultPurse: 99 } }),
      400,
    );
    // And it can't start twice.
    await expectStatus(startTournament(owner.id, tour.id, { confirmName: 'Start Cup' }), 409);
  });

  it('refuses when a check fails, naming the failing checks', async () => {
    const { owner, tour } = await readyTournament();
    await makePlayer(t.db, {
      tournamentId: tour.id,
      status: 'PENDING_APPROVAL',
      source: 'ORGANISER_KEY',
    });
    const err = await expectStatus(
      startTournament(owner.id, tour.id, { confirmName: 'Start Cup' }),
      409,
    );
    expect(err.details).toMatchObject({ reason: 'NOT_READY', failing: ['NONE_PENDING'] });
    const [row] = await t.db.select().from(tournaments).where(eq(tournaments.id, tour.id));
    expect(row?.status).not.toBe('AUCTION_LIVE');
  });

  it('needs the exact name and the stage:advance permission', async () => {
    const { owner, tour } = await readyTournament();
    await expectStatus(startTournament(owner.id, tour.id, { confirmName: 'Start' }), 400);
    const auc = await makeUser(t.db);
    await t.db
      .insert(memberships)
      .values({ tournamentId: tour.id, userId: auc.id, role: 'AUCTIONEER' });
    await expectStatus(startTournament(auc.id, tour.id, { confirmName: 'Start Cup' }), 403);
    const co = await makeUser(t.db);
    await t.db
      .insert(memberships)
      .values({ tournamentId: tour.id, userId: co.id, role: 'CO_ADMIN' });
    await expect(
      startTournament(co.id, tour.id, { confirmName: 'Start Cup' }),
    ).resolves.toBeTruthy();
  });
});

describe('tenant isolation: organiser A on organiser B’s tournament → 404', () => {
  it('404s on readiness and start', async () => {
    const a = await readyTournament();
    const b = await readyTournament();
    await expectStatus(getReadiness(a.owner.id, b.tour.id), 404);
    await expectStatus(startTournament(a.owner.id, b.tour.id, { confirmName: 'Start Cup' }), 404);
  });
});
