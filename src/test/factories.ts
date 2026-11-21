/**
 * Minimal row factories for service tests (PGlite). They insert valid rows with sensible
 * defaults; pass overrides for what the test cares about. Unique-ish values come from a counter.
 */
import { randomUUID } from 'node:crypto';
import type { Db } from '@/server/db/connect';
import {
  leaders,
  memberships,
  players,
  teams,
  tournaments,
  users,
  type Leader,
  type NewLeader,
  type NewPlayer,
  type NewTeam,
  type NewTournament,
  type NewUser,
  type Player,
  type Team,
  type Tournament,
  type User,
} from '@/server/db/schema';
import { DEFAULT_SETTINGS } from '@/lib/schemas/settings';
import { KEY_ALPHABET, KEY_LENGTH } from '@/lib/schemas/domain';

let counter = 0;
const next = (): number => ++counter;

/** Random key from the unambiguous alphabet (tests only; Lane A owns real key generation). */
export function testKey(): string {
  let s = '';
  for (let i = 0; i < KEY_LENGTH; i++) s += KEY_ALPHABET[Math.floor(Math.random() * KEY_ALPHABET.length)];
  return s;
}

/** A placeholder hash; tests that log in should hash a real password with `hashPassword`. */
export const FAKE_PASSWORD_HASH = '$argon2id$v=19$m=19456,t=2,p=1$ZmFrZXNhbHQ$ZmFrZWhhc2g';

export async function makeUser(db: Db, overrides: Partial<NewUser> = {}): Promise<User> {
  const n = next();
  const isOrganiser = overrides.isOrganiser ?? false;
  const [row] = await db
    .insert(users)
    .values({
      username: `user${n}_${randomUUID().slice(0, 6)}`,
      passwordHash: FAKE_PASSWORD_HASH,
      displayName: `User ${n}`,
      ign: `ign${n}`,
      playerCode: testKey(),
      ...(isOrganiser ? { email: `org${n}@example.test`, organiserKey: testKey() } : {}),
      ...overrides,
    })
    .returning();
  return row!;
}

/** Creates the tournament AND the owner's OWNER membership row (they must stay in step). */
export async function makeTournament(
  db: Db,
  overrides: Partial<NewTournament> & { ownerId: string },
): Promise<Tournament> {
  const n = next();
  const [row] = await db
    .insert(tournaments)
    .values({
      name: `Tournament ${n}`,
      settings: { ...DEFAULT_SETTINGS },
      liveCode: `LIVE${n}${randomUUID().slice(0, 6)}`,
      ...overrides,
    })
    .returning();
  await db.insert(memberships).values({ tournamentId: row!.id, userId: overrides.ownerId, role: 'OWNER' });
  return row!;
}

export async function makeLeader(
  db: Db,
  overrides: Partial<NewLeader> & { tournamentId: string },
): Promise<Leader> {
  const n = next();
  const purse = overrides.purseTotal ?? DEFAULT_SETTINGS.defaultPurse;
  const [row] = await db
    .insert(leaders)
    .values({
      name: `Captain ${n}`,
      source: 'ADDED_BY_ORGANISER',
      approval: 'APPROVED',
      purseTotal: purse,
      purseRemaining: purse,
      ...overrides,
    })
    .returning();
  return row!;
}

export async function makeTeam(
  db: Db,
  overrides: Partial<NewTeam> & { tournamentId: string; leaderId: string },
): Promise<Team> {
  const n = next();
  const [row] = await db
    .insert(teams)
    .values({
      name: `Team ${n}`,
      shortName: `T${n % 1000}`.slice(0, 4),
      color: `#${(n * 2654435761 % 0xffffff).toString(16).padStart(6, '0')}`,
      sortOrder: n,
      ...overrides,
    })
    .returning();
  return row!;
}

export async function makePlayer(
  db: Db,
  overrides: Partial<NewPlayer> & { tournamentId: string },
): Promise<Player> {
  const n = next();
  const [row] = await db
    .insert(players)
    .values({
      name: `Soldier ${n}`,
      source: 'ADDED_BY_ORGANISER',
      status: 'POOL',
      basePrice: DEFAULT_SETTINGS.minBasePrice,
      ...overrides,
    })
    .returning();
  return row!;
}
