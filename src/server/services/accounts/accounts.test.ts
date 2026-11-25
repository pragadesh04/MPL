import { eq } from 'drizzle-orm';
import { leaders, players, users } from '@/server/db/schema';
import { AppError } from '@/server/errors';
import { setupTestDb } from '@/test/db';
import { makeLeader, makePlayer, makeTournament, makeUser } from '@/test/factories';
import {
  changePassword,
  getUser,
  isUsernameAvailable,
  login,
  regenerateOrganiserKey,
  registerOrganiser,
  registerPlayer,
  updateProfile,
} from './accounts';

const t = setupTestDb();

async function expectError(p: Promise<unknown>, status: number, field?: string): Promise<AppError> {
  try {
    await p;
  } catch (err) {
    expect(err).toBeInstanceOf(AppError);
    const e = err as AppError;
    expect(e.status).toBe(status);
    if (field) expect(e.details?.issues).toHaveProperty(field);
    return e;
  }
  throw new Error(`expected a ${status} error`);
}

let n = 0;
const uname = (prefix = 'u'): string => `${prefix}${++n}${Math.floor(Math.random() * 1e4)}`;

describe('registration (PLAN §2.1)', () => {
  it('creates an organiser with a Player ID and an organiser key', async () => {
    const user = await registerOrganiser({
      accountType: 'ORGANISER',
      displayName: 'Ravi Kumar',
      username: uname('ravi'),
      password: 'password123',
    });
    expect(user.isOrganiser).toBe(true);
    expect(user.email).toBeNull();
    expect(user.playerCode).toMatch(/^[2-9A-HJKMNP-Z]{6}$/);
    expect(user.organiserKey).toMatch(/^[2-9A-HJKMNP-Z]{6}$/);
    expect(user).not.toHaveProperty('passwordHash');
  });

  it('creates a free-agent player (no key) with a Player ID only', async () => {
    const { user, join } = await registerPlayer({
      accountType: 'PLAYER',
      displayName: 'Faiz',
      ign: 'FaizMM',
      username: uname('faiz'),
      password: 'password123',
    });
    expect(user.isOrganiser).toBe(false);
    expect(user.organiserKey).toBeNull();
    expect(user.playerCode).toHaveLength(6);
    expect(join).toBeNull();
  });

  it('rejects a taken username case-insensitively with a field-level 409', async () => {
    const name = uname('Dup');
    await registerPlayer({
      accountType: 'PLAYER',
      displayName: 'One',
      ign: 'one',
      username: name,
      password: 'password123',
    });
    await expectError(
      registerPlayer({
        accountType: 'PLAYER',
        displayName: 'Two',
        ign: 'two',
        username: name.toUpperCase(),
        password: 'password123',
      }),
      409,
      'username',
    );
  });

  it('with a valid key creates a PENDING captain in the organiser’s active tournament', async () => {
    const org = await makeUser(t.db, { isOrganiser: true, displayName: 'Ravi Kumar' });
    const tour = await makeTournament(t.db, { ownerId: org.id });
    const { user, join } = await registerPlayer({
      accountType: 'PLAYER',
      displayName: 'Arjun',
      ign: 'ArjunMM',
      username: uname('arjun'),
      password: 'password123',
      organiserKey: `${org.organiserKey!.slice(0, 3).toLowerCase()}-${org.organiserKey!.slice(3)}`,
      requestedRole: 'LEADER',
    });
    expect(join).toMatchObject({ joined: true, tournamentId: tour.id, kind: 'LEADER' });
    const [row] = await t.db.select().from(leaders).where(eq(leaders.userId, user.id));
    expect(row).toMatchObject({
      approval: 'PENDING',
      source: 'ORGANISER_KEY',
      name: 'Arjun',
      ign: 'ArjunMM',
    });
  });

  it('with a key whose registration is closed still creates the account', async () => {
    const org = await makeUser(t.db, { isOrganiser: true, displayName: 'Meera' });
    await makeTournament(t.db, { ownerId: org.id, registrationOpen: false });
    const { user, join } = await registerPlayer({
      accountType: 'PLAYER',
      displayName: 'Late',
      ign: 'late',
      username: uname('late'),
      password: 'password123',
      organiserKey: org.organiserKey!,
      requestedRole: 'PLAYER',
    });
    expect(join).toMatchObject({ joined: false, reason: 'REGISTRATION_CLOSED' });
    expect(await t.db.select().from(players).where(eq(players.userId, user.id))).toHaveLength(0);
  });

  it('respects max registrations through the key', async () => {
    const org = await makeUser(t.db, { isOrganiser: true });
    const tour = await makeTournament(t.db, { ownerId: org.id, maxRegistrations: 1 });
    await makePlayer(t.db, {
      tournamentId: tour.id,
      source: 'ORGANISER_KEY',
      status: 'PENDING_APPROVAL',
    });
    const { join } = await registerPlayer({
      accountType: 'PLAYER',
      displayName: 'Third',
      ign: 'third',
      username: uname('third'),
      password: 'password123',
      organiserKey: org.organiserKey!,
      requestedRole: 'PLAYER',
    });
    expect(join).toMatchObject({ joined: false, reason: 'FULL' });
  });

  it('rejects an unknown key without creating the account', async () => {
    const name = uname('nokey');
    await expectError(
      registerPlayer({
        accountType: 'PLAYER',
        displayName: 'Nobody',
        ign: 'nobody',
        username: name,
        password: 'password123',
        organiserKey: 'ZZZ-ZZZ',
        requestedRole: 'PLAYER',
      }),
      422,
      'organiserKey',
    );
    expect((await isUsernameAvailable(name, 'ip-x')).available).toBe(true);
  });
});

describe('login (PLAN §2.5)', () => {
  it('logs in case-insensitively and refuses a wrong password with the same message', async () => {
    const name = uname('Login');
    await registerPlayer({
      accountType: 'PLAYER',
      displayName: 'Lee',
      ign: 'lee',
      username: name,
      password: 'password123',
    });
    const user = await login({ username: name.toLowerCase(), password: 'password123' }, 'ip-1');
    expect(user.username).toBe(name);

    const wrong = await expectError(login({ username: name, password: 'nope-nope' }, 'ip-1'), 401);
    const missing = await expectError(
      login({ username: 'no_such_user_x', password: 'nope-nope' }, 'ip-1'),
      401,
    );
    expect(wrong.message).toBe(missing.message);
  });

  it('rate-limits repeated attempts per username', async () => {
    const name = uname('rl');
    for (let i = 0; i < 10; i++) {
      await expectError(login({ username: name, password: 'x' }, `ip-rl-${i}`), 401);
    }
    await expectError(login({ username: name, password: 'x' }, 'ip-rl-new'), 429);
  });
});

describe('account maintenance', () => {
  it('reports username availability', async () => {
    const org = await makeUser(t.db);
    expect(await isUsernameAvailable(org.username.toUpperCase(), 'ip-a')).toEqual({
      available: false,
      reason: 'That username is taken',
    });
    expect((await isUsernameAvailable('ab', 'ip-a')).available).toBe(false);
    expect((await isUsernameAvailable(uname('free'), 'ip-a')).available).toBe(true);
  });

  it('changes the password only with the current one', async () => {
    const name = uname('pw');
    const { user } = await registerPlayer({
      accountType: 'PLAYER',
      displayName: 'Pat',
      ign: 'pat',
      username: name,
      password: 'password123',
    });
    await expectError(
      changePassword(user.id, { currentPassword: 'wrong-one', newPassword: 'newpassword1' }),
      422,
      'currentPassword',
    );
    await changePassword(user.id, { currentPassword: 'password123', newPassword: 'newpassword1' });
    await expect(
      login({ username: name, password: 'newpassword1' }, 'ip-pw'),
    ).resolves.toBeTruthy();
  });

  it('updates snapshots only in tournaments that have not started', async () => {
    const owner = await makeUser(t.db, { isOrganiser: true });
    const other = await makeUser(t.db, { isOrganiser: true });
    const draft = await makeTournament(t.db, { ownerId: owner.id });
    const live = await makeTournament(t.db, { ownerId: other.id, status: 'AUCTION_LIVE' });
    const me = await makeUser(t.db);
    const inDraft = await makeLeader(t.db, { tournamentId: draft.id, userId: me.id, name: 'Old' });
    const inLive = await makePlayer(t.db, { tournamentId: live.id, userId: me.id, name: 'Old' });

    await updateProfile(me.id, { displayName: 'New Name', ign: 'NewIGN', phone: '', photoUrl: '' });

    const [l] = await t.db.select().from(leaders).where(eq(leaders.id, inDraft.id));
    const [p] = await t.db.select().from(players).where(eq(players.id, inLive.id));
    expect(l).toMatchObject({ name: 'New Name', ign: 'NewIGN' });
    expect(p?.name).toBe('Old');
    expect((await getUser(me.id)).displayName).toBe('New Name');
  });

  it('regenerates the organiser key; the old key stops resolving', async () => {
    const org = await makeUser(t.db, { isOrganiser: true });
    await makeTournament(t.db, { ownerId: org.id });
    const { organiserKey } = await regenerateOrganiserKey(org.id);
    expect(organiserKey).not.toBe(org.organiserKey);
    const [row] = await t.db.select().from(users).where(eq(users.id, org.id));
    expect(row?.organiserKey).toBe(organiserKey);
    await expectError(
      registerPlayer({
        accountType: 'PLAYER',
        displayName: 'Old key',
        ign: 'old',
        username: uname('oldkey'),
        password: 'password123',
        organiserKey: org.organiserKey!,
        requestedRole: 'PLAYER',
      }),
      422,
      'organiserKey',
    );
  });

  it('refuses to regenerate a key for a player account', async () => {
    const player = await makeUser(t.db);
    await expectError(regenerateOrganiserKey(player.id), 404);
  });
});
