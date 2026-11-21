import { and, eq } from 'drizzle-orm';
import { memberships, organiserInvites, tournaments } from '@/server/db/schema';
import { AppError } from '@/server/errors';
import { setupTestDb } from '@/test/db';
import { makeTournament, makeUser } from '@/test/factories';
import { requireRole } from '../roles';
import {
  acceptOrganiserInvite,
  changeMemberRole,
  createOrganiserInvite,
  getOrganiserInvitePreview,
  listMembers,
  listMyOrganiserInvites,
  removeMember,
  revokeOrganiserInvite,
  transferOwnership,
} from './organisers';

const t = setupTestDb();

async function expectStatus(p: Promise<unknown>, status: number): Promise<void> {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.status === status);
}

const tokenOf = (link: string): string => link.split('/').at(-1)!;

async function setup() {
  const owner = await makeUser(t.db, { isOrganiser: true });
  const tour = await makeTournament(t.db, { ownerId: owner.id, name: 'Org Cup' });
  return { owner, tour };
}

describe('organiser invites (PLAN §2.4)', () => {
  it('owner invites by username; the invitee previews and accepts once', async () => {
    const { owner, tour } = await setup();
    const sanjay = await makeUser(t.db);
    const invite = await createOrganiserInvite(owner.id, tour.id, {
      emailOrUsername: sanjay.username.toUpperCase(),
      role: 'CO_ADMIN',
    });
    const token = tokenOf(invite.link);
    expect(invite.link).toContain('/organiser-invite/');
    const [stored] = await t.db
      .select()
      .from(organiserInvites)
      .where(eq(organiserInvites.id, invite.id));
    expect(stored?.tokenHash).not.toBe(token);

    await expect(getOrganiserInvitePreview(token, 'ip')).resolves.toMatchObject({
      tournamentName: 'Org Cup',
      role: 'CO_ADMIN',
    });
    await acceptOrganiserInvite(sanjay.id, { token });
    expect((await requireRole(sanjay.id, tour.id, 'settings:edit')).roles).toEqual(['CO_ADMIN']);
    await expectStatus(acceptOrganiserInvite(sanjay.id, { token }), 404);
    await expectStatus(getOrganiserInvitePreview(token, 'ip'), 404);
  });

  it('refuses an invite for a different account (403) and hides it from banner accepts (404)', async () => {
    const { owner, tour } = await setup();
    const intended = await makeUser(t.db);
    const stranger = await makeUser(t.db);
    const invite = await createOrganiserInvite(owner.id, tour.id, {
      emailOrUsername: intended.username,
      role: 'AUCTIONEER',
    });
    await expectStatus(acceptOrganiserInvite(stranger.id, { token: tokenOf(invite.link) }), 403);
    await expectStatus(acceptOrganiserInvite(stranger.id, { inviteId: invite.id }), 404);
    expect(await listMyOrganiserInvites(stranger.id)).toEqual([]);
    const mine = await listMyOrganiserInvites(intended.id);
    expect(mine).toEqual([expect.objectContaining({ id: invite.id, role: 'AUCTIONEER' })]);
    await acceptOrganiserInvite(intended.id, { inviteId: invite.id });
    expect(await listMyOrganiserInvites(intended.id)).toEqual([]);
  });

  it('matches organiser invites by email too', async () => {
    const { owner, tour } = await setup();
    const org = await makeUser(t.db, { isOrganiser: true, email: 'helper@example.test' });
    const invite = await createOrganiserInvite(owner.id, tour.id, {
      emailOrUsername: 'Helper@Example.test',
      role: 'CO_ADMIN',
    });
    await acceptOrganiserInvite(org.id, { token: tokenOf(invite.link) });
    expect((await listMembers(owner.id, tour.id)).members.map((m) => m.userId)).toContain(org.id);
  });

  it('revoked and expired links stop working; only the owner manages invites', async () => {
    const { owner, tour } = await setup();
    const coAdmin = await makeUser(t.db);
    await t.db
      .insert(memberships)
      .values({ tournamentId: tour.id, userId: coAdmin.id, role: 'CO_ADMIN' });
    const target = await makeUser(t.db);
    await expectStatus(
      createOrganiserInvite(coAdmin.id, tour.id, {
        emailOrUsername: target.username,
        role: 'CO_ADMIN',
      }),
      403,
    );
    const a = await createOrganiserInvite(owner.id, tour.id, {
      emailOrUsername: target.username,
      role: 'CO_ADMIN',
    });
    await expectStatus(revokeOrganiserInvite(coAdmin.id, a.id), 403);
    await revokeOrganiserInvite(owner.id, a.id);
    await expectStatus(acceptOrganiserInvite(target.id, { token: tokenOf(a.link) }), 404);

    const b = await createOrganiserInvite(owner.id, tour.id, {
      emailOrUsername: target.username,
      role: 'CO_ADMIN',
    });
    await t.db
      .update(organiserInvites)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(organiserInvites.id, b.id));
    await expectStatus(acceptOrganiserInvite(target.id, { token: tokenOf(b.link) }), 404);
    expect((await listMembers(owner.id, tour.id)).invites).toEqual([]);
  });

  it('refuses inviting someone who is already an organiser', async () => {
    const { owner, tour } = await setup();
    await expectStatus(
      createOrganiserInvite(owner.id, tour.id, {
        emailOrUsername: owner.username,
        role: 'CO_ADMIN',
      }),
      409,
    );
  });
});

describe('members and ownership', () => {
  it('owner changes roles and removes members but never the owner row', async () => {
    const { owner, tour } = await setup();
    const m = await makeUser(t.db);
    await t.db
      .insert(memberships)
      .values({ tournamentId: tour.id, userId: m.id, role: 'CO_ADMIN' });
    await changeMemberRole(owner.id, tour.id, m.id, { role: 'AUCTIONEER' });
    const [row] = await t.db
      .select()
      .from(memberships)
      .where(and(eq(memberships.tournamentId, tour.id), eq(memberships.userId, m.id)));
    expect(row?.role).toBe('AUCTIONEER');
    await expectStatus(changeMemberRole(owner.id, tour.id, owner.id, { role: 'CO_ADMIN' }), 400);
    await expectStatus(removeMember(owner.id, tour.id, owner.id), 400);
    await expectStatus(changeMemberRole(m.id, tour.id, owner.id, { role: 'CO_ADMIN' }), 403);
    await removeMember(owner.id, tour.id, m.id);
    await expectStatus(requireRole(m.id, tour.id, 'tournament:view'), 404);
  });

  it('transfers ownership to a co-admin organiser; old owner becomes co-admin', async () => {
    const { owner, tour } = await setup();
    const next = await makeUser(t.db, { isOrganiser: true });
    const auctioneer = await makeUser(t.db, { isOrganiser: true });
    await t.db.insert(memberships).values([
      { tournamentId: tour.id, userId: next.id, role: 'CO_ADMIN' },
      { tournamentId: tour.id, userId: auctioneer.id, role: 'AUCTIONEER' },
    ]);
    await expectStatus(
      transferOwnership(owner.id, tour.id, { toUserId: auctioneer.id, confirmName: 'Org Cup' }),
      400,
    );
    await expectStatus(
      transferOwnership(owner.id, tour.id, { toUserId: next.id, confirmName: 'wrong' }),
      400,
    );
    await transferOwnership(owner.id, tour.id, { toUserId: next.id, confirmName: 'org cup' });
    const [row] = await t.db.select().from(tournaments).where(eq(tournaments.id, tour.id));
    expect(row?.ownerId).toBe(next.id);
    expect((await requireRole(owner.id, tour.id, 'settings:edit')).roles).toEqual(['CO_ADMIN']);
    expect((await requireRole(next.id, tour.id, 'tournament:transfer')).roles).toEqual(['OWNER']);
  });

  it('refuses a transfer to a co-admin who already owns an active tournament (409)', async () => {
    const { owner, tour } = await setup();
    const busy = await makeUser(t.db, { isOrganiser: true });
    await makeTournament(t.db, { ownerId: busy.id });
    await t.db
      .insert(memberships)
      .values({ tournamentId: tour.id, userId: busy.id, role: 'CO_ADMIN' });
    await expectStatus(
      transferOwnership(owner.id, tour.id, { toUserId: busy.id, confirmName: 'Org Cup' }),
      409,
    );
    const [row] = await t.db.select().from(tournaments).where(eq(tournaments.id, tour.id));
    expect(row?.ownerId).toBe(owner.id);
  });
});

describe('tenant isolation: organiser A on organiser B’s tournament → 404', () => {
  it('404s on every organiser-team service', async () => {
    const a = await setup();
    const b = await setup();
    const x = await makeUser(t.db);
    await t.db
      .insert(memberships)
      .values({ tournamentId: b.tour.id, userId: x.id, role: 'CO_ADMIN' });
    const invite = await createOrganiserInvite(b.owner.id, b.tour.id, {
      emailOrUsername: 'someone_new',
      role: 'CO_ADMIN',
    });
    await expectStatus(listMembers(a.owner.id, b.tour.id), 404);
    await expectStatus(
      createOrganiserInvite(a.owner.id, b.tour.id, { emailOrUsername: 'zz_top', role: 'CO_ADMIN' }),
      404,
    );
    await expectStatus(revokeOrganiserInvite(a.owner.id, invite.id), 404);
    await expectStatus(changeMemberRole(a.owner.id, b.tour.id, x.id, { role: 'AUCTIONEER' }), 404);
    await expectStatus(removeMember(a.owner.id, b.tour.id, x.id), 404);
    await expectStatus(
      transferOwnership(a.owner.id, b.tour.id, { toUserId: x.id, confirmName: 'Org Cup' }),
      404,
    );
  });
});
