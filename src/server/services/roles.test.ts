import { memberships } from '@/server/db/schema';
import { AppError } from '@/server/errors';
import { setupTestDb } from '@/test/db';
import { makeLeader, makePlayer, makeTeam, makeTournament, makeUser } from '@/test/factories';
import { loadTournamentRole, requireParticipant, requireRole } from './roles';

const t = setupTestDb();

async function expectStatus(p: Promise<unknown>, status: number): Promise<void> {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.status === status);
}

describe('loadTournamentRole / requireRole (PLAN §2.4, §5)', () => {
  it('resolves owner, co-admin and auctioneer from memberships', async () => {
    const owner = await makeUser(t.db, { isOrganiser: true });
    const coAdmin = await makeUser(t.db);
    const auctioneer = await makeUser(t.db);
    const tour = await makeTournament(t.db, { ownerId: owner.id });
    await t.db.insert(memberships).values([
      { tournamentId: tour.id, userId: coAdmin.id, role: 'CO_ADMIN', addedBy: owner.id },
      { tournamentId: tour.id, userId: auctioneer.id, role: 'AUCTIONEER', addedBy: owner.id },
    ]);

    expect((await loadTournamentRole(owner.id, tour.id))?.roles).toEqual(['OWNER']);
    expect((await loadTournamentRole(coAdmin.id, tour.id))?.roles).toEqual(['CO_ADMIN']);

    await expect(requireRole(owner.id, tour.id, 'auction:reset')).resolves.toBeTruthy();
    await expectStatus(requireRole(coAdmin.id, tour.id, 'auction:reset'), 403);
    await expect(requireRole(auctioneer.id, tour.id, 'auction:control')).resolves.toBeTruthy();
    await expectStatus(requireRole(auctioneer.id, tour.id, 'settings:edit'), 403);
  });

  it('counts only approved captains and soldiers', async () => {
    const owner = await makeUser(t.db, { isOrganiser: true });
    const tour = await makeTournament(t.db, { ownerId: owner.id });
    const captain = await makeUser(t.db);
    const pendingCaptain = await makeUser(t.db);
    const soldier = await makeUser(t.db);
    const pendingSoldier = await makeUser(t.db);

    const leader = await makeLeader(t.db, { tournamentId: tour.id, userId: captain.id });
    const team = await makeTeam(t.db, { tournamentId: tour.id, leaderId: leader.id });
    const pendingLeader = await makeLeader(t.db, {
      tournamentId: tour.id,
      userId: pendingCaptain.id,
      approval: 'PENDING',
      source: 'ORGANISER_KEY',
    });
    const player = await makePlayer(t.db, { tournamentId: tour.id, userId: soldier.id });
    const pendingPlayer = await makePlayer(t.db, {
      tournamentId: tour.id,
      userId: pendingSoldier.id,
      status: 'PENDING_APPROVAL',
      source: 'ORGANISER_KEY',
    });

    const cap = await requireRole(captain.id, tour.id, 'auction:bid');
    expect(cap).toMatchObject({ roles: ['CAPTAIN'], leaderId: leader.id, teamId: team.id });

    const sol = await requireParticipant(soldier.id, tour.id);
    expect(sol).toMatchObject({ roles: ['SOLDIER'], playerId: player.id });
    await expectStatus(requireRole(soldier.id, tour.id, 'auction:bid'), 403);

    const pc = await loadTournamentRole(pendingCaptain.id, tour.id);
    expect(pc).toMatchObject({
      roles: [],
      pending: { leaderId: pendingLeader.id, playerId: null },
    });
    await expectStatus(requireParticipant(pendingCaptain.id, tour.id), 404);

    const ps = await loadTournamentRole(pendingSoldier.id, tour.id);
    expect(ps?.pending.playerId).toBe(pendingPlayer.id);
    await expectStatus(requireParticipant(pendingSoldier.id, tour.id), 404);
  });

  it('isolates tenants: organiser A on organiser B’s tournament gets 404', async () => {
    const orgA = await makeUser(t.db, { isOrganiser: true });
    const orgB = await makeUser(t.db, { isOrganiser: true });
    await makeTournament(t.db, { ownerId: orgA.id });
    const tourB = await makeTournament(t.db, { ownerId: orgB.id });

    await expectStatus(requireRole(orgA.id, tourB.id, 'tournament:view'), 404);
    await expectStatus(requireRole(orgA.id, tourB.id, 'settings:edit'), 404);
  });

  it('answers 404 for anonymous users, unknown and malformed ids', async () => {
    const owner = await makeUser(t.db, { isOrganiser: true });
    const tour = await makeTournament(t.db, { ownerId: owner.id });
    await expectStatus(requireParticipant(null, tour.id), 404);
    await expectStatus(requireParticipant(owner.id, '00000000-0000-4000-8000-000000000000'), 404);
    await expectStatus(requireParticipant(owner.id, 'not-a-uuid'), 404);
  });

  it('lets an organiser also be a captain in the same tournament', async () => {
    const owner = await makeUser(t.db, { isOrganiser: true });
    const tour = await makeTournament(t.db, { ownerId: owner.id });
    await makeLeader(t.db, { tournamentId: tour.id, userId: owner.id });
    const access = await requireRole(owner.id, tour.id, 'auction:bid');
    expect(access.roles).toEqual(['OWNER', 'CAPTAIN']);
  });
});
