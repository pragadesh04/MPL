import 'server-only';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { type z } from 'zod';
import {
  changePasswordSchema,
  loginSchema,
  registerOrganiserSchema,
  registerPlayerSchema,
  updateProfileSchema,
  usernameSchema,
} from '@/features/identity/schemas';
import { JOINABLE_TOURNAMENT_STATUSES, type ParticipantKind } from '@/lib/schemas/enums';
import { hashPassword, verifyPassword } from '../../auth/password';
import { cryptoRandom } from '../../auth/tokens';
import { generateKey } from '@/lib/rules/keys';
import { getDb, type Db } from '../../db/client';
import { leaders, players, tournaments, users } from '../../db/schema';
import { AppError, isUniqueViolation, notFound, unauthenticated } from '../../errors';
import { checkRateLimit, enforceRateLimit } from '../../rate-limit';
import { joinWithKey, resolveOrganiserKey, type JoinResult } from '../joining/organiserKey';

/**
 * Accounts (PLAN §2.1, §2.5, §7.0). One `users` table for organisers and players. Every account
 * gets a permanent Player ID; organisers also get an organiser key.
 */

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  ign: string | null;
  phone: string | null;
  photoUrl: string | null;
  isOrganiser: boolean;
  email: string | null;
  playerCode: string;
  organiserKey: string | null;
}

const publicColumns = {
  id: users.id,
  username: users.username,
  displayName: users.displayName,
  ign: users.ign,
  phone: users.phone,
  photoUrl: users.photoUrl,
  isOrganiser: users.isOrganiser,
  email: users.email,
  playerCode: users.playerCode,
  organiserKey: users.organiserKey,
};

/** A 422 that the forms show under one field. */
export function fieldError(field: string, message: string): AppError {
  return new AppError('VALIDATION_FAILED', message, { issues: { [field]: [message] } });
}

const USERNAME_TAKEN = 'That username is taken';

async function insertUser(
  values: Omit<typeof users.$inferInsert, 'playerCode' | 'organiserKey'>,
  withOrganiserKey: boolean,
  db: Db,
): Promise<PublicUser> {
  for (let attempt = 1; ; attempt++) {
    try {
      const [row] = await db
        .insert(users)
        .values({
          ...values,
          playerCode: generateKey(cryptoRandom),
          organiserKey: withOrganiserKey ? generateKey(cryptoRandom) : null,
        })
        .returning(publicColumns);
      return row!;
    } catch (err) {
      if (isUniqueViolation(err, 'users_username_lower_uq')) {
        throw new AppError('CONFLICT', USERNAME_TAKEN, { issues: { username: [USERNAME_TAKEN] } });
      }
      const keyClash =
        isUniqueViolation(err, 'users_player_code_uq') ||
        isUniqueViolation(err, 'users_organiser_key_uq');
      if (!keyClash || attempt >= 6) throw err;
    }
  }
}

export async function registerOrganiser(
  input: z.input<typeof registerOrganiserSchema>,
  db: Db = getDb(),
): Promise<PublicUser> {
  const data = registerOrganiserSchema.parse(input);
  return insertUser(
    {
      username: data.username,
      passwordHash: await hashPassword(data.password),
      displayName: data.displayName,
      isOrganiser: true,
    },
    true,
    db,
  );
}

export interface RegisterPlayerResult {
  user: PublicUser;
  /** Present when an organiser key was given. */
  join: JoinResult | null;
}

/**
 * Player sign-up with an optional organiser key (path B, §2.3). An unknown key is a field error
 * (the account is NOT created, so the player can fix or clear it). A known key whose tournament
 * isn't taking sign-ups still creates the account; `join` explains why they weren't added.
 */
export async function registerPlayer(
  input: z.input<typeof registerPlayerSchema>,
  db: Db = getDb(),
): Promise<RegisterPlayerResult> {
  const data = registerPlayerSchema.parse(input);
  if (data.organiserKey) {
    const preview = await resolveOrganiserKey(data.organiserKey, db);
    if (!preview) {
      throw fieldError(
        'organiserKey',
        'We couldn’t find that key. Check it with your organiser, or leave it empty.',
      );
    }
    if (!data.requestedRole) throw fieldError('requestedRole', 'Pick Captain or Soldier');
  }

  const user = await insertUser(
    {
      username: data.username,
      passwordHash: await hashPassword(data.password),
      displayName: data.displayName,
      ign: data.ign,
      phone: data.phone ?? null,
      photoUrl: data.photoUrl ?? null,
    },
    false,
    db,
  );

  let join: JoinResult | null = null;
  if (data.organiserKey && data.requestedRole) {
    join = await joinWithKey(user.id, data.organiserKey, data.requestedRole, db);
  }
  return { user, join };
}

/** Same message for unknown users and wrong passwords. */
const BAD_LOGIN = 'Wrong username or password';
let dummyHash: Promise<string> | undefined;

/** Rate-limited per IP and per username (PLAN §2.5). Returns the user on success. */
export async function login(
  input: z.input<typeof loginSchema>,
  ip: string,
  db: Db = getDb(),
): Promise<PublicUser> {
  const data = loginSchema.parse(input);
  const uname = data.username.toLowerCase();
  await enforceRateLimit(`login:ip:${ip}`, 30, 600, db);
  await enforceRateLimit(`login:user:${uname}`, 10, 600, db);

  const [row] = await db
    .select({ ...publicColumns, passwordHash: users.passwordHash })
    .from(users)
    .where(sql`lower(${users.username}) = ${uname}`)
    .limit(1);
  if (!row) {
    // Spend the same time as a real check so usernames can't be probed by timing.
    dummyHash ??= hashPassword('not-a-real-password');
    await verifyPassword(await dummyHash, data.password);
    throw unauthenticated(BAD_LOGIN);
  }
  if (!(await verifyPassword(row.passwordHash, data.password))) throw unauthenticated(BAD_LOGIN);
  const { passwordHash: _hash, ...user } = row;
  return user;
}

/** Live availability check on the sign-up form. Rate-limited per IP. */
export async function isUsernameAvailable(
  username: string,
  ip: string,
  db: Db = getDb(),
): Promise<{ available: boolean; reason?: string }> {
  const parsed = usernameSchema.safeParse(username);
  if (!parsed.success) {
    return { available: false, reason: parsed.error.issues[0]?.message ?? 'Invalid username' };
  }
  const limit = await checkRateLimit(`username-check:ip:${ip}`, 60, 60, db);
  if (!limit.allowed) return { available: false, reason: 'Slow down a little' };
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.username}) = lower(${parsed.data})`)
    .limit(1);
  return row ? { available: false, reason: USERNAME_TAKEN } : { available: true };
}

export async function getUser(userId: string, db: Db = getDb()): Promise<PublicUser> {
  const [row] = await db.select(publicColumns).from(users).where(eq(users.id, userId)).limit(1);
  if (!row) throw unauthenticated();
  return row;
}

export async function changePassword(
  userId: string,
  input: z.input<typeof changePasswordSchema>,
  db: Db = getDb(),
): Promise<void> {
  const data = changePasswordSchema.parse(input);
  await enforceRateLimit(`change-password:user:${userId}`, 10, 600, db);
  const [row] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!row) throw unauthenticated();
  if (!(await verifyPassword(row.passwordHash, data.currentPassword))) {
    throw fieldError('currentPassword', 'That isn’t your current password');
  }
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(data.newPassword) })
    .where(eq(users.id, userId));
}

/**
 * Update my profile. The snapshot rule (PLAN §5): copies in leaders / players are refreshed only
 * for tournaments that haven't started, so history keeps the old names.
 */
export async function updateProfile(
  userId: string,
  input: z.input<typeof updateProfileSchema>,
  db: Db = getDb(),
): Promise<PublicUser> {
  const data = updateProfileSchema.parse(input);
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(users)
      .set({
        displayName: data.displayName,
        ign: data.ign ?? null,
        phone: data.phone ?? null,
        photoUrl: data.photoUrl ?? null,
      })
      .where(eq(users.id, userId))
      .returning(publicColumns);
    if (!row) throw unauthenticated();
    const unstarted = tx
      .select({ id: tournaments.id })
      .from(tournaments)
      .where(inArray(tournaments.status, [...JOINABLE_TOURNAMENT_STATUSES]));
    const snapshot = {
      name: data.displayName,
      ign: data.ign ?? null,
      phone: data.phone ?? null,
      photoUrl: data.photoUrl ?? null,
    };
    await tx
      .update(leaders)
      .set(snapshot)
      .where(and(eq(leaders.userId, userId), inArray(leaders.tournamentId, unstarted)));
    await tx
      .update(players)
      .set(snapshot)
      .where(and(eq(players.userId, userId), inArray(players.tournamentId, unstarted)));
    return row;
  });
}

/** New organiser key; the old one stops working at once (PLAN §2.3 B). */
export async function regenerateOrganiserKey(
  userId: string,
  db: Db = getDb(),
): Promise<{ organiserKey: string }> {
  for (let attempt = 1; ; attempt++) {
    try {
      const [row] = await db
        .update(users)
        .set({ organiserKey: generateKey(cryptoRandom) })
        .where(and(eq(users.id, userId), eq(users.isOrganiser, true)))
        .returning({ organiserKey: users.organiserKey });
      if (!row?.organiserKey) throw notFound();
      return { organiserKey: row.organiserKey };
    } catch (err) {
      if (!isUniqueViolation(err, 'users_organiser_key_uq') || attempt >= 6) throw err;
    }
  }
}

export type { JoinResult, ParticipantKind };
