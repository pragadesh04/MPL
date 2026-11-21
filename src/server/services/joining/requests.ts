import 'server-only';
import {
  aliasedTable,
  and,
  desc,
  eq,
  inArray,
  lte,
  notInArray,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import type { z } from 'zod';
import { declineRequestSchema, sendRequestSchema } from '@/features/identity/schemas';
import { normalizeKey } from '@/lib/rules/keys';
import {
  INACTIVE_TOURNAMENT_STATUSES,
  type JoinRequestStatus,
  type ParticipantKind,
} from '@/lib/schemas/enums';
import { parseSettings } from '@/lib/schemas/settings';
import { getDb, withTransaction, type Db } from '../../db/client';
import {
  joinRequests,
  leaders,
  memberships,
  organiserBlocks,
  players,
  tournaments,
  users,
} from '../../db/schema';
import { dbNow } from '../../db/sql';
import { conflict, forbidden, isUniqueViolation, notFound } from '../../errors';
import { publishInbox } from '../../realtime/publisher';
import { enforceRateLimit } from '../../rate-limit';
import { writeAudit } from '../audit';
import { notify } from '../notifications/notifications';
import { lockTournament } from '../roster';
import { requireRole } from '../roles';
import { checkAmounts } from '../people/people';
import { afterRosterChange } from '../people/roster-events';
import { assertSetupEditable, isJoinable } from '../tournaments/tournaments';
import { findExistingSpot } from './exclusion';

/**
 * Path C: Player ID requests (PLAN §2.3 C, §9 items 15, 17, 17b). The only cross-organiser read
 * is the exact Player ID lookup, which returns the public card only. Requests expire after 7
 * days or at Start, are rate-limited per organiser, and respect "Decline & block".
 */

export const REQUESTS_PER_DAY = 50;
const NO_PLAYER = 'No player with that ID';

export interface PublicCard {
  playerCode: string;
  displayName: string;
  ign: string | null;
  photoUrl: string | null;
}

/** Lazily mark overdue PENDING requests EXPIRED (no server timers, CLAUDE.md). */
export async function expireStaleRequests(db: Db, scope?: SQL): Promise<void> {
  await db
    .update(joinRequests)
    .set({ status: 'EXPIRED', respondedAt: sql`now()` })
    .where(and(eq(joinRequests.status, 'PENDING'), lte(joinRequests.expiresAt, sql`now()`), scope));
}

/**
 * GET /api/players/by-code/:code — organisers with an active tournament they run (owner /
 * co-admin) only. Rate-limited per user and per IP. Never returns username, phone or tournaments.
 */
export async function lookupPlayerCard(
  userId: string,
  rawCode: string,
  ip: string,
  db: Db = getDb(),
): Promise<PublicCard> {
  const [runs] = await db
    .select({ id: tournaments.id })
    .from(memberships)
    .innerJoin(tournaments, eq(tournaments.id, memberships.tournamentId))
    .where(
      and(
        eq(memberships.userId, userId),
        inArray(memberships.role, ['OWNER', 'CO_ADMIN']),
        notInArray(tournaments.status, [...INACTIVE_TOURNAMENT_STATUSES]),
      ),
    )
    .limit(1);
  if (!runs) throw forbidden('Only organisers running an active tournament can look up players');
  await enforceRateLimit(`player-lookup:user:${userId}`, 60, 3600, db);
  await enforceRateLimit(`player-lookup:ip:${ip}`, 120, 3600, db);
  const code = normalizeKey(rawCode);
  if (!code) throw notFound(NO_PLAYER);
  const [card] = await db
    .select({
      playerCode: users.playerCode,
      displayName: users.displayName,
      ign: users.ign,
      photoUrl: users.photoUrl,
    })
    .from(users)
    .where(eq(users.playerCode, code))
    .limit(1);
  if (!card) throw notFound(NO_PLAYER);
  return card;
}

/** Send a request to a Player ID (owner / co-admin, before Start). */
export async function sendJoinRequest(
  userId: string,
  tournamentId: string,
  input: z.input<typeof sendRequestSchema>,
  db: Db = getDb(),
): Promise<{ id: string; expiresAt: Date }> {
  const data = sendRequestSchema.parse(input);
  await requireRole(userId, tournamentId, 'people:manage', db);
  await enforceRateLimit(`join-request:organiser:${userId}:day`, REQUESTS_PER_DAY, 86_400, db);
  try {
    return await withTransaction(async (tx, onCommit) => {
      const tour = await lockTournament(tx, tournamentId);
      assertSetupEditable(tour.status);
      const settings = parseSettings(tour.settings);
      const amount = checkAmounts(
        settings,
        data.role,
        data.role === 'LEADER' ? data.purse : data.basePrice,
      );
      const [target] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.playerCode, data.playerCode));
      if (!target) throw notFound(NO_PLAYER);
      const [blocked] = await tx
        .select({ p: organiserBlocks.playerUserId })
        .from(organiserBlocks)
        .where(
          and(
            eq(organiserBlocks.playerUserId, target.id),
            or(
              eq(organiserBlocks.organiserUserId, userId),
              eq(organiserBlocks.organiserUserId, tour.ownerId),
            ),
          ),
        )
        .limit(1);
      if (blocked) throw conflict('This player isn’t accepting requests from you');
      const spot = await findExistingSpot(tx, tournamentId, target.id);
      if (spot && !spot.pending) throw conflict('They’re already in this tournament');

      await expireStaleRequests(
        tx,
        and(eq(joinRequests.tournamentId, tournamentId), eq(joinRequests.toUserId, target.id)),
      );
      const [row] = await tx
        .insert(joinRequests)
        .values({
          tournamentId,
          fromUserId: userId,
          toUserId: target.id,
          role: data.role,
          purse: data.role === 'LEADER' ? amount : null,
          basePrice: data.role === 'PLAYER' ? amount : null,
          expiresAt: sql`now() + interval '7 days'`,
        })
        .returning({ id: joinRequests.id, expiresAt: joinRequests.expiresAt });
      const [from] = await tx
        .select({ name: users.displayName })
        .from(users)
        .where(eq(users.id, userId));
      await notify(
        tx,
        onCommit,
        target.id,
        'request.received',
        {
          requestId: row!.id,
          tournamentId,
          tournamentName: tour.name,
          organiserName: from?.name ?? '',
          role: data.role,
          amount,
        },
        { tournamentId, event: { type: 'request.received', data: { requestId: row!.id } } },
      );
      await afterRosterChange(tx, tournamentId, onCommit, {
        type: 'people.updated',
        data: { kind: data.role },
      });
      return row!;
    }, db);
  } catch (err) {
    if (isUniqueViolation(err, 'join_requests_one_pending_uq')) {
      throw conflict('They already have a pending request for this tournament');
    }
    throw err;
  }
}

export interface OutgoingRequest {
  id: string;
  role: ParticipantKind;
  purse: number | null;
  basePrice: number | null;
  status: JoinRequestStatus;
  createdAt: Date;
  expiresAt: Date;
  respondedAt: Date | null;
  player: PublicCard;
  sentBy: string;
}

/** "Requests sent" for organisers with people:manage. */
export async function listOutgoingRequests(
  userId: string | null,
  tournamentId: string,
  db: Db = getDb(),
): Promise<OutgoingRequest[]> {
  await requireRole(userId, tournamentId, 'people:manage', db);
  await expireStaleRequests(db, eq(joinRequests.tournamentId, tournamentId));
  const sender = aliasedTable(users, 'sender');
  const rows = await db
    .select({
      id: joinRequests.id,
      role: joinRequests.role,
      purse: joinRequests.purse,
      basePrice: joinRequests.basePrice,
      status: joinRequests.status,
      createdAt: joinRequests.createdAt,
      expiresAt: joinRequests.expiresAt,
      respondedAt: joinRequests.respondedAt,
      playerCode: users.playerCode,
      displayName: users.displayName,
      ign: users.ign,
      photoUrl: users.photoUrl,
      sentBy: sender.displayName,
    })
    .from(joinRequests)
    .innerJoin(users, eq(users.id, joinRequests.toUserId))
    .innerJoin(sender, eq(sender.id, joinRequests.fromUserId))
    .where(eq(joinRequests.tournamentId, tournamentId))
    .orderBy(desc(joinRequests.createdAt));
  return rows.map(({ playerCode, displayName, ign, photoUrl, ...r }) => ({
    ...r,
    player: { playerCode, displayName, ign, photoUrl },
  }));
}

/** Organiser cancels a pending request. */
export async function cancelJoinRequest(
  userId: string,
  tournamentId: string,
  requestId: string,
  db: Db = getDb(),
): Promise<void> {
  await requireRole(userId, tournamentId, 'people:manage', db);
  await withTransaction(async (tx, onCommit) => {
    const [row] = await tx
      .update(joinRequests)
      .set({ status: 'CANCELLED', respondedAt: sql`now()` })
      .where(
        and(
          eq(joinRequests.id, requestId),
          eq(joinRequests.tournamentId, tournamentId),
          eq(joinRequests.status, 'PENDING'),
        ),
      )
      .returning({ toUserId: joinRequests.toUserId });
    if (!row) throw notFound();
    const now = await dbNow(tx);
    onCommit(() =>
      publishInbox(row.toUserId, tournamentId, now, 'request.cancelled', { requestId }),
    );
    await afterRosterChange(tx, tournamentId, onCommit, {
      type: 'people.updated',
      data: {},
    });
  }, db);
}

export interface MyRequest {
  id: string;
  tournamentId: string;
  tournamentName: string;
  organiserName: string;
  role: ParticipantKind;
  purse: number | null;
  basePrice: number | null;
  expiresAt: Date;
  createdAt: Date;
}

/** My incoming pending requests (the inbox). */
export async function listMyRequests(userId: string, db: Db = getDb()): Promise<MyRequest[]> {
  await expireStaleRequests(db, eq(joinRequests.toUserId, userId));
  return db
    .select({
      id: joinRequests.id,
      tournamentId: joinRequests.tournamentId,
      tournamentName: tournaments.name,
      organiserName: users.displayName,
      role: joinRequests.role,
      purse: joinRequests.purse,
      basePrice: joinRequests.basePrice,
      expiresAt: joinRequests.expiresAt,
      createdAt: joinRequests.createdAt,
    })
    .from(joinRequests)
    .innerJoin(tournaments, eq(tournaments.id, joinRequests.tournamentId))
    .innerJoin(users, eq(users.id, joinRequests.fromUserId))
    .where(and(eq(joinRequests.toUserId, userId), eq(joinRequests.status, 'PENDING')))
    .orderBy(desc(joinRequests.createdAt));
}

async function lockMyPendingRequest(tx: Db, userId: string, requestId: string) {
  const [req] = await tx
    .select()
    .from(joinRequests)
    .where(and(eq(joinRequests.id, requestId), eq(joinRequests.toUserId, userId)))
    .for('update');
  if (!req) throw notFound();
  if (req.status !== 'PENDING') throw conflict('This request is no longer open');
  if (req.expiresAt.getTime() <= (await dbNow(tx)).getTime()) {
    await tx
      .update(joinRequests)
      .set({ status: 'EXPIRED', respondedAt: sql`now()` })
      .where(eq(joinRequests.id, requestId));
    throw conflict('This request has expired');
  }
  return req;
}

/**
 * Accept → join already approved. If I signed up with the key and I'm still pending, that row is
 * replaced (never a second row, §9 item 17). Already approved there → 409.
 */
export async function acceptJoinRequest(
  userId: string,
  requestId: string,
  db: Db = getDb(),
): Promise<{ tournamentId: string; kind: ParticipantKind; recordId: string }> {
  // Find the tournament first so the tournament lock is taken before the request lock.
  const [peek] = await db
    .select({ tournamentId: joinRequests.tournamentId })
    .from(joinRequests)
    .where(and(eq(joinRequests.id, requestId), eq(joinRequests.toUserId, userId)));
  if (!peek) throw notFound();

  return withTransaction(async (tx, onCommit) => {
    const tour = await lockTournament(tx, peek.tournamentId);
    const req = await lockMyPendingRequest(tx, userId, requestId);
    if (!isJoinable(tour.status)) throw conflict('This tournament has already started');

    const spot = await findExistingSpot(tx, tour.id, userId);
    if (spot && !spot.pending) throw conflict('You’re already in this tournament');
    if (spot) {
      if (spot.kind === 'LEADER') await tx.delete(leaders).where(eq(leaders.id, spot.id));
      else await tx.delete(players).where(eq(players.id, spot.id));
    }

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
    const base = {
      tournamentId: tour.id,
      userId,
      ...me,
      source: 'PLAYER_ID_REQUEST' as const,
      inviteStatus: 'ACCOUNT_LINKED' as const,
      lastActivityAt: sql`now()`,
    };
    let recordId: string;
    if (req.role === 'LEADER') {
      const purse = req.purse ?? 0;
      const [row] = await tx
        .insert(leaders)
        .values({ ...base, approval: 'APPROVED', purseTotal: purse, purseRemaining: purse })
        .returning({ id: leaders.id });
      recordId = row!.id;
    } else {
      const [row] = await tx
        .insert(players)
        .values({ ...base, status: 'POOL', basePrice: req.basePrice ?? 0 })
        .returning({ id: players.id });
      recordId = row!.id;
    }
    await tx
      .update(joinRequests)
      .set({ status: 'ACCEPTED', respondedAt: sql`now()` })
      .where(eq(joinRequests.id, requestId));
    await writeAudit(tx, {
      tournamentId: tour.id,
      actorUserId: userId,
      action: 'people.request_accepted',
      after: { requestId, kind: req.role, recordId, replaced: spot?.id ?? null },
    });
    await notify(
      tx,
      onCommit,
      req.fromUserId,
      'request.accepted',
      {
        requestId,
        tournamentId: tour.id,
        tournamentName: tour.name,
        playerName: me.name,
        role: req.role,
      },
      { tournamentId: tour.id },
    );
    await afterRosterChange(tx, tour.id, onCommit, {
      type: 'people.updated',
      data: { kind: req.role, ids: [recordId] },
    });
    return { tournamentId: tour.id, kind: req.role, recordId };
  }, db);
}

/** Decline, optionally blocking the organiser who sent it. */
export async function declineJoinRequest(
  userId: string,
  requestId: string,
  input: z.input<typeof declineRequestSchema>,
  db: Db = getDb(),
): Promise<void> {
  const { block } = declineRequestSchema.parse(input);
  await withTransaction(async (tx, onCommit) => {
    const req = await lockMyPendingRequest(tx, userId, requestId);
    await tx
      .update(joinRequests)
      .set({ status: 'DECLINED', respondedAt: sql`now()` })
      .where(eq(joinRequests.id, requestId));
    if (block) {
      await tx
        .insert(organiserBlocks)
        .values({ playerUserId: userId, organiserUserId: req.fromUserId })
        .onConflictDoNothing();
    }
    const [info] = await tx
      .select({ tournamentName: tournaments.name, playerName: users.displayName })
      .from(tournaments)
      .innerJoin(users, eq(users.id, userId))
      .where(eq(tournaments.id, req.tournamentId));
    await notify(
      tx,
      onCommit,
      req.fromUserId,
      'request.declined',
      {
        requestId,
        tournamentId: req.tournamentId,
        tournamentName: info?.tournamentName ?? '',
        playerName: info?.playerName ?? '',
      },
      { tournamentId: req.tournamentId },
    );
    await afterRosterChange(tx, req.tournamentId, onCommit, { type: 'people.updated', data: {} });
  }, db);
}
