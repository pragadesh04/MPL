import {
  auctionChannel,
  parseChannel,
  presenceChannel,
  updatesChannel,
  userChannel,
} from '@/lib/realtime/channels';
import { parseEnvelope } from '@/lib/schemas/realtime';
import { withTransaction } from '@/server/db/client';
import { memberships } from '@/server/db/schema';
import { setupTestDb } from '@/test/db';
import { makeLeader, makePlayer, makeTournament, makeUser } from '@/test/factories';
import { buildLiveScreenCapability, buildUserCapability } from './capability';
import {
  clearPublishedEvents,
  getPublishedEvents,
  publishAuction,
  publishInbox,
} from './publisher';
import { listUserTournamentAccess } from './token';

const t = setupTestDb();
const T1 = '11111111-1111-4111-8111-111111111111';
const U1 = '22222222-2222-4222-8222-222222222222';

describe('channels', () => {
  it('builds and parses channel names', () => {
    expect(auctionChannel(T1)).toBe(`t:${T1}:auction`);
    expect(parseChannel(updatesChannel(T1))).toEqual({ kind: 'updates', id: T1 });
    expect(parseChannel(presenceChannel(T1))).toEqual({ kind: 'presence', id: T1 });
    expect(parseChannel(userChannel(U1))).toEqual({ kind: 'user', id: U1 });
    expect(parseChannel('other')).toBeNull();
  });
});

describe('capabilities (subscribe-only)', () => {
  it('grants presence only to captains and organisers, never publish', () => {
    const cap = buildUserCapability(U1, [
      { tournamentId: T1, roles: ['SOLDIER'] },
      { tournamentId: U1, roles: ['CAPTAIN'] },
      { tournamentId: 'none', roles: [] },
    ]);
    expect(cap[userChannel(U1)]).toEqual(['subscribe']);
    expect(cap[presenceChannel(T1)]).toEqual(['subscribe']);
    expect(cap[presenceChannel(U1)]).toEqual(['subscribe', 'presence']);
    expect(Object.keys(cap).some((k) => k.includes('none'))).toBe(false);
    expect(Object.values(cap).flat()).not.toContain('publish');
    expect(Object.keys(buildLiveScreenCapability(T1))).toHaveLength(3);
  });
});

describe('publisher', () => {
  beforeEach(() => clearPublishedEvents());

  it('records valid envelopes in tests', async () => {
    const now = new Date('2026-11-21T10:00:00.000Z');
    await publishAuction(T1, 7, now, 'control.changed', { controllerUserId: U1 });
    await publishInbox(U1, null, now, 'request.received', { requestId: T1 });
    const events = getPublishedEvents();
    expect(events.map((e) => e.channel)).toEqual([auctionChannel(T1), userChannel(U1)]);
    expect(events[0]?.envelope).toEqual({
      type: 'control.changed',
      tournamentId: T1,
      version: 7,
      serverNow: '2026-11-21T10:00:00.000Z',
      data: { controllerUserId: U1 },
    });
    expect(parseEnvelope(events[0]?.envelope)).not.toBeNull();
    expect(parseEnvelope({ ...events[0]?.envelope, type: 'nope' })).toBeNull();
  });

  it('runs onCommit callbacks only after a successful commit', async () => {
    await withTransaction(async (_tx, onCommit) => {
      onCommit(() => publishInbox(U1, null, new Date(), 'request.cancelled', { requestId: T1 }));
    });
    expect(getPublishedEvents()).toHaveLength(1);

    await expect(
      withTransaction(async (_tx, onCommit) => {
        onCommit(() => publishInbox(U1, null, new Date(), 'request.cancelled', { requestId: T1 }));
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect(getPublishedEvents()).toHaveLength(1);
  });
});

describe('listUserTournamentAccess', () => {
  it('lists only approved roles in active tournaments', async () => {
    const owner = await makeUser(t.db, { isOrganiser: true });
    const other = await makeUser(t.db, { isOrganiser: true });
    const user = await makeUser(t.db);
    const mine = await makeTournament(t.db, { ownerId: owner.id });
    const theirs = await makeTournament(t.db, { ownerId: other.id });
    const done = await makeTournament(t.db, { ownerId: other.id, status: 'COMPLETED' });

    await t.db
      .insert(memberships)
      .values({ tournamentId: mine.id, userId: user.id, role: 'AUCTIONEER' });
    await makePlayer(t.db, { tournamentId: theirs.id, userId: user.id });
    await makeLeader(t.db, { tournamentId: done.id, userId: user.id });
    // A pending captain row is not a role.
    await makeLeader(t.db, { tournamentId: mine.id, userId: owner.id, approval: 'PENDING' });

    const access = await listUserTournamentAccess(user.id, t.db);
    expect(access).toEqual(
      expect.arrayContaining([
        { tournamentId: mine.id, roles: ['AUCTIONEER'] },
        { tournamentId: theirs.id, roles: ['SOLDIER'] },
      ]),
    );
    expect(access).toHaveLength(2);
    expect(await listUserTournamentAccess(owner.id, t.db)).toEqual([
      { tournamentId: mine.id, roles: ['OWNER'] },
    ]);
  });
});
