import { eq } from 'drizzle-orm';
import {
  joinRequests,
  leaders,
  memberships,
  organiserBlocks,
  players,
  tournaments,
} from '@/server/db/schema';
import { AppError } from '@/server/errors';
import { clearPublishedEvents, getPublishedEvents } from '@/server/realtime/publisher';
import { setupTestDb } from '@/test/db';
import { makePlayer, makeTournament, makeUser } from '@/test/factories';
import {
  listNotifications,
  markNotificationsRead,
  unreadCount,
} from '../notifications/notifications';
import { joinWithKey, joinWithKeyInput, previewOrganiserKey } from './organiserKey';
import {
  acceptJoinRequest,
  cancelJoinRequest,
  declineJoinRequest,
  listMyRequests,
  listOutgoingRequests,
  lookupPlayerCard,
  sendJoinRequest,
} from './requests';

const t = setupTestDb();

async function expectStatus(p: Promise<unknown>, status: number): Promise<void> {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.status === status);
}

async function setup(name = 'Ravi Kumar') {
  const owner = await makeUser(t.db, { isOrganiser: true, displayName: name });
  const tour = await makeTournament(t.db, { ownerId: owner.id, name: `${name} Cup` });
  return { owner, tour };
}

describe('organiser key (path B)', () => {
  it('previews by key in any format and joins as PENDING; a second join is 409', async () => {
    const { owner, tour } = await setup();
    const key = owner.organiserKey!;
    const fmt = `${key.slice(0, 3).toLowerCase()}-${key.slice(3).toLowerCase()}`;
    await expect(previewOrganiserKey(fmt, 'ip-k')).resolves.toMatchObject({
      organiserName: 'Ravi Kumar',
      tournamentName: 'Ravi Kumar Cup',
      canJoin: true,
    });
    const me = await makeUser(t.db);
    const res = await joinWithKeyInput(me.id, fmt, 'PLAYER');
    expect(res).toMatchObject({ joined: true, tournamentId: tour.id, kind: 'PLAYER' });
    await expectStatus(joinWithKey(me.id, key, 'LEADER'), 409);
    await expectStatus(previewOrganiserKey('ZZZZZZ', 'ip-k'), 404);
  });

  it('reports no active tournament and closed registration', async () => {
    const lonely = await makeUser(t.db, { isOrganiser: true, displayName: 'Lonely Org' });
    const me = await makeUser(t.db);
    expect(await joinWithKey(me.id, lonely.organiserKey!, 'PLAYER')).toMatchObject({
      joined: false,
      reason: 'NO_ACTIVE_TOURNAMENT',
    });
    const { owner, tour } = await setup('Closed Org');
    await t.db
      .update(tournaments)
      .set({ status: 'AUCTION_LIVE' })
      .where(eq(tournaments.id, tour.id));
    expect(await joinWithKey(me.id, owner.organiserKey!, 'PLAYER')).toMatchObject({
      joined: false,
      reason: 'REGISTRATION_CLOSED',
    });
  });
});

describe('Player ID requests (path C)', () => {
  it('lookup returns the public card only, for organisers running a tournament', async () => {
    const { owner } = await setup();
    const fa = await makeUser(t.db, { displayName: 'Faiz', ign: 'FaizMM', phone: '+911234567890' });
    const card = await lookupPlayerCard(owner.id, `#${fa.playerCode.toLowerCase()}`, 'ip-l');
    expect(card).toEqual({
      playerCode: fa.playerCode,
      displayName: 'Faiz',
      ign: 'FaizMM',
      photoUrl: null,
    });
    expect(card).not.toHaveProperty('username');
    await expectStatus(lookupPlayerCard(owner.id, '#ZZZZZZ', 'ip-l'), 404);
    const player = await makeUser(t.db);
    await expectStatus(lookupPlayerCard(player.id, fa.playerCode, 'ip-l'), 403);
  });

  it('send → live inbox → accept joins approved; organiser is notified', async () => {
    const { owner, tour } = await setup();
    const fa = await makeUser(t.db);
    clearPublishedEvents();
    const sent = await sendJoinRequest(owner.id, tour.id, {
      playerCode: fa.playerCode,
      role: 'LEADER',
      purse: 70,
    });
    const types = getPublishedEvents()
      .filter((e) => e.channel === `u:${fa.id}`)
      .map((e) => e.envelope.type);
    expect(types).toEqual(['notification.new', 'request.received']);
    expect(await unreadCount(fa.id)).toBe(1);

    const inbox = await listMyRequests(fa.id);
    expect(inbox).toEqual([
      expect.objectContaining({
        id: sent.id,
        role: 'LEADER',
        purse: 70,
        organiserName: 'Ravi Kumar',
      }),
    ]);
    await expectStatus(
      sendJoinRequest(owner.id, tour.id, { playerCode: fa.playerCode, role: 'PLAYER' }),
      409,
    );

    const res = await acceptJoinRequest(fa.id, sent.id);
    const [row] = await t.db.select().from(leaders).where(eq(leaders.id, res.recordId));
    expect(row).toMatchObject({
      approval: 'APPROVED',
      purseTotal: 70,
      source: 'PLAYER_ID_REQUEST',
    });
    expect((await listNotifications(owner.id)).items[0]?.type).toBe('request.accepted');
    await expectStatus(acceptJoinRequest(fa.id, sent.id), 409);
    await expectStatus(
      sendJoinRequest(owner.id, tour.id, { playerCode: fa.playerCode, role: 'PLAYER' }),
      409,
    );
  });

  it('accepting after a key sign-up replaces the pending row (never two rows)', async () => {
    const { owner, tour } = await setup();
    const me = await makeUser(t.db);
    await joinWithKey(me.id, owner.organiserKey!, 'LEADER');
    const sent = await sendJoinRequest(owner.id, tour.id, {
      playerCode: me.playerCode,
      role: 'PLAYER',
      basePrice: 2,
    });
    await acceptJoinRequest(me.id, sent.id);
    expect(await t.db.select().from(leaders).where(eq(leaders.userId, me.id))).toHaveLength(0);
    const ps = await t.db.select().from(players).where(eq(players.userId, me.id));
    expect(ps).toEqual([expect.objectContaining({ status: 'POOL', basePrice: 2 })]);
  });

  it('decline & block stops further requests from that organiser', async () => {
    const { owner, tour } = await setup();
    const fa = await makeUser(t.db);
    const sent = await sendJoinRequest(owner.id, tour.id, {
      playerCode: fa.playerCode,
      role: 'PLAYER',
    });
    await declineJoinRequest(fa.id, sent.id, { block: true });
    expect(
      await t.db.select().from(organiserBlocks).where(eq(organiserBlocks.playerUserId, fa.id)),
    ).toHaveLength(1);
    await expectStatus(
      sendJoinRequest(owner.id, tour.id, { playerCode: fa.playerCode, role: 'PLAYER' }),
      409,
    );
    expect((await listOutgoingRequests(owner.id, tour.id))[0]?.status).toBe('DECLINED');
  });

  it('cancel and expiry close the request; expired ones cannot be accepted', async () => {
    const { owner, tour } = await setup();
    const fa = await makeUser(t.db);
    const a = await sendJoinRequest(owner.id, tour.id, {
      playerCode: fa.playerCode,
      role: 'PLAYER',
    });
    await cancelJoinRequest(owner.id, tour.id, a.id);
    await expectStatus(acceptJoinRequest(fa.id, a.id), 409);
    const b = await sendJoinRequest(owner.id, tour.id, {
      playerCode: fa.playerCode,
      role: 'PLAYER',
    });
    await t.db
      .update(joinRequests)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(joinRequests.id, b.id));
    expect(await listMyRequests(fa.id)).toEqual([]);
    const statuses = (await listOutgoingRequests(owner.id, tour.id)).map((r) => r.status).sort();
    expect(statuses).toEqual(['CANCELLED', 'EXPIRED']);
  });

  it('someone else cannot accept or decline my request', async () => {
    const { owner, tour } = await setup();
    const fa = await makeUser(t.db);
    const other = await makeUser(t.db);
    const sent = await sendJoinRequest(owner.id, tour.id, {
      playerCode: fa.playerCode,
      role: 'PLAYER',
    });
    await expectStatus(acceptJoinRequest(other.id, sent.id), 404);
    await expectStatus(declineJoinRequest(other.id, sent.id, {}), 404);
  });

  it('rate-limits requests per organiser per day', async () => {
    const { owner, tour } = await setup();
    // Pre-fill the counter close to the limit instead of sending 50 requests.
    await t.db.execute(
      `insert into rate_limits (key, count, window_start) values ('join-request:organiser:${owner.id}:day', 50, now())`,
    );
    const fa = await makeUser(t.db);
    await expectStatus(
      sendJoinRequest(owner.id, tour.id, { playerCode: fa.playerCode, role: 'PLAYER' }),
      429,
    );
  });

  it('marks notifications read (only mine)', async () => {
    const { owner, tour } = await setup();
    const fa = await makeUser(t.db);
    await sendJoinRequest(owner.id, tour.id, { playerCode: fa.playerCode, role: 'PLAYER' });
    const { items } = await listNotifications(fa.id);
    expect((await markNotificationsRead(owner.id, [items[0]!.id])).unread).toBe(0);
    expect(await unreadCount(fa.id)).toBe(1);
    expect((await markNotificationsRead(fa.id, undefined)).unread).toBe(0);
  });
});

describe('tenant isolation: organiser A on organiser B’s tournament → 404', () => {
  it('404s on every request service', async () => {
    const a = await setup('Org A');
    const b = await setup('Org B');
    const fa = await makeUser(t.db);
    const sent = await sendJoinRequest(b.owner.id, b.tour.id, {
      playerCode: fa.playerCode,
      role: 'PLAYER',
    });
    await expectStatus(
      sendJoinRequest(a.owner.id, b.tour.id, { playerCode: fa.playerCode, role: 'PLAYER' }),
      404,
    );
    await expectStatus(listOutgoingRequests(a.owner.id, b.tour.id), 404);
    await expectStatus(cancelJoinRequest(a.owner.id, b.tour.id, sent.id), 404);
    // B's request id through A's own tournament is not found either.
    await expectStatus(cancelJoinRequest(a.owner.id, a.tour.id, sent.id), 404);
    // A co-admin of A is still an outsider for B.
    const coA = await makeUser(t.db);
    await t.db
      .insert(memberships)
      .values({ tournamentId: a.tour.id, userId: coA.id, role: 'CO_ADMIN' });
    await expectStatus(listOutgoingRequests(coA.id, b.tour.id), 404);
    const pending = await makePlayer(t.db, {
      tournamentId: b.tour.id,
      status: 'PENDING_APPROVAL',
      source: 'ORGANISER_KEY',
    });
    expect(pending.id).toBeTruthy();
  });
});
