import { eq } from 'drizzle-orm';
import { hashPassword } from '@/server/auth/password';
import { auditLog, memberships, passwordResets } from '@/server/db/schema';
import { AppError } from '@/server/errors';
import { setupTestDb } from '@/test/db';
import { makeLeader, makePlayer, makeTournament, makeUser } from '@/test/factories';
import { login } from '../accounts/accounts';
import { consumeReset, getResetPreview, issueParticipantReset } from './passwords';
import { createResetToken, hashResetToken } from './reset-core';

const t = setupTestDb();

async function expectStatus(p: Promise<unknown>, status: number): Promise<void> {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.status === status);
}
const tokenOf = (link: string): string => link.split('/reset/')[1]!;

async function setup() {
  const owner = await makeUser(t.db, { isOrganiser: true });
  const tour = await makeTournament(t.db, { ownerId: owner.id });
  const soldier = await makeUser(t.db, { passwordHash: await hashPassword('password123') });
  await makePlayer(t.db, { tournamentId: tour.id, userId: soldier.id });
  return { owner, tour, soldier };
}

describe('organiser-issued resets (PLAN §2.5)', () => {
  it('issues a one-time link that sets a new password exactly once (audited)', async () => {
    const { owner, tour, soldier } = await setup();
    const { link } = await issueParticipantReset(owner.id, tour.id, soldier.id);
    const token = tokenOf(link);
    expect(await getResetPreview(token, 'ip')).toMatchObject({ username: soldier.username });
    await consumeReset(token, { password: 'brand-new-pass' }, 'ip');
    await expect(
      login({ username: soldier.username, password: 'brand-new-pass' }, 'ip-r'),
    ).resolves.toBeTruthy();
    await expectStatus(consumeReset(token, { password: 'another-pass' }, 'ip'), 404);
    await expectStatus(getResetPreview(token, 'ip'), 404);
    const logs = await t.db.select().from(auditLog).where(eq(auditLog.tournamentId, tour.id));
    expect(logs.map((l) => l.action)).toContain('password.reset_issued');
    const [stored] = await t.db
      .select()
      .from(passwordResets)
      .where(eq(passwordResets.userId, soldier.id));
    expect(stored?.tokenHash).not.toBe(token);
  });

  it('refuses expired links and kills older links once one is used', async () => {
    const { owner, tour, soldier } = await setup();
    const a = await issueParticipantReset(owner.id, tour.id, soldier.id);
    const b = await issueParticipantReset(owner.id, tour.id, soldier.id);
    await consumeReset(tokenOf(b.link), { password: 'brand-new-pass' }, 'ip');
    await expectStatus(consumeReset(tokenOf(a.link), { password: 'x-new-pass-x' }, 'ip'), 404);

    const { token } = await createResetToken(t.db, soldier.id, owner.id);
    await t.db
      .update(passwordResets)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(passwordResets.tokenHash, hashResetToken(token)));
    await expectStatus(consumeReset(token, { password: 'too-late-pass' }, 'ip'), 404);
  });

  it('never resets organisers: a co-admin cannot reset the owner, even if the owner plays', async () => {
    const { owner, tour } = await setup();
    const coAdmin = await makeUser(t.db);
    await t.db
      .insert(memberships)
      .values({ tournamentId: tour.id, userId: coAdmin.id, role: 'CO_ADMIN' });
    await makeLeader(t.db, { tournamentId: tour.id, userId: owner.id });
    await expectStatus(issueParticipantReset(coAdmin.id, tour.id, owner.id), 403);
    await expectStatus(issueParticipantReset(owner.id, tour.id, owner.id), 400);
  });

  it('only for participants of this tournament; auctioneers cannot issue', async () => {
    const { owner, tour, soldier } = await setup();
    const stranger = await makeUser(t.db);
    await expectStatus(issueParticipantReset(owner.id, tour.id, stranger.id), 404);
    const auc = await makeUser(t.db);
    await t.db
      .insert(memberships)
      .values({ tournamentId: tour.id, userId: auc.id, role: 'AUCTIONEER' });
    await expectStatus(issueParticipantReset(auc.id, tour.id, soldier.id), 403);
  });
});

describe('tenant isolation: organiser A on organiser B’s tournament → 404', () => {
  it('404s when resetting B’s participants', async () => {
    const a = await setup();
    const b = await setup();
    await expectStatus(issueParticipantReset(a.owner.id, b.tour.id, b.soldier.id), 404);
    // B's soldier through A's own tournament: not a participant there.
    await expectStatus(issueParticipantReset(a.owner.id, a.tour.id, b.soldier.id), 404);
  });
});
