import 'server-only';
import { and, count, eq, ne, notInArray, sql } from 'drizzle-orm';
import { normalizeKey } from '@/lib/rules/keys';
import {
  INACTIVE_TOURNAMENT_STATUSES,
  JOINABLE_TOURNAMENT_STATUSES,
  type ParticipantKind,
  type TournamentStatus,
} from '@/lib/schemas/enums';
import { getDb, withTransaction, type Db } from '../../db/client';
import { leaders, players, tournaments, users } from '../../db/schema';
import { notFound } from '../../errors';
import { enforceRateLimit } from '../../rate-limit';
import { lockTournament } from '../roster';
import { afterRosterChange } from '../people/roster-events';
import { assertNotInTournament } from './exclusion';

/**
 * Path B: the organiser key (PLAN §2.3 B). One stable key per organiser that always points at
 * their CURRENT active tournament. Sign-ups arrive PENDING and wait for the organiser.
 */

export interface KeyTournament {
  id: string;
  name: string;
  status: TournamentStatus;
  registrationOpen: boolean;
  /** maxRegistrations reached. */
  full: boolean;
}

export interface KeyPreview {
  organiserUserId: string;
  organiserName: string;
  tournament: KeyTournament | null;
}

export type JoinBlockReason = 'NO_ACTIVE_TOURNAMENT' | 'REGISTRATION_CLOSED' | 'FULL';

export type JoinResult =
  | {
      joined: true;
      tournamentId: string;
      tournamentName: string;
      organiserName: string;
      kind: ParticipantKind;
      recordId: string;
    }
  | { joined: false; reason: JoinBlockReason; message: string; organiserName: string };

/** Why a key can't take sign-ups right now, or null when it can. */
export function keyBlockReason(preview: KeyPreview): JoinBlockReason | null {
  const t = preview.tournament;
  if (!t) return 'NO_ACTIVE_TOURNAMENT';
  if (
    !t.registrationOpen ||
    !(JOINABLE_TOURNAMENT_STATUSES as readonly string[]).includes(t.status)
  )
    return 'REGISTRATION_CLOSED';
  if (t.full) return 'FULL';
  return null;
}

export function keyBlockMessage(reason: JoinBlockReason, organiserName: string): string {
  const first = organiserName.split(' ')[0] ?? organiserName;
  switch (reason) {
    case 'NO_ACTIVE_TOURNAMENT':
      return `${first} isn't running a tournament right now.`;
    case 'REGISTRATION_CLOSED':
      return `${first}'s tournament isn't taking sign-ups right now.`;
    case 'FULL':
      return `${first}'s tournament is full.`;
  }
}

/** Key sign-ups that count toward `max_registrations` (everything except rejected). */
async function keySignupCount(db: Db, tournamentId: string): Promise<number> {
  const [l] = await db
    .select({ n: count() })
    .from(leaders)
    .where(
      and(
        eq(leaders.tournamentId, tournamentId),
        eq(leaders.source, 'ORGANISER_KEY'),
        ne(leaders.approval, 'REJECTED'),
      ),
    );
  const [p] = await db
    .select({ n: count() })
    .from(players)
    .where(
      and(
        eq(players.tournamentId, tournamentId),
        eq(players.source, 'ORGANISER_KEY'),
        ne(players.status, 'REJECTED'),
      ),
    );
  return Number(l?.n ?? 0) + Number(p?.n ?? 0);
}

/** Look up a (normalised) key. Null when no organiser has it. No rate limit: callers add one. */
export async function resolveOrganiserKey(
  key: string,
  db: Db = getDb(),
): Promise<KeyPreview | null> {
  const [org] = await db
    .select({ id: users.id, name: users.displayName })
    .from(users)
    .where(and(eq(users.organiserKey, key), eq(users.isOrganiser, true)))
    .limit(1);
  if (!org) return null;
  const [tour] = await db
    .select({
      id: tournaments.id,
      name: tournaments.name,
      status: tournaments.status,
      registrationOpen: tournaments.registrationOpen,
      maxRegistrations: tournaments.maxRegistrations,
    })
    .from(tournaments)
    .where(
      and(
        eq(tournaments.ownerId, org.id),
        notInArray(tournaments.status, [...INACTIVE_TOURNAMENT_STATUSES]),
      ),
    )
    .limit(1);
  let tournament: KeyTournament | null = null;
  if (tour) {
    const full =
      tour.maxRegistrations !== null &&
      (await keySignupCount(db, tour.id)) >= tour.maxRegistrations;
    tournament = {
      id: tour.id,
      name: tour.name,
      status: tour.status,
      registrationOpen: tour.registrationOpen,
      full,
    };
  }
  return { organiserUserId: org.id, organiserName: org.name, tournament };
}

export interface PublicKeyPreview {
  organiserName: string;
  tournamentName: string | null;
  canJoin: boolean;
  message: string | null;
}

/** GET /api/organiser-keys/:key — public, rate-limited, same 404 for anything invalid. */
export async function previewOrganiserKey(
  rawKey: string,
  ip: string,
  db: Db = getDb(),
): Promise<PublicKeyPreview> {
  await enforceRateLimit(`key-lookup:ip:${ip}`, 30, 60, db);
  const key = normalizeKey(rawKey);
  const preview = key ? await resolveOrganiserKey(key, db) : null;
  if (!preview) throw notFound();
  const reason = keyBlockReason(preview);
  return {
    organiserName: preview.organiserName,
    tournamentName: preview.tournament?.name ?? null,
    canJoin: reason === null,
    message: reason ? keyBlockMessage(reason, preview.organiserName) : null,
  };
}

/**
 * Join the key's active tournament as a PENDING captain or soldier. Business refusals (closed,
 * full, no tournament) come back as `{ joined: false }`; being in the tournament already is 409.
 */
export async function joinWithKey(
  userId: string,
  key: string,
  role: ParticipantKind,
  db: Db = getDb(),
): Promise<JoinResult> {
  const preview = await resolveOrganiserKey(key, db);
  if (!preview) throw notFound();
  const early = keyBlockReason(preview);
  if (early || !preview.tournament) {
    const reason = early ?? 'NO_ACTIVE_TOURNAMENT';
    return {
      joined: false,
      reason,
      message: keyBlockMessage(reason, preview.organiserName),
      organiserName: preview.organiserName,
    };
  }
  const tournamentId = preview.tournament.id;

  return withTransaction(async (tx, onCommit) => {
    const tour = await lockTournament(tx, tournamentId);
    // Re-check under the lock: the organiser may have closed or filled registration meanwhile.
    const locked: KeyPreview = {
      ...preview,
      tournament: {
        id: tour.id,
        name: tour.name,
        status: tour.status,
        registrationOpen: tour.registrationOpen,
        full:
          tour.maxRegistrations !== null &&
          (await keySignupCount(tx, tour.id)) >= tour.maxRegistrations,
      },
    };
    const reason = keyBlockReason(locked);
    if (reason) {
      return {
        joined: false as const,
        reason,
        message: keyBlockMessage(reason, preview.organiserName),
        organiserName: preview.organiserName,
      };
    }
    await assertNotInTournament(tx, tournamentId, userId);

    const [me] = await tx
      .select({
        name: users.displayName,
        ign: users.ign,
        phone: users.phone,
        photoUrl: users.photoUrl,
      })
      .from(users)
      .where(eq(users.id, userId));
    if (!me) throw notFound();
    const snapshot = { tournamentId, userId, ...me, source: 'ORGANISER_KEY' as const };

    let recordId: string;
    if (role === 'LEADER') {
      const [row] = await tx
        .insert(leaders)
        .values({
          ...snapshot,
          approval: 'PENDING',
          inviteStatus: 'ACCOUNT_LINKED',
          lastActivityAt: sql`now()`,
        })
        .returning({ id: leaders.id });
      recordId = row!.id;
    } else {
      const [row] = await tx
        .insert(players)
        .values({
          ...snapshot,
          status: 'PENDING_APPROVAL',
          inviteStatus: 'ACCOUNT_LINKED',
          lastActivityAt: sql`now()`,
        })
        .returning({ id: players.id });
      recordId = row!.id;
    }
    await afterRosterChange(tx, tournamentId, onCommit, {
      type: 'people.updated',
      data: { kind: role, ids: [recordId] },
    });
    return {
      joined: true as const,
      tournamentId,
      tournamentName: tour.name,
      organiserName: preview.organiserName,
      kind: role,
      recordId,
    };
  }, db);
}

/** Dashboard "Join with a key" for logged-in players (rate-limited per user). */
export async function joinWithKeyInput(
  userId: string,
  rawKey: string,
  role: ParticipantKind,
  db: Db = getDb(),
): Promise<JoinResult> {
  await enforceRateLimit(`key-join:user:${userId}`, 20, 600, db);
  const key = normalizeKey(rawKey);
  if (!key) throw notFound();
  return joinWithKey(userId, key, role, db);
}
