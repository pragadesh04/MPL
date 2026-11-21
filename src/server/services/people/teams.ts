import 'server-only';
import { and, asc, count, eq, isNotNull, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { teamSetupSchema, updateSnapshotSchema } from '@/features/identity/schemas';
import type {
  LeaderInviteStatus,
  ParticipantKind,
  PlayerStatus,
  TournamentStatus,
} from '@/lib/schemas/enums';
import { getDb, withTransaction, type Db, type Tx } from '../../db/client';
import { leaders, players, teams, tournaments, users } from '../../db/schema';
import { AppError, conflict, isUniqueViolation, notFound } from '../../errors';
import { writeAudit } from '../audit';
import { notify } from '../notifications/notifications';
import { lockTournament } from '../roster';
import { loadTournamentRole, requireRole } from '../roles';
import { assertSetupEditable } from '../tournaments/tournaments';
import { personalLink } from './links';
import { afterRosterChange } from './roster-events';

/** Captain team setup (§7.4 step 2), the Teams onboarding tracker (§7.2 step 4), my card (§7.5). */

export interface TakenTeam {
  teamId: string;
  leaderId: string;
  name: string;
  shortName: string;
  color: string;
}

export async function loadTeams(db: Db, tournamentId: string): Promise<TakenTeam[]> {
  return db
    .select({
      teamId: teams.id,
      leaderId: teams.leaderId,
      name: teams.name,
      shortName: teams.shortName,
      color: teams.color,
    })
    .from(teams)
    .where(eq(teams.tournamentId, tournamentId))
    .orderBy(asc(teams.sortOrder), asc(teams.createdAt));
}

/** GET taken-colours: any captain or organiser of the tournament. */
export async function listTakenColours(
  userId: string | null,
  tournamentId: string,
  db: Db = getDb(),
): Promise<TakenTeam[]> {
  const access = await requireRole(userId, tournamentId, 'tournament:view', db);
  if (!access.roles.some((r) => r !== 'SOLDIER')) throw notFound();
  return loadTeams(db, tournamentId);
}

function teamFieldError(field: string, message: string): AppError {
  return new AppError('CONFLICT', message, { issues: { [field]: [message] } });
}

async function writeTeam(
  tx: Tx,
  tournamentId: string,
  leaderId: string,
  data: z.output<typeof teamSetupSchema>,
): Promise<string> {
  const values = {
    name: data.name,
    shortName: data.shortName,
    color: data.color,
    secondaryColor: data.secondaryColor ?? null,
    emoji: data.emoji ?? null,
    logoUrl: data.logoUrl ?? null,
    motto: data.motto ?? null,
  };
  const [existing] = await tx
    .select({ id: teams.id })
    .from(teams)
    .where(eq(teams.leaderId, leaderId));
  try {
    // A savepoint, so a unique violation can be reported without aborting the outer transaction.
    return await tx.transaction(async (sp) => {
      if (existing) {
        await sp.update(teams).set(values).where(eq(teams.id, existing.id));
        return existing.id;
      }
      const [{ n } = { n: 0 }] = await sp
        .select({ n: count() })
        .from(teams)
        .where(eq(teams.tournamentId, tournamentId));
      const [row] = await sp
        .insert(teams)
        .values({ ...values, tournamentId, leaderId, sortOrder: Number(n) })
        .returning({ id: teams.id });
      return row!.id;
    });
  } catch (err) {
    if (isUniqueViolation(err, 'teams_tournament_name_uq')) {
      throw teamFieldError('name', 'Another team already has that name');
    }
    if (isUniqueViolation(err, 'teams_tournament_color_uq')) {
      throw teamFieldError('color', 'That colour was just taken by another team');
    }
    if (isUniqueViolation(err, 'teams_tournament_short_name_uq')) {
      throw teamFieldError('shortName', 'Another team already uses that short code');
    }
    throw err;
  }
}

/** PUT /api/tournaments/:id/my-team — the captain creates / updates their team before Start. */
export async function upsertMyTeam(
  userId: string,
  tournamentId: string,
  input: z.input<typeof teamSetupSchema>,
  db: Db = getDb(),
): Promise<{ teamId: string }> {
  const data = teamSetupSchema.parse(input);
  const access = await requireRole(userId, tournamentId, 'team:edit-own', db);
  const leaderId = access.leaderId;
  if (!leaderId) throw notFound();
  return withTransaction(async (tx, onCommit) => {
    const tour = await lockTournament(tx, tournamentId);
    assertSetupEditable(tour.status);
    const teamId = await writeTeam(tx, tournamentId, leaderId, data);
    await tx
      .update(leaders)
      .set({ inviteStatus: 'TEAM_READY', lastActivityAt: sql`now()` })
      .where(and(eq(leaders.id, leaderId), isNotNull(leaders.userId)));
    await afterRosterChange(tx, tournamentId, onCommit, { type: 'team.updated', data: { teamId } });
    return { teamId };
  }, db);
}

/** Organisers fix any team (typo, colour clash) before Start — audited (§7.2 step 4). */
export async function organiserUpdateTeam(
  userId: string,
  tournamentId: string,
  leaderId: string,
  input: z.input<typeof teamSetupSchema>,
  db: Db = getDb(),
): Promise<{ teamId: string }> {
  const data = teamSetupSchema.parse(input);
  await requireRole(userId, tournamentId, 'settings:edit', db);
  return withTransaction(async (tx, onCommit) => {
    const tour = await lockTournament(tx, tournamentId);
    assertSetupEditable(tour.status);
    const [leader] = await tx
      .select({ id: leaders.id, userId: leaders.userId, approval: leaders.approval })
      .from(leaders)
      .where(and(eq(leaders.id, leaderId), eq(leaders.tournamentId, tournamentId)));
    if (!leader || leader.approval !== 'APPROVED') throw notFound();
    const teamId = await writeTeam(tx, tournamentId, leaderId, data);
    if (leader.userId) {
      await tx.update(leaders).set({ inviteStatus: 'TEAM_READY' }).where(eq(leaders.id, leaderId));
    }
    await writeAudit(tx, {
      tournamentId,
      actorUserId: userId,
      action: 'team.edited_by_organiser',
      after: { teamId, ...data },
    });
    await afterRosterChange(tx, tournamentId, onCommit, { type: 'team.updated', data: { teamId } });
    return { teamId };
  }, db);
}

export interface MyTeamSetup {
  tournament: { id: string; name: string; status: TournamentStatus; ownerName: string };
  leaderId: string;
  captainName: string;
  purse: number;
  team: (TakenTeam & { emoji: string | null; motto: string | null; logoUrl: string | null }) | null;
  otherTeams: TakenTeam[];
}

/** Captain view of their own team + everyone else's taken name / colour. */
export async function getMyTeamSetup(
  userId: string | null,
  tournamentId: string,
  db: Db = getDb(),
): Promise<MyTeamSetup> {
  const access = await requireRole(userId, tournamentId, 'team:edit-own', db);
  if (!access.leaderId) throw notFound();
  const [row] = await db
    .select({
      name: tournaments.name,
      status: tournaments.status,
      ownerName: users.displayName,
      captainName: leaders.name,
      purse: leaders.purseTotal,
    })
    .from(tournaments)
    .innerJoin(users, eq(users.id, tournaments.ownerId))
    .innerJoin(leaders, eq(leaders.id, access.leaderId))
    .where(eq(tournaments.id, tournamentId));
  if (!row) throw notFound();
  const [mine] = await db
    .select({
      teamId: teams.id,
      leaderId: teams.leaderId,
      name: teams.name,
      shortName: teams.shortName,
      color: teams.color,
      emoji: teams.emoji,
      motto: teams.motto,
      logoUrl: teams.logoUrl,
    })
    .from(teams)
    .where(eq(teams.leaderId, access.leaderId));
  const all = await loadTeams(db, tournamentId);
  return {
    tournament: { id: tournamentId, name: row.name, status: row.status, ownerName: row.ownerName },
    leaderId: access.leaderId,
    captainName: row.captainName,
    purse: row.purse,
    team: mine ?? null,
    otherTeams: all.filter((t) => t.leaderId !== access.leaderId),
  };
}

export interface BoardCaptain {
  leaderId: string;
  name: string;
  ign: string | null;
  linked: boolean;
  inviteStatus: LeaderInviteStatus;
  lastActivityAt: Date | null;
  purse: number;
  team: (TakenTeam & { emoji: string | null; motto: string | null; logoUrl: string | null }) | null;
}

/** Teams onboarding tracker: one entry per approved captain (organisers). */
export async function getTeamsBoard(
  userId: string | null,
  tournamentId: string,
  db: Db = getDb(),
): Promise<BoardCaptain[]> {
  await requireRole(userId, tournamentId, 'tournament:view-admin', db);
  const rows = await db
    .select({
      leaderId: leaders.id,
      name: leaders.name,
      ign: leaders.ign,
      userId: leaders.userId,
      inviteStatus: leaders.inviteStatus,
      lastActivityAt: leaders.lastActivityAt,
      purse: leaders.purseTotal,
      teamId: teams.id,
      teamName: teams.name,
      shortName: teams.shortName,
      color: teams.color,
      emoji: teams.emoji,
      motto: teams.motto,
      logoUrl: teams.logoUrl,
    })
    .from(leaders)
    .leftJoin(teams, eq(teams.leaderId, leaders.id))
    .where(and(eq(leaders.tournamentId, tournamentId), eq(leaders.approval, 'APPROVED')))
    .orderBy(asc(leaders.createdAt));
  return rows.map((r) => ({
    leaderId: r.leaderId,
    name: r.name,
    ign: r.ign,
    linked: r.userId !== null,
    inviteStatus: r.inviteStatus,
    lastActivityAt: r.lastActivityAt,
    purse: r.purse,
    team:
      r.teamId && r.teamName && r.shortName && r.color
        ? {
            teamId: r.teamId,
            leaderId: r.leaderId,
            name: r.teamName,
            shortName: r.shortName,
            color: r.color,
            emoji: r.emoji,
            motto: r.motto,
            logoUrl: r.logoUrl,
          }
        : null,
  }));
}

/**
 * "Send reminder": notifies linked captains who haven't finished, and returns everyone's
 * personal link so the organiser can paste one WhatsApp message (no email, §2.5).
 */
export async function sendTeamReminder(
  userId: string,
  tournamentId: string,
  db: Db = getDb(),
): Promise<{ captains: { name: string; link: string; linked: boolean }[] }> {
  await requireRole(userId, tournamentId, 'people:manage', db);
  return withTransaction(async (tx, onCommit) => {
    const tour = await lockTournament(tx, tournamentId);
    assertSetupEditable(tour.status);
    const rows = await tx
      .select({
        id: leaders.id,
        name: leaders.name,
        userId: leaders.userId,
        v: leaders.linkVersion,
        teamId: teams.id,
      })
      .from(leaders)
      .leftJoin(teams, eq(teams.leaderId, leaders.id))
      .where(and(eq(leaders.tournamentId, tournamentId), eq(leaders.approval, 'APPROVED')));
    const todo = rows.filter((r) => r.userId === null || r.teamId === null);
    for (const r of todo) {
      if (r.userId) {
        await notify(
          tx,
          onCommit,
          r.userId,
          'team.reminder',
          { tournamentId, tournamentName: tour.name },
          { tournamentId },
        );
      }
    }
    return {
      captains: todo.map((r) => ({
        name: r.name,
        link: personalLink('LEADER', r.id, tournamentId, r.v),
        linked: r.userId !== null,
      })),
    };
  }, db);
}

// ─── My card (soldier portal, §7.5) ─────────────────────────────────────────────────────────

export interface MyCard {
  tournament: { id: string; name: string; status: TournamentStatus; ownerName: string };
  kind: ParticipantKind;
  recordId: string;
  pending: boolean;
  rejected: boolean;
  rejectReason: string | null;
  name: string;
  ign: string | null;
  phone: string | null;
  photoUrl: string | null;
  /** Soldiers. */
  basePrice: number | null;
  status: PlayerStatus | null;
  soldPrice: number | null;
  team: { name: string; shortName: string; color: string } | null;
  /** Captains. */
  purse: number | null;
}

/** My own captain / soldier card — also for people still pending (they see only this). */
export async function getMyCard(
  userId: string,
  tournamentId: string,
  db: Db = getDb(),
): Promise<MyCard> {
  const access = await loadTournamentRole(userId, tournamentId, db);
  if (!access) throw notFound();
  const [tour] = await db
    .select({ name: tournaments.name, status: tournaments.status, ownerName: users.displayName })
    .from(tournaments)
    .innerJoin(users, eq(users.id, tournaments.ownerId))
    .where(eq(tournaments.id, tournamentId));
  if (!tour) throw notFound();
  const tournament = { id: tournamentId, ...tour };

  const [leader] = await db
    .select()
    .from(leaders)
    .where(and(eq(leaders.tournamentId, tournamentId), eq(leaders.userId, userId)));
  if (leader) {
    const [team] = await db
      .select({ name: teams.name, shortName: teams.shortName, color: teams.color })
      .from(teams)
      .where(eq(teams.leaderId, leader.id));
    return {
      tournament,
      kind: 'LEADER',
      recordId: leader.id,
      pending: leader.approval === 'PENDING',
      rejected: leader.approval === 'REJECTED',
      rejectReason: leader.rejectReason,
      name: leader.name,
      ign: leader.ign,
      phone: leader.phone,
      photoUrl: leader.photoUrl,
      basePrice: null,
      status: null,
      soldPrice: null,
      team: team ?? null,
      purse: leader.purseTotal,
    };
  }
  const [player] = await db
    .select()
    .from(players)
    .where(and(eq(players.tournamentId, tournamentId), eq(players.userId, userId)));
  if (!player) throw notFound();
  const [team] = player.teamId
    ? await db
        .select({ name: teams.name, shortName: teams.shortName, color: teams.color })
        .from(teams)
        .where(eq(teams.id, player.teamId))
    : [];
  return {
    tournament,
    kind: 'PLAYER',
    recordId: player.id,
    pending: player.status === 'PENDING_APPROVAL',
    rejected: player.status === 'REJECTED',
    rejectReason: player.rejectReason,
    name: player.name,
    ign: player.ign,
    phone: player.phone,
    photoUrl: player.photoUrl,
    basePrice: player.basePrice,
    status: player.status,
    soldPrice: player.soldPrice,
    team: team ?? null,
    purse: null,
  };
}

/** PATCH /api/tournaments/:id/me — edit my snapshot (name, IGN, phone, photo) until Start. */
export async function updateMySnapshot(
  userId: string,
  tournamentId: string,
  input: z.input<typeof updateSnapshotSchema>,
  db: Db = getDb(),
): Promise<void> {
  const data = updateSnapshotSchema.parse(input);
  const access = await loadTournamentRole(userId, tournamentId, db);
  if (!access) throw notFound();
  // Only my own captain / soldier row (approved or still pending); organisers have none here.
  const mine =
    access.leaderId ?? access.pending.leaderId ?? access.playerId ?? access.pending.playerId;
  if (!mine) throw notFound();
  await withTransaction(async (tx, onCommit) => {
    const tour = await lockTournament(tx, tournamentId);
    assertSetupEditable(tour.status);
    const values = {
      name: data.name,
      ign: data.ign ?? null,
      phone: data.phone ?? null,
      photoUrl: data.photoUrl ?? null,
      lastActivityAt: sql`now()`,
    };
    const isLeader = mine === access.leaderId || mine === access.pending.leaderId;
    const [row] = isLeader
      ? await tx
          .update(leaders)
          .set(values)
          .where(and(eq(leaders.id, mine), eq(leaders.userId, userId)))
          .returning({ id: leaders.id })
      : await tx
          .update(players)
          .set(values)
          .where(and(eq(players.id, mine), eq(players.userId, userId)))
          .returning({ id: players.id });
    if (!row) throw conflict('Your spot changed — reload and try again');
    await afterRosterChange(tx, tournamentId, onCommit, {
      type: 'people.updated',
      data: { kind: isLeader ? 'LEADER' : 'PLAYER', ids: [mine] },
    });
  }, db);
}
