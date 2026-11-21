import { eq } from 'drizzle-orm';
import { DEFAULT_SETTINGS } from '@/lib/schemas/settings';
import { auditLog, leaders, memberships, players, tournaments } from '@/server/db/schema';
import { AppError } from '@/server/errors';
import { setupTestDb } from '@/test/db';
import { makeLeader, makePlayer, makeTeam, makeTournament, makeUser } from '@/test/factories';
import { requireRole } from '../roles';
import { claimInvite, previewInvite } from '../joining/personalLink';
import { decodeInviteToken, encodeInviteToken } from './links';
import {
  addPerson,
  getPersonLink,
  importPeople,
  listRoster,
  regeneratePersonLink,
  removePerson,
  unlinkPerson,
  updateLeader,
  updatePlayer,
} from './people';

const t = setupTestDb();

async function expectStatus(p: Promise<unknown>, status: number): Promise<void> {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.status === status);
}
const tokenOf = (link: string): string => link.split('/i/')[1]!;

async function setup() {
  const owner = await makeUser(t.db, { isOrganiser: true, displayName: 'Ravi Kumar' });
  const tour = await makeTournament(t.db, { ownerId: owner.id, name: 'Path A Cup' });
  return { owner, tour };
}

describe('personal link tokens (PLAN §2.2)', () => {
  it('round-trips and rejects tampered or invented tokens', () => {
    const p = {
      k: 'L' as const,
      id: '6f1c2b8e-1111-4222-8333-444455556666',
      tid: '6f1c2b8e-1111-4222-8333-444455557777',
      v: 1,
    };
    const token = encodeInviteToken(p);
    expect(decodeInviteToken(token)).toEqual(p);
    expect(decodeInviteToken(`${token.slice(0, -3)}abc`)).toBeNull();
    expect(decodeInviteToken('invented-token')).toBeNull();
  });
});

describe('add person, links and claim (path A)', () => {
  it('adds an approved captain with the default purse and a working personal link', async () => {
    const { owner, tour } = await setup();
    const added = await addPerson(owner.id, tour.id, { type: 'LEADER', name: 'Arjun Rhino' });
    const [row] = await t.db.select().from(leaders).where(eq(leaders.id, added.id));
    expect(row).toMatchObject({
      approval: 'APPROVED',
      source: 'ADDED_BY_ORGANISER',
      purseTotal: DEFAULT_SETTINGS.defaultPurse,
      inviteStatus: 'NOT_OPENED',
    });

    const preview = await previewInvite(tokenOf(added.link), 'ip', null);
    expect(preview).toMatchObject({
      kind: 'LEADER',
      tournamentName: 'Path A Cup',
      organiserName: 'Ravi Kumar',
      claimed: false,
      spot: { name: 'Arjun Rhino', purse: 50 },
    });
    const [opened] = await t.db.select().from(leaders).where(eq(leaders.id, added.id));
    expect(opened?.inviteStatus).toBe('OPENED');

    const me = await makeUser(t.db, { ign: 'ArjunMM' });
    await claimInvite(me.id, tokenOf(added.link));
    const [claimed] = await t.db.select().from(leaders).where(eq(leaders.id, added.id));
    expect(claimed).toMatchObject({
      userId: me.id,
      inviteStatus: 'ACCOUNT_LINKED',
      ign: 'ArjunMM',
    });
    expect((await requireRole(me.id, tour.id, 'team:edit-own')).roles).toEqual(['CAPTAIN']);
    // Claiming again is a no-op for the same user, 409 for anyone else.
    await expect(claimInvite(me.id, tokenOf(added.link))).resolves.toBeTruthy();
    const other = await makeUser(t.db);
    await expectStatus(claimInvite(other.id, tokenOf(added.link)), 409);
    expect((await previewInvite(tokenOf(added.link), 'ip', other.id)).claimedByMe).toBe(false);
  });

  it('rejects a soldier base price below the minimum', async () => {
    const { owner, tour } = await setup();
    await expectStatus(
      addPerson(owner.id, tour.id, { type: 'PLAYER', name: 'Cheap Soldier', basePrice: 0 }),
      400,
    );
  });

  it('never lets one account be captain and soldier in the same tournament', async () => {
    const { owner, tour } = await setup();
    const cap = await addPerson(owner.id, tour.id, { type: 'LEADER', name: 'Cap One' });
    const sol = await addPerson(owner.id, tour.id, { type: 'PLAYER', name: 'Sol One' });
    const me = await makeUser(t.db);
    await claimInvite(me.id, tokenOf(cap.link));
    await expectStatus(claimInvite(me.id, tokenOf(sol.link)), 409);
  });

  it('regenerate kills the old link; unlink frees the spot and is audited', async () => {
    const { owner, tour } = await setup();
    const sol = await addPerson(owner.id, tour.id, { type: 'PLAYER', name: 'Sol Two' });
    const { link } = await regeneratePersonLink(owner.id, tour.id, 'PLAYER', sol.id);
    await expectStatus(previewInvite(tokenOf(sol.link), 'ip', null), 404);
    const me = await makeUser(t.db);
    await claimInvite(me.id, tokenOf(link));
    await unlinkPerson(owner.id, tour.id, 'PLAYER', sol.id);
    const [row] = await t.db.select().from(players).where(eq(players.id, sol.id));
    expect(row).toMatchObject({ userId: null, inviteStatus: 'NOT_OPENED' });
    await expectStatus(previewInvite(tokenOf(link), 'ip', null), 404);
    const logs = await t.db.select().from(auditLog).where(eq(auditLog.tournamentId, tour.id));
    expect(logs.map((l) => l.action)).toContain('people.unlinked');
    const fresh = await getPersonLink(owner.id, tour.id, 'PLAYER', sol.id);
    expect(fresh.claimed).toBe(false);
  });

  it('marks a captain with a team TEAM_READY on claim', async () => {
    const { owner, tour } = await setup();
    const cap = await addPerson(owner.id, tour.id, { type: 'LEADER', name: 'Teamy' });
    await makeTeam(t.db, { tournamentId: tour.id, leaderId: cap.id });
    const me = await makeUser(t.db);
    await claimInvite(me.id, tokenOf(cap.link));
    const [row] = await t.db.select().from(leaders).where(eq(leaders.id, cap.id));
    expect(row?.inviteStatus).toBe('TEAM_READY');
  });

  it('refuses links of finished tournaments and of deleted rows', async () => {
    const { owner, tour } = await setup();
    const a = await addPerson(owner.id, tour.id, { type: 'PLAYER', name: 'Gone Soon' });
    const b = await addPerson(owner.id, tour.id, { type: 'PLAYER', name: 'Done Soon' });
    await removePerson(owner.id, tour.id, 'PLAYER', a.id);
    await expectStatus(previewInvite(tokenOf(a.link), 'ip', null), 404);
    await t.db.update(tournaments).set({ status: 'COMPLETED' }).where(eq(tournaments.id, tour.id));
    await expectStatus(previewInvite(tokenOf(b.link), 'ip', null), 404);
    await expectStatus(claimInvite((await makeUser(t.db)).id, tokenOf(b.link)), 404);
  });

  it('imports CSV rows all-or-nothing', async () => {
    const { owner, tour } = await setup();
    const added = await importPeople(owner.id, tour.id, {
      rows: [
        { type: 'LEADER', name: 'Imp Cap', purse: 60 },
        { type: 'PLAYER', name: 'Imp Sol', basePrice: 3, ign: 'ImpS' },
      ],
    });
    expect(added).toHaveLength(2);
    await expectStatus(
      importPeople(owner.id, tour.id, {
        rows: [
          { type: 'PLAYER', name: 'Fine One', basePrice: 2 },
          { type: 'PLAYER', name: 'Bad One', basePrice: 0 },
        ],
      }),
      400,
    );
    const roster = await listRoster(owner.id, tour.id);
    expect(roster.soldiers.map((s) => s.name)).toEqual(['Imp Sol']);
  });

  it('edits and flags duplicates by IGN across both tabs', async () => {
    const { owner, tour } = await setup();
    const cap = await makeLeader(t.db, { tournamentId: tour.id, ign: 'Same' });
    const sol = await makePlayer(t.db, { tournamentId: tour.id, ign: 'same' });
    await updateLeader(owner.id, tour.id, cap.id, { name: 'New Cap', purse: 70, ign: 'Same' });
    await updatePlayer(owner.id, tour.id, sol.id, { name: 'New Sol', basePrice: 4, ign: 'same' });
    const roster = await listRoster(owner.id, tour.id);
    expect(roster.captains[0]).toMatchObject({ name: 'New Cap', purseTotal: 70, duplicate: true });
    expect(roster.soldiers[0]).toMatchObject({ basePrice: 4, duplicate: true });
    // Clearing the captain's IGN removes the clash.
    await updateLeader(owner.id, tour.id, cap.id, { name: 'New Cap', purse: 70 });
    expect((await listRoster(owner.id, tour.id)).soldiers[0]?.duplicate).toBe(false);
  });

  it('locks editing after Start; auctioneers can view but not manage', async () => {
    const { owner, tour } = await setup();
    const auctioneer = await makeUser(t.db);
    await t.db
      .insert(memberships)
      .values({ tournamentId: tour.id, userId: auctioneer.id, role: 'AUCTIONEER' });
    await expect(listRoster(auctioneer.id, tour.id)).resolves.toBeTruthy();
    await expectStatus(
      addPerson(auctioneer.id, tour.id, { type: 'PLAYER', name: 'Nope Sol' }),
      403,
    );
    await t.db
      .update(tournaments)
      .set({ status: 'AUCTION_LIVE' })
      .where(eq(tournaments.id, tour.id));
    await expectStatus(addPerson(owner.id, tour.id, { type: 'PLAYER', name: 'Late Sol' }), 409);
  });
});

describe('tenant isolation: organiser A on organiser B’s tournament → 404', () => {
  it('404s on every people service', async () => {
    const a = await setup();
    const b = await setup();
    const cap = await makeLeader(t.db, { tournamentId: b.tour.id });
    const sol = await makePlayer(t.db, {
      tournamentId: b.tour.id,
      userId: (await makeUser(t.db)).id,
    });
    const A = a.owner.id;
    await expectStatus(addPerson(A, b.tour.id, { type: 'PLAYER', name: 'Spy Sol' }), 404);
    await expectStatus(
      importPeople(A, b.tour.id, { rows: [{ type: 'PLAYER', name: 'Spy Sol' }] }),
      404,
    );
    await expectStatus(listRoster(A, b.tour.id), 404);
    await expectStatus(getPersonLink(A, b.tour.id, 'LEADER', cap.id), 404);
    await expectStatus(regeneratePersonLink(A, b.tour.id, 'LEADER', cap.id), 404);
    await expectStatus(unlinkPerson(A, b.tour.id, 'PLAYER', sol.id), 404);
    await expectStatus(updateLeader(A, b.tour.id, cap.id, { name: 'Hacked', purse: 1 }), 404);
    await expectStatus(updatePlayer(A, b.tour.id, sol.id, { name: 'Hacked', basePrice: 1 }), 404);
    await expectStatus(removePerson(A, b.tour.id, 'LEADER', cap.id), 404);
    // A row id from B used through A's own tournament is also "not found".
    await expectStatus(getPersonLink(A, a.tour.id, 'LEADER', cap.id), 404);
  });
});
