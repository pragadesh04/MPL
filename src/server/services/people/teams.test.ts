import { eq } from 'drizzle-orm';
import {
  leaders,
  memberships,
  notifications,
  players,
  teams,
  tournaments,
} from '@/server/db/schema';
import { AppError } from '@/server/errors';
import { setupTestDb } from '@/test/db';
import { makeLeader, makePlayer, makeTeam, makeTournament, makeUser } from '@/test/factories';
import {
  getMyCard,
  getMyTeamSetup,
  getTeamsBoard,
  listTakenColours,
  organiserUpdateTeam,
  sendTeamReminder,
  updateMySnapshot,
  upsertMyTeam,
} from './teams';

const t = setupTestDb();

async function expectError(p: Promise<unknown>, status: number, field?: string): Promise<void> {
  await expect(p).rejects.toSatisfy(
    (e: unknown) =>
      e instanceof AppError &&
      e.status === status &&
      (!field || Object.hasOwn((e.details?.issues as object | undefined) ?? {}, field)),
  );
}

async function setup() {
  const owner = await makeUser(t.db, { isOrganiser: true });
  const tour = await makeTournament(t.db, { ownerId: owner.id, name: 'Teams Cup' });
  const capUser = await makeUser(t.db);
  const leader = await makeLeader(t.db, {
    tournamentId: tour.id,
    userId: capUser.id,
    inviteStatus: 'ACCOUNT_LINKED',
  });
  return { owner, tour, capUser, leader };
}

const team = {
  name: 'Red Rhinos',
  shortName: 'rrh',
  color: '#E63946',
  emoji: '🦏',
  motto: 'Charge!',
};

describe('captain team setup (§7.4)', () => {
  it('creates then updates my team and marks me TEAM_READY', async () => {
    const { tour, capUser, leader } = await setup();
    const { teamId } = await upsertMyTeam(capUser.id, tour.id, team);
    const [row] = await t.db.select().from(teams).where(eq(teams.id, teamId));
    expect(row).toMatchObject({
      name: 'Red Rhinos',
      shortName: 'RRH',
      color: '#e63946',
      leaderId: leader.id,
    });
    const [l] = await t.db.select().from(leaders).where(eq(leaders.id, leader.id));
    expect(l?.inviteStatus).toBe('TEAM_READY');
    await upsertMyTeam(capUser.id, tour.id, { ...team, motto: 'Never retreat' });
    expect(await t.db.select().from(teams).where(eq(teams.leaderId, leader.id))).toHaveLength(1);
    const view = await getMyTeamSetup(capUser.id, tour.id);
    expect(view.team?.motto).toBe('Never retreat');
  });

  it('maps name / colour / short code clashes to field-level 409s', async () => {
    const { tour, capUser } = await setup();
    const other = await makeLeader(t.db, { tournamentId: tour.id });
    await makeTeam(t.db, {
      tournamentId: tour.id,
      leaderId: other.id,
      name: 'Blue Hawks',
      shortName: 'BHK',
      color: '#4361ee',
    });
    await expectError(
      upsertMyTeam(capUser.id, tour.id, { ...team, name: 'blue hawks' }),
      409,
      'name',
    );
    await expectError(
      upsertMyTeam(capUser.id, tour.id, { ...team, color: '#4361EE' }),
      409,
      'color',
    );
    await expectError(
      upsertMyTeam(capUser.id, tour.id, { ...team, shortName: 'bhk' }),
      409,
      'shortName',
    );
    expect((await listTakenColours(capUser.id, tour.id)).map((x) => x.color)).toEqual(['#4361ee']);
  });

  it('is captain-only and locked after Start', async () => {
    const { tour, owner, capUser } = await setup();
    const soldier = await makeUser(t.db);
    await makePlayer(t.db, { tournamentId: tour.id, userId: soldier.id });
    await expectError(upsertMyTeam(soldier.id, tour.id, team), 403);
    await expectError(listTakenColours(soldier.id, tour.id), 404);
    await expectError(upsertMyTeam(owner.id, tour.id, team), 403);
    await t.db
      .update(tournaments)
      .set({ status: 'AUCTION_LIVE' })
      .where(eq(tournaments.id, tour.id));
    await expectError(upsertMyTeam(capUser.id, tour.id, team), 409);
  });
});

describe('Teams tracker (§7.2 step 4)', () => {
  it('lists approved captains, lets organisers fix a team, and sends reminders', async () => {
    const { owner, tour, capUser, leader } = await setup();
    const unclaimed = await makeLeader(t.db, { tournamentId: tour.id, name: 'Not Yet' });
    await makeLeader(t.db, { tournamentId: tour.id, approval: 'PENDING', source: 'ORGANISER_KEY' });
    let board = await getTeamsBoard(owner.id, tour.id);
    expect(board.map((b) => b.leaderId)).toEqual([leader.id, unclaimed.id]);

    await organiserUpdateTeam(owner.id, tour.id, unclaimed.id, {
      ...team,
      name: 'Org Made',
      shortName: 'ORG',
    });
    board = await getTeamsBoard(owner.id, tour.id);
    expect(board.find((b) => b.leaderId === unclaimed.id)?.team?.name).toBe('Org Made');

    const res = await sendTeamReminder(owner.id, tour.id);
    // capUser has no team; "Not Yet" has a team but no account → both still to finish.
    expect(res.captains.map((c) => c.name).sort()).toEqual([leader.name, 'Not Yet'].sort());
    expect(res.captains.every((c) => c.link.includes('/i/'))).toBe(true);
    const [n] = await t.db.select().from(notifications).where(eq(notifications.userId, capUser.id));
    expect(n?.type).toBe('team.reminder');
  });

  it('auctioneers see the board but cannot edit teams', async () => {
    const { owner, tour, leader } = await setup();
    const auc = await makeUser(t.db);
    await t.db
      .insert(memberships)
      .values({ tournamentId: tour.id, userId: auc.id, role: 'AUCTIONEER' });
    await expect(getTeamsBoard(auc.id, tour.id)).resolves.toHaveLength(1);
    await expectError(organiserUpdateTeam(auc.id, tour.id, leader.id, team), 403);
    void owner;
  });
});

describe('my card (§7.5)', () => {
  it('shows a pending soldier their own card and lets them edit the snapshot', async () => {
    const { tour } = await setup();
    const me = await makeUser(t.db);
    const row = await makePlayer(t.db, {
      tournamentId: tour.id,
      userId: me.id,
      status: 'PENDING_APPROVAL',
      source: 'ORGANISER_KEY',
      name: 'Old',
    });
    const card = await getMyCard(me.id, tour.id);
    expect(card).toMatchObject({ kind: 'PLAYER', pending: true, name: 'Old' });
    await updateMySnapshot(me.id, tour.id, { name: 'New Name', ign: 'NewIGN' });
    const [p] = await t.db.select().from(players).where(eq(players.id, row.id));
    expect(p).toMatchObject({ name: 'New Name', ign: 'NewIGN' });
  });

  it('404s for people with no captain / soldier row', async () => {
    const { owner, tour } = await setup();
    await expectError(getMyCard(owner.id, tour.id), 404);
    await expectError(updateMySnapshot(owner.id, tour.id, { name: 'Owner Name' }), 404);
  });
});

describe('tenant isolation: organiser A on organiser B’s tournament → 404', () => {
  it('404s on every team service', async () => {
    const a = await setup();
    const b = await setup();
    await expectError(getTeamsBoard(a.owner.id, b.tour.id), 404);
    await expectError(organiserUpdateTeam(a.owner.id, b.tour.id, b.leader.id, team), 404);
    await expectError(sendTeamReminder(a.owner.id, b.tour.id), 404);
    await expectError(listTakenColours(a.owner.id, b.tour.id), 404);
    await expectError(getMyTeamSetup(a.capUser.id, b.tour.id), 404);
    await expectError(upsertMyTeam(a.capUser.id, b.tour.id, team), 404);
    await expectError(getMyCard(a.capUser.id, b.tour.id), 404);
    await expectError(updateMySnapshot(a.capUser.id, b.tour.id, { name: 'Spy' }), 404);
    // B's leader through A's own tournament.
    await expectError(organiserUpdateTeam(a.owner.id, a.tour.id, b.leader.id, team), 404);
  });
});
