import 'server-only';
import { aliasedTable, and, asc, eq, gt, isNull, or, sql } from 'drizzle-orm';
import type { z } from 'zod';
import {
  changeMemberRoleSchema,
  createOrganiserInviteSchema,
  transferOwnershipSchema,
  type InvitableRole,
} from '@/features/identity/schemas';
import type { MembershipRole } from '@/lib/schemas/enums';
import { generateToken, hashToken } from '../../auth/tokens';
import { getDb, withTransaction, type Db } from '../../db/client';
import { memberships, organiserInvites, tournaments, users } from '../../db/schema';
import { badRequest, conflict, forbidden, isUniqueViolation, notFound } from '../../errors';
import { env } from '../../env';
import { enforceRateLimit } from '../../rate-limit';
import { writeAudit } from '../audit';
import { lockTournament } from '../roster';
import { requireRole } from '../roles';
import { afterRosterChange } from '../people/roster-events';

/**
 * Organiser team (PLAN §2.4, §7.3): co-admins and auctioneers join through single-use invite
 * links (random 32-byte token, stored hashed, 7 days). The invite is bound to the email or
 * username the owner typed, so a forwarded link can't be used by someone else.
 */

const INVITE_TTL = sql`now() + interval '7 days'`;

export interface MemberRow {
  userId: string;
  displayName: string;
  username: string;
  role: MembershipRole;
  addedByName: string | null;
  addedAt: Date;
}

export interface PendingInviteRow {
  id: string;
  emailOrUsername: string;
  role: MembershipRole;
  expiresAt: Date;
  createdAt: Date;
}

export interface MembersView {
  members: MemberRow[];
  invites: PendingInviteRow[];
}

const pendingInvite = () =>
  and(
    isNull(organiserInvites.usedAt),
    isNull(organiserInvites.revokedAt),
    gt(organiserInvites.expiresAt, sql`now()`),
  );

/** GET members: organisers + pending invites (any organiser of the tournament). */
export async function listMembers(
  userId: string | null,
  tournamentId: string,
  db: Db = getDb(),
): Promise<MembersView> {
  await requireRole(userId, tournamentId, 'tournament:view-admin', db);
  const adder = aliasedTable(users, 'adder');
  const members = await db
    .select({
      userId: memberships.userId,
      displayName: users.displayName,
      username: users.username,
      role: memberships.role,
      addedByName: adder.displayName,
      addedAt: memberships.addedAt,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .leftJoin(adder, eq(adder.id, memberships.addedBy))
    .where(eq(memberships.tournamentId, tournamentId))
    .orderBy(asc(memberships.addedAt));
  const invites = await db
    .select({
      id: organiserInvites.id,
      emailOrUsername: organiserInvites.emailOrUsername,
      role: organiserInvites.role,
      expiresAt: organiserInvites.expiresAt,
      createdAt: organiserInvites.createdAt,
    })
    .from(organiserInvites)
    .where(and(eq(organiserInvites.tournamentId, tournamentId), pendingInvite()))
    .orderBy(asc(organiserInvites.createdAt));
  return { members, invites };
}

function assertActive(status: string): void {
  if (status === 'COMPLETED' || status === 'CANCELLED') {
    throw conflict('This tournament is finished and read-only');
  }
}

export interface CreatedInvite {
  id: string;
  link: string;
  expiresAt: Date;
}

/** Owner only: a single-use invite link for a co-admin or auctioneer. */
export async function createOrganiserInvite(
  userId: string,
  tournamentId: string,
  input: z.input<typeof createOrganiserInviteSchema>,
  db: Db = getDb(),
): Promise<CreatedInvite> {
  const data = createOrganiserInviteSchema.parse(input);
  await requireRole(userId, tournamentId, 'organisers:manage', db);
  await enforceRateLimit(`organiser-invite:user:${userId}`, 30, 86_400, db);
  const token = generateToken();
  return withTransaction(async (tx) => {
    const tour = await lockTournament(tx, tournamentId);
    assertActive(tour.status);
    const target = data.emailOrUsername.toLowerCase();
    const [existing] = await tx
      .select({ role: memberships.role })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(
        and(
          eq(memberships.tournamentId, tournamentId),
          or(sql`lower(${users.username}) = ${target}`, sql`lower(${users.email}) = ${target}`),
        ),
      )
      .limit(1);
    if (existing) throw conflict('That person is already an organiser of this tournament');
    const [row] = await tx
      .insert(organiserInvites)
      .values({
        tournamentId,
        emailOrUsername: data.emailOrUsername,
        role: data.role,
        tokenHash: hashToken(token),
        expiresAt: INVITE_TTL,
        createdBy: userId,
      })
      .returning({ id: organiserInvites.id, expiresAt: organiserInvites.expiresAt });
    await writeAudit(tx, {
      tournamentId,
      actorUserId: userId,
      action: 'organisers.invited',
      after: { emailOrUsername: data.emailOrUsername, role: data.role },
    });
    return {
      id: row!.id,
      expiresAt: row!.expiresAt,
      link: `${env().PUBLIC_APP_URL}/organiser-invite/${token}`,
    };
  }, db);
}

export interface InvitePreview {
  tournamentName: string;
  role: MembershipRole;
  invitedBy: string;
  emailOrUsername: string;
}

async function findInviteByToken(db: Db, token: string) {
  const [row] = await db
    .select({
      id: organiserInvites.id,
      tournamentId: organiserInvites.tournamentId,
      role: organiserInvites.role,
      emailOrUsername: organiserInvites.emailOrUsername,
      tournamentName: tournaments.name,
      tournamentStatus: tournaments.status,
      invitedBy: users.displayName,
    })
    .from(organiserInvites)
    .innerJoin(tournaments, eq(tournaments.id, organiserInvites.tournamentId))
    .innerJoin(users, eq(users.id, organiserInvites.createdBy))
    .where(and(eq(organiserInvites.tokenHash, hashToken(token)), pendingInvite()))
    .limit(1);
  if (!row || row.tournamentStatus === 'COMPLETED' || row.tournamentStatus === 'CANCELLED') {
    return null;
  }
  return row;
}

/** GET /api/organiser-invites/:token — same 404 for unknown, used, revoked or expired links. */
export async function getOrganiserInvitePreview(
  token: string,
  ip: string,
  db: Db = getDb(),
): Promise<InvitePreview> {
  await enforceRateLimit(`organiser-invite-view:ip:${ip}`, 60, 600, db);
  const row = await findInviteByToken(db, token);
  if (!row) throw notFound();
  return {
    tournamentName: row.tournamentName,
    role: row.role,
    invitedBy: row.invitedBy,
    emailOrUsername: row.emailOrUsername,
  };
}

async function identityMatches(db: Db, userId: string, emailOrUsername: string): Promise<boolean> {
  const target = emailOrUsername.trim().toLowerCase();
  const [me] = await db
    .select({ username: users.username, email: users.email })
    .from(users)
    .where(eq(users.id, userId));
  return !!me && (me.username.toLowerCase() === target || me.email?.toLowerCase() === target);
}

/**
 * Accept an invite by its link token, or by id from the dashboard banner (then only the invited
 * account can see it). Single use: the row is locked, checked and marked used in one transaction.
 */
export async function acceptOrganiserInvite(
  userId: string,
  ref: { token: string } | { inviteId: string },
  db: Db = getDb(),
): Promise<{ tournamentId: string }> {
  return withTransaction(async (tx, onCommit) => {
    const where =
      'token' in ref
        ? eq(organiserInvites.tokenHash, hashToken(ref.token))
        : eq(organiserInvites.id, ref.inviteId);
    const [invite] = await tx
      .select()
      .from(organiserInvites)
      .where(and(where, pendingInvite()))
      .for('update');
    if (!invite) throw notFound();
    const matches = await identityMatches(tx, userId, invite.emailOrUsername);
    if (!matches) {
      // A banner accept by id must not reveal invites for other people.
      if ('inviteId' in ref) throw notFound();
      throw forbidden(
        `This invite is for ${invite.emailOrUsername}. Log in with that account, or ask the owner to invite you.`,
      );
    }
    const tour = await lockTournament(tx, invite.tournamentId);
    assertActive(tour.status);
    try {
      await tx.insert(memberships).values({
        tournamentId: invite.tournamentId,
        userId,
        role: invite.role,
        addedBy: invite.createdBy,
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw conflict('You are already an organiser of this tournament');
      throw err;
    }
    await tx
      .update(organiserInvites)
      .set({ usedAt: sql`now()`, usedBy: userId })
      .where(eq(organiserInvites.id, invite.id));
    await writeAudit(tx, {
      tournamentId: invite.tournamentId,
      actorUserId: userId,
      action: 'organisers.joined',
      after: { role: invite.role },
    });
    await afterRosterChange(tx, invite.tournamentId, onCommit, {
      type: 'people.updated',
      data: { kind: 'MEMBER', ids: [userId] },
    });
    return { tournamentId: invite.tournamentId };
  }, db);
}

export interface MyOrganiserInvite {
  id: string;
  tournamentName: string;
  role: MembershipRole;
  invitedBy: string;
  expiresAt: Date;
}

/** Pending organiser invites addressed to my username or email (dashboard banner, §7.1). */
export async function listMyOrganiserInvites(
  userId: string,
  db: Db = getDb(),
): Promise<MyOrganiserInvite[]> {
  const [me] = await db
    .select({ username: users.username, email: users.email })
    .from(users)
    .where(eq(users.id, userId));
  if (!me) return [];
  const inviter = aliasedTable(users, 'inviter');
  const ids = [me.username.toLowerCase(), ...(me.email ? [me.email.toLowerCase()] : [])];
  const rows = await db
    .select({
      id: organiserInvites.id,
      tournamentName: tournaments.name,
      tournamentStatus: tournaments.status,
      tournamentId: tournaments.id,
      role: organiserInvites.role,
      invitedBy: inviter.displayName,
      expiresAt: organiserInvites.expiresAt,
      isMember: memberships.userId,
    })
    .from(organiserInvites)
    .innerJoin(tournaments, eq(tournaments.id, organiserInvites.tournamentId))
    .innerJoin(inviter, eq(inviter.id, organiserInvites.createdBy))
    .leftJoin(
      memberships,
      and(eq(memberships.tournamentId, tournaments.id), eq(memberships.userId, userId)),
    )
    .where(
      and(
        pendingInvite(),
        sql`lower(${organiserInvites.emailOrUsername}) in (${sql.join(
          ids.map((i) => sql`${i}`),
          sql`, `,
        )})`,
      ),
    );
  return rows
    .filter(
      (r) =>
        r.isMember === null &&
        r.tournamentStatus !== 'COMPLETED' &&
        r.tournamentStatus !== 'CANCELLED',
    )
    .map(({ id, tournamentName, role, invitedBy, expiresAt }) => ({
      id,
      tournamentName,
      role,
      invitedBy,
      expiresAt,
    }));
}

/** Owner revokes a pending invite (the link stops working). */
export async function revokeOrganiserInvite(
  userId: string,
  inviteId: string,
  db: Db = getDb(),
): Promise<void> {
  const [invite] = await db
    .select({ tournamentId: organiserInvites.tournamentId })
    .from(organiserInvites)
    .where(eq(organiserInvites.id, inviteId));
  if (!invite) throw notFound();
  await requireRole(userId, invite.tournamentId, 'organisers:manage', db);
  await withTransaction(async (tx) => {
    const [row] = await tx
      .update(organiserInvites)
      .set({ revokedAt: sql`now()` })
      .where(and(eq(organiserInvites.id, inviteId), pendingInvite()))
      .returning({ id: organiserInvites.id, emailOrUsername: organiserInvites.emailOrUsername });
    if (!row) throw conflict('That invite was already used, revoked or expired');
    await writeAudit(tx, {
      tournamentId: invite.tournamentId,
      actorUserId: userId,
      action: 'organisers.invite_revoked',
      before: { emailOrUsername: row.emailOrUsername },
    });
  }, db);
}

async function memberRole(db: Db, tournamentId: string, userId: string): Promise<MembershipRole> {
  const [row] = await db
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.tournamentId, tournamentId), eq(memberships.userId, userId)));
  if (!row) throw notFound();
  return row.role;
}

/** Owner changes a co-admin ⇄ auctioneer. The owner row can't be changed here. */
export async function changeMemberRole(
  userId: string,
  tournamentId: string,
  targetUserId: string,
  input: z.input<typeof changeMemberRoleSchema>,
  db: Db = getDb(),
): Promise<void> {
  const { role } = changeMemberRoleSchema.parse(input);
  await requireRole(userId, tournamentId, 'organisers:manage', db);
  await withTransaction(async (tx, onCommit) => {
    await lockTournament(tx, tournamentId);
    const before = await memberRole(tx, tournamentId, targetUserId);
    if (before === 'OWNER') throw badRequest('Use “Transfer ownership” to change the owner');
    if (before === role) return;
    await tx
      .update(memberships)
      .set({ role })
      .where(and(eq(memberships.tournamentId, tournamentId), eq(memberships.userId, targetUserId)));
    await writeAudit(tx, {
      tournamentId,
      actorUserId: userId,
      action: 'organisers.role_changed',
      before: { userId: targetUserId, role: before },
      after: { userId: targetUserId, role },
    });
    await afterRosterChange(tx, tournamentId, onCommit, {
      type: 'people.updated',
      data: { kind: 'MEMBER', ids: [targetUserId] },
    });
  }, db);
}

/** Owner removes a co-admin or auctioneer. */
export async function removeMember(
  userId: string,
  tournamentId: string,
  targetUserId: string,
  db: Db = getDb(),
): Promise<void> {
  await requireRole(userId, tournamentId, 'organisers:manage', db);
  await withTransaction(async (tx, onCommit) => {
    await lockTournament(tx, tournamentId);
    const before = await memberRole(tx, tournamentId, targetUserId);
    if (before === 'OWNER') throw badRequest('The owner can’t be removed');
    await tx
      .delete(memberships)
      .where(and(eq(memberships.tournamentId, tournamentId), eq(memberships.userId, targetUserId)));
    await writeAudit(tx, {
      tournamentId,
      actorUserId: userId,
      action: 'organisers.removed',
      before: { userId: targetUserId, role: before },
    });
    await afterRosterChange(tx, tournamentId, onCommit, {
      type: 'people.updated',
      data: { kind: 'MEMBER', ids: [targetUserId] },
    });
  }, db);
}

/**
 * Hand ownership to a co-admin (type the tournament name to confirm). The old owner becomes a
 * co-admin. The new owner can't already own another active tournament (partial index → 409).
 */
export async function transferOwnership(
  userId: string,
  tournamentId: string,
  input: z.input<typeof transferOwnershipSchema>,
  db: Db = getDb(),
): Promise<void> {
  const { toUserId, confirmName } = transferOwnershipSchema.parse(input);
  await requireRole(userId, tournamentId, 'tournament:transfer', db);
  try {
    await withTransaction(async (tx, onCommit) => {
      const tour = await lockTournament(tx, tournamentId);
      assertActive(tour.status);
      if (tour.name.trim().toLowerCase() !== confirmName.trim().toLowerCase()) {
        throw badRequest('Type the tournament name exactly to confirm');
      }
      if (toUserId === userId) throw badRequest('You already own this tournament');
      const targetRole = await memberRole(tx, tournamentId, toUserId);
      if (targetRole !== 'CO_ADMIN') throw badRequest('Ownership can only go to a co-admin');
      const [target] = await tx
        .select({ isOrganiser: users.isOrganiser })
        .from(users)
        .where(eq(users.id, toUserId));
      if (!target?.isOrganiser) {
        throw badRequest('The new owner needs an organiser account');
      }
      // Demote first: only one OWNER row may exist at a time.
      await tx
        .update(memberships)
        .set({ role: 'CO_ADMIN' })
        .where(and(eq(memberships.tournamentId, tournamentId), eq(memberships.userId, userId)));
      await tx
        .update(memberships)
        .set({ role: 'OWNER' })
        .where(and(eq(memberships.tournamentId, tournamentId), eq(memberships.userId, toUserId)));
      await tx
        .update(tournaments)
        .set({ ownerId: toUserId })
        .where(eq(tournaments.id, tournamentId));
      await writeAudit(tx, {
        tournamentId,
        actorUserId: userId,
        action: 'tournament.ownership_transferred',
        before: { ownerId: userId },
        after: { ownerId: toUserId },
      });
      await afterRosterChange(tx, tournamentId, onCommit, {
        type: 'people.updated',
        data: { kind: 'MEMBER', ids: [userId, toUserId] },
      });
    }, db);
  } catch (err) {
    if (isUniqueViolation(err, 'tournaments_one_active_per_owner_uq')) {
      throw conflict('That co-admin already owns an active tournament');
    }
    throw err;
  }
}

export type { InvitableRole };
