import { eq } from 'drizzle-orm';
import { DEFAULT_SETTINGS } from '@/lib/schemas/settings';
import { auditLog, joinRequests, memberships, tournaments } from '@/server/db/schema';
import { AppError } from '@/server/errors';
import { clearPublishedEvents, getPublishedEvents } from '@/server/realtime/publisher';
import { setupTestDb } from '@/test/db';
import { makeLeader, makePlayer, makeTournament, makeUser } from '@/test/factories';
import { getSetupOverview } from './setup';
import {
  cancelTournament,
  createTournament,
  getTournamentForOrganiser,
  listMyTournaments,
  setRegistration,
  updateBasics,
  updateSettings,
} from './tournaments';

const t = setupTestDb();

async function expectStatus(p: Promise<unknown>, status: number): Promise<void> {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.status === status);
}

describe('createTournament (PLAN §1, decision 11)', () => {
  it('creates the tournament with an OWNER membership and default settings', async () => {
    const org = await makeUser(t.db, { isOrganiser: true });
    const created = await createTournament(org.id, { name: 'Season 1' });
    const [row] = await t.db.select().from(tournaments).where(eq(tournaments.id, created.id));
    expect(row).toMatchObject({ status: 'DRAFT', ownerId: org.id, registrationOpen: true });
    expect(row?.settings).toEqual(DEFAULT_SETTINGS);
    const mem = await t.db
      .select()
      .from(memberships)
      .where(eq(memberships.tournamentId, created.id));
    expect(mem).toEqual([expect.objectContaining({ userId: org.id, role: 'OWNER' })]);
  });

  it('refuses player accounts', async () => {
    const player = await makeUser(t.db);
    await expectStatus(createTournament(player.id, { name: 'Nope nope' }), 403);
  });

  it('allows only one active tournament per owner (409), until it is cancelled', async () => {
    const org = await makeUser(t.db, { isOrganiser: true });
    const first = await createTournament(org.id, { name: 'First one' });
    await expectStatus(createTournament(org.id, { name: 'Second one' }), 409);
    await cancelTournament(org.id, first.id, { confirmName: 'first ONE' });
    await expect(createTournament(org.id, { name: 'Second one' })).resolves.toBeTruthy();
  });

  it('copies settings from my own earlier tournament but never from someone else’s', async () => {
    const org = await makeUser(t.db, { isOrganiser: true });
    const other = await makeUser(t.db, { isOrganiser: true });
    const old = await makeTournament(t.db, {
      ownerId: org.id,
      status: 'COMPLETED',
      settings: { ...DEFAULT_SETTINGS, defaultPurse: 1000, maxPlayersPerTeam: 8 },
    });
    const foreign = await makeTournament(t.db, { ownerId: other.id, status: 'COMPLETED' });
    const created = await createTournament(org.id, { name: 'Copied', copySettingsFrom: old.id });
    const [row] = await t.db.select().from(tournaments).where(eq(tournaments.id, created.id));
    expect(row?.settings).toMatchObject({ defaultPurse: 1000, maxPlayersPerTeam: 8 });

    const org2 = await makeUser(t.db, { isOrganiser: true });
    await expectStatus(
      createTournament(org2.id, { name: 'Steal', copySettingsFrom: foreign.id }),
      404,
    );
  });
});

describe('settings, basics and registration', () => {
  it('saves settings before Start and keeps DRAFT ⇄ READY in step', async () => {
    const org = await makeUser(t.db, { isOrganiser: true });
    const tour = await makeTournament(t.db, { ownerId: org.id });
    clearPublishedEvents();
    await updateSettings(org.id, tour.id, { settings: { ...DEFAULT_SETTINGS, defaultPurse: 80 } });
    const [row] = await t.db.select().from(tournaments).where(eq(tournaments.id, tour.id));
    expect(row?.settings).toMatchObject({ defaultPurse: 80 });
    expect(row?.status).toBe('DRAFT');
    expect(getPublishedEvents().map((e) => e.envelope.type)).toContain('people.updated');
  });

  it('after Start allows timer changes but needs a reason for locked settings (audited)', async () => {
    const org = await makeUser(t.db, { isOrganiser: true });
    const tour = await makeTournament(t.db, { ownerId: org.id, status: 'AUCTION_LIVE' });
    await updateSettings(org.id, tour.id, {
      settings: { ...DEFAULT_SETTINGS, bidTimerSeconds: 30, timerResetSeconds: 30 },
    });
    await expectStatus(
      updateSettings(org.id, tour.id, { settings: { ...DEFAULT_SETTINGS, defaultPurse: 99 } }),
      400,
    );
    await updateSettings(org.id, tour.id, {
      settings: { ...DEFAULT_SETTINGS, defaultPurse: 99 },
      reason: 'Agreed with captains',
    });
    const logs = await t.db.select().from(auditLog).where(eq(auditLog.tournamentId, tour.id));
    expect(logs.map((l) => l.action)).toEqual(['settings.updated', 'settings.override']);
    expect(logs[1]?.reason).toBe('Agreed with captains');
  });

  it('locks basics and registration after Start', async () => {
    const org = await makeUser(t.db, { isOrganiser: true });
    const tour = await makeTournament(t.db, { ownerId: org.id, status: 'AUCTION_LIVE' });
    await expectStatus(updateBasics(org.id, tour.id, { name: 'Renamed one' }), 409);
    await expectStatus(
      setRegistration(org.id, tour.id, { registrationOpen: true, maxRegistrations: null }),
      409,
    );
  });

  it('opens / closes registration with a cap', async () => {
    const org = await makeUser(t.db, { isOrganiser: true });
    const tour = await makeTournament(t.db, { ownerId: org.id });
    await setRegistration(org.id, tour.id, { registrationOpen: false, maxRegistrations: 20 });
    const [row] = await t.db.select().from(tournaments).where(eq(tournaments.id, tour.id));
    expect(row).toMatchObject({ registrationOpen: false, maxRegistrations: 20 });
  });

  it('lets an auctioneer view but not edit', async () => {
    const org = await makeUser(t.db, { isOrganiser: true });
    const auctioneer = await makeUser(t.db);
    const tour = await makeTournament(t.db, { ownerId: org.id });
    await t.db
      .insert(memberships)
      .values({ tournamentId: tour.id, userId: auctioneer.id, role: 'AUCTIONEER' });
    await expect(getTournamentForOrganiser(auctioneer.id, tour.id)).resolves.toBeTruthy();
    await expectStatus(updateBasics(auctioneer.id, tour.id, { name: 'Hijacked' }), 403);
  });
});

describe('cancelTournament', () => {
  it('needs the owner and the exact name; expires pending requests', async () => {
    const org = await makeUser(t.db, { isOrganiser: true });
    const coAdmin = await makeUser(t.db);
    const fa = await makeUser(t.db);
    const tour = await makeTournament(t.db, { ownerId: org.id, name: 'Cup Final' });
    await t.db
      .insert(memberships)
      .values({ tournamentId: tour.id, userId: coAdmin.id, role: 'CO_ADMIN' });
    await t.db.insert(joinRequests).values({
      tournamentId: tour.id,
      fromUserId: org.id,
      toUserId: fa.id,
      role: 'PLAYER',
      basePrice: 1,
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    await expectStatus(cancelTournament(coAdmin.id, tour.id, { confirmName: 'Cup Final' }), 403);
    await expectStatus(cancelTournament(org.id, tour.id, { confirmName: 'Cup' }), 400);
    await cancelTournament(org.id, tour.id, { confirmName: 'cup final' });
    const [row] = await t.db.select().from(tournaments).where(eq(tournaments.id, tour.id));
    expect(row).toMatchObject({ status: 'CANCELLED', registrationOpen: false });
    const [req] = await t.db
      .select()
      .from(joinRequests)
      .where(eq(joinRequests.tournamentId, tour.id));
    expect(req?.status).toBe('EXPIRED');
  });
});

describe('listMyTournaments / getSetupOverview', () => {
  it('lists only my tournaments with my roles, pending and team', async () => {
    const orgA = await makeUser(t.db, { isOrganiser: true });
    const orgB = await makeUser(t.db, { isOrganiser: true });
    const me = await makeUser(t.db);
    const a = await makeTournament(t.db, { ownerId: orgA.id });
    const b = await makeTournament(t.db, { ownerId: orgB.id });
    const unrelated = await makeTournament(t.db, {
      ownerId: (await makeUser(t.db, { isOrganiser: true })).id,
    });
    await makeLeader(t.db, { tournamentId: a.id, userId: me.id });
    await makePlayer(t.db, {
      tournamentId: b.id,
      userId: me.id,
      status: 'PENDING_APPROVAL',
      source: 'ORGANISER_KEY',
    });

    const mine = await listMyTournaments(me.id);
    expect(mine.map((x) => x.id).sort()).toEqual([a.id, b.id].sort());
    expect(mine.find((x) => x.id === a.id)).toMatchObject({ roles: ['CAPTAIN'], pending: null });
    expect(mine.find((x) => x.id === b.id)).toMatchObject({ roles: [], pending: 'PLAYER' });
    expect(mine.some((x) => x.id === unrelated.id)).toBe(false);
  });

  it('summarises counts and readiness for organisers', async () => {
    const org = await makeUser(t.db, { isOrganiser: true });
    const tour = await makeTournament(t.db, { ownerId: org.id });
    await makeLeader(t.db, { tournamentId: tour.id, purseTotal: 50, purseRemaining: 50 });
    await makeLeader(t.db, { tournamentId: tour.id, purseTotal: 70, purseRemaining: 70 });
    await makePlayer(t.db, { tournamentId: tour.id });
    const o = await getSetupOverview(org.id, tour.id);
    expect(o.counts).toMatchObject({ captains: 2, soldiers: 1 });
    expect(o.totalPurse).toBe(120);
    expect(o.readiness.ok).toBe(false);
  });
});

describe('tenant isolation (PLAN §2.0): organiser A on organiser B’s tournament → 404', () => {
  it('404s on every tournament service', async () => {
    const orgA = await makeUser(t.db, { isOrganiser: true });
    const orgB = await makeUser(t.db, { isOrganiser: true });
    await makeTournament(t.db, { ownerId: orgA.id });
    const tourB = await makeTournament(t.db, { ownerId: orgB.id, name: 'B Cup' });
    await expectStatus(getTournamentForOrganiser(orgA.id, tourB.id), 404);
    await expectStatus(getSetupOverview(orgA.id, tourB.id), 404);
    await expectStatus(updateBasics(orgA.id, tourB.id, { name: 'Mine now' }), 404);
    await expectStatus(updateSettings(orgA.id, tourB.id, { settings: DEFAULT_SETTINGS }), 404);
    await expectStatus(
      setRegistration(orgA.id, tourB.id, { registrationOpen: false, maxRegistrations: null }),
      404,
    );
    await expectStatus(cancelTournament(orgA.id, tourB.id, { confirmName: 'B Cup' }), 404);
    await expectStatus(
      createTournament(orgA.id, { name: 'X copy', copySettingsFrom: tourB.id }),
      404,
    );
  });
});
