import 'server-only';
import { and, count, desc, eq, inArray, ne, notInArray, sql } from 'drizzle-orm';
import type { z } from 'zod';
import {
  confirmNameSchema,
  createTournamentSchema,
  registrationSchema,
  updateBasicsSchema,
  updateSettingsSchema,
} from '@/features/identity/schemas';
import type { TournamentRole } from '@/lib/schemas/domain';
import {
  INACTIVE_TOURNAMENT_STATUSES,
  JOINABLE_TOURNAMENT_STATUSES,
  type ParticipantKind,
  type TournamentStatus,
} from '@/lib/schemas/enums';
import {
  DEFAULT_SETTINGS,
  EDITABLE_AFTER_START,
  parseSettings,
  type TournamentSettings,
} from '@/lib/schemas/settings';
import { can } from '@/lib/permissions';
import { cryptoRandom } from '../../auth/tokens';
import { getDb, withTransaction, type Db } from '../../db/client';
import {
  joinRequests,
  leaders,
  memberships,
  players,
  teams,
  tournaments,
  users,
} from '../../db/schema';
import { badRequest, conflict, forbidden, isUniqueViolation, notFound } from '../../errors';
import { writeAudit } from '../audit';
import { lockTournament } from '../roster';
import { loadTournamentRole, requireRole } from '../roles';
import { afterRosterChange, publishStatus } from '../people/roster-events';

/** Tournaments (PLAN §1, §3.1, §4.1, §7.1, §7.2). */

export const isJoinable = (status: TournamentStatus): boolean =>
  (JOINABLE_TOURNAMENT_STATUSES as readonly string[]).includes(status);

export function assertSetupEditable(status: TournamentStatus): void {
  if (!isJoinable(status)) throw conflict('This is locked: the tournament has already started');
}

const LIVE_CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
function newLiveCode(): string {
  let s = '';
  for (let i = 0; i < 8; i++) {
    s += LIVE_CODE_ALPHABET[Math.floor(cryptoRandom() * LIVE_CODE_ALPHABET.length)];
  }
  return s;
}

export const ONE_ACTIVE_MESSAGE =
  'You already have an active tournament. Complete or cancel it before creating a new one.';

/** Settings from a tournament the caller organises (owner / co-admin), for "Copy settings from…". */
async function copyableSettings(
  userId: string,
  sourceId: string,
  db: Db,
): Promise<TournamentSettings> {
  const access = await loadTournamentRole(userId, sourceId, db);
  if (!access || !can(access.roles, 'settings:edit')) throw notFound();
  const [row] = await db
    .select({ settings: tournaments.settings })
    .from(tournaments)
    .where(eq(tournaments.id, sourceId));
  if (!row) throw notFound();
  return parseSettings(row.settings);
}

export interface CreatedTournament {
  id: string;
  name: string;
}

/** Create a tournament + the OWNER membership. One active per owner: the partial index → 409. */
export async function createTournament(
  userId: string,
  input: z.input<typeof createTournamentSchema>,
  db: Db = getDb(),
): Promise<CreatedTournament> {
  const data = createTournamentSchema.parse(input);
  const [user] = await db
    .select({ isOrganiser: users.isOrganiser })
    .from(users)
    .where(eq(users.id, userId));
  if (!user?.isOrganiser) throw forbidden('Only organiser accounts can create tournaments');
  const settings = data.copySettingsFrom
    ? await copyableSettings(userId, data.copySettingsFrom, db)
    : DEFAULT_SETTINGS;

  for (let attempt = 1; ; attempt++) {
    try {
      return await withTransaction(async (tx) => {
        const [row] = await tx
          .insert(tournaments)
          .values({
            ownerId: userId,
            name: data.name,
            settings: { ...settings },
            liveCode: newLiveCode(),
          })
          .returning({ id: tournaments.id, name: tournaments.name });
        await tx.insert(memberships).values({ tournamentId: row!.id, userId, role: 'OWNER' });
        await writeAudit(tx, {
          tournamentId: row!.id,
          actorUserId: userId,
          action: 'tournament.created',
          after: { name: data.name, copiedFrom: data.copySettingsFrom ?? null },
        });
        return row!;
      }, db);
    } catch (err) {
      if (isUniqueViolation(err, 'tournaments_one_active_per_owner_uq')) {
        throw conflict(ONE_ACTIVE_MESSAGE);
      }
      if (!isUniqueViolation(err, 'tournaments_live_code_uq') || attempt >= 5) throw err;
    }
  }
}

export interface TournamentDetail {
  id: string;
  name: string;
  logoUrl: string | null;
  status: TournamentStatus;
  settings: TournamentSettings;
  registrationOpen: boolean;
  maxRegistrations: number | null;
  liveCode: string;
  ownerId: string;
  ownerName: string;
  roles: TournamentRole[];
  startedAt: Date | null;
}

/** Tournament detail for organisers (owner / co-admin / auctioneer). */
export async function getTournamentForOrganiser(
  userId: string | null,
  tournamentId: string,
  db: Db = getDb(),
): Promise<TournamentDetail> {
  const access = await requireRole(userId, tournamentId, 'tournament:view-admin', db);
  return loadDetail(tournamentId, access.roles, db);
}

export async function loadDetail(
  tournamentId: string,
  roles: TournamentRole[],
  db: Db,
): Promise<TournamentDetail> {
  const [row] = await db
    .select({
      id: tournaments.id,
      name: tournaments.name,
      logoUrl: tournaments.logoUrl,
      status: tournaments.status,
      settings: tournaments.settings,
      registrationOpen: tournaments.registrationOpen,
      maxRegistrations: tournaments.maxRegistrations,
      liveCode: tournaments.liveCode,
      ownerId: tournaments.ownerId,
      ownerName: users.displayName,
      startedAt: tournaments.startedAt,
    })
    .from(tournaments)
    .innerJoin(users, eq(users.id, tournaments.ownerId))
    .where(eq(tournaments.id, tournamentId));
  if (!row) throw notFound();
  return { ...row, settings: parseSettings(row.settings), roles };
}

export async function updateBasics(
  userId: string,
  tournamentId: string,
  input: z.input<typeof updateBasicsSchema>,
  db: Db = getDb(),
): Promise<void> {
  const data = updateBasicsSchema.parse(input);
  await requireRole(userId, tournamentId, 'settings:edit', db);
  await withTransaction(async (tx, onCommit) => {
    const tour = await lockTournament(tx, tournamentId);
    assertSetupEditable(tour.status);
    await tx
      .update(tournaments)
      .set({ name: data.name, logoUrl: data.logoUrl ?? null })
      .where(eq(tournaments.id, tournamentId));
    await publishStatus(tx, tournamentId, onCommit);
  }, db);
}

/**
 * Save the Rules step. Before Start everything is editable. After Start only
 * EDITABLE_AFTER_START keys change freely; anything else is an admin override that needs a
 * reason and is written to the audit log (PLAN §1 "Rule", CLAUDE.md).
 */
export async function updateSettings(
  userId: string,
  tournamentId: string,
  input: z.input<typeof updateSettingsSchema>,
  db: Db = getDb(),
): Promise<TournamentSettings> {
  const { settings, reason } = updateSettingsSchema.parse(input);
  const access = await requireRole(userId, tournamentId, 'settings:edit', db);
  return withTransaction(async (tx, onCommit) => {
    const tour = await lockTournament(tx, tournamentId);
    if (tour.status === 'COMPLETED' || tour.status === 'CANCELLED') {
      throw conflict('This tournament is finished and read-only');
    }
    const before = parseSettings(tour.settings);
    const changed = (Object.keys(settings) as (keyof TournamentSettings)[]).filter(
      (k) => JSON.stringify(settings[k]) !== JSON.stringify(before[k]),
    );
    if (changed.length === 0) return before;

    if (!isJoinable(tour.status)) {
      const locked = changed.filter(
        (k) => !(EDITABLE_AFTER_START as readonly string[]).includes(k),
      );
      if (locked.length > 0) {
        if (!can(access.roles, 'admin:override')) throw forbidden();
        if (!reason) {
          throw badRequest('These settings are locked after Start. Give a reason to override.', {
            locked,
          });
        }
      }
      await writeAudit(tx, {
        tournamentId,
        actorUserId: userId,
        action: locked.length > 0 ? 'settings.override' : 'settings.updated',
        before: Object.fromEntries(changed.map((k) => [k, before[k]])),
        after: Object.fromEntries(changed.map((k) => [k, settings[k]])),
        reason: reason ?? null,
      });
    }
    await tx
      .update(tournaments)
      .set({ settings: { ...settings } })
      .where(eq(tournaments.id, tournamentId));
    if (isJoinable(tour.status)) {
      await afterRosterChange(tx, tournamentId, onCommit, {
        type: 'people.updated',
        data: { kind: 'REGISTRATION' },
      });
    } else {
      await publishStatus(tx, tournamentId, onCommit);
    }
    return settings;
  }, db);
}

/** Organiser-key sign-ups: open / closed + optional cap (§2.3 B). Only before Start. */
export async function setRegistration(
  userId: string,
  tournamentId: string,
  input: z.input<typeof registrationSchema>,
  db: Db = getDb(),
): Promise<void> {
  const data = registrationSchema.parse(input);
  await requireRole(userId, tournamentId, 'settings:edit', db);
  await withTransaction(async (tx, onCommit) => {
    const tour = await lockTournament(tx, tournamentId);
    assertSetupEditable(tour.status);
    await tx
      .update(tournaments)
      .set({ registrationOpen: data.registrationOpen, maxRegistrations: data.maxRegistrations })
      .where(eq(tournaments.id, tournamentId));
    await afterRosterChange(tx, tournamentId, onCommit, {
      type: 'people.updated',
      data: { kind: 'REGISTRATION' },
    });
  }, db);
}

const namesMatch = (a: string, b: string): boolean =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

/** Owner abandons the tournament (type the name to confirm). Frees the active slot (§1). */
export async function cancelTournament(
  userId: string,
  tournamentId: string,
  input: z.input<typeof confirmNameSchema>,
  db: Db = getDb(),
): Promise<void> {
  const { confirmName } = confirmNameSchema.parse(input);
  await requireRole(userId, tournamentId, 'tournament:delete', db);
  await withTransaction(async (tx, onCommit) => {
    const tour = await lockTournament(tx, tournamentId);
    if (tour.status === 'COMPLETED' || tour.status === 'CANCELLED') {
      throw conflict('This tournament is already finished');
    }
    if (!namesMatch(confirmName, tour.name)) {
      throw badRequest('Type the tournament name exactly to confirm');
    }
    await tx
      .update(tournaments)
      .set({ status: 'CANCELLED', cancelledAt: sql`now()`, registrationOpen: false })
      .where(eq(tournaments.id, tournamentId));
    await tx
      .update(joinRequests)
      .set({ status: 'EXPIRED', respondedAt: sql`now()` })
      .where(and(eq(joinRequests.tournamentId, tournamentId), eq(joinRequests.status, 'PENDING')));
    await writeAudit(tx, {
      tournamentId,
      actorUserId: userId,
      action: 'tournament.cancelled',
      before: { status: tour.status },
      after: { status: 'CANCELLED' },
    });
    await publishStatus(tx, tournamentId, onCommit);
  }, db);
}

// ─── "My tournaments" (dashboard + switcher) ──────────────────────────────────────────────

export interface MyTournament {
  id: string;
  name: string;
  status: TournamentStatus;
  ownerName: string;
  roles: TournamentRole[];
  /** My own key sign-up still waiting for approval (not a role). */
  pending: ParticipantKind | null;
  /** Rejected key sign-up. */
  rejected: ParticipantKind | null;
  myTeam: { name: string; shortName: string; color: string } | null;
  createdAt: Date;
}

const APPROVED_SOLDIER = new Set(['POOL', 'ON_BLOCK', 'SOLD', 'UNSOLD', 'ALLOCATED']);

/** Every tournament I'm in, with my role(s) — never anyone else's (§2.0, `GET /api/me/tournaments`). */
export async function listMyTournaments(userId: string, db: Db = getDb()): Promise<MyTournament[]> {
  const [mems, caps, sols] = await Promise.all([
    db
      .select({ tid: memberships.tournamentId, role: memberships.role })
      .from(memberships)
      .where(eq(memberships.userId, userId)),
    db
      .select({
        tid: leaders.tournamentId,
        approval: leaders.approval,
        teamName: teams.name,
        teamShort: teams.shortName,
        teamColor: teams.color,
      })
      .from(leaders)
      .leftJoin(teams, eq(teams.leaderId, leaders.id))
      .where(eq(leaders.userId, userId)),
    db
      .select({ tid: players.tournamentId, status: players.status, teamId: players.teamId })
      .from(players)
      .where(eq(players.userId, userId)),
  ]);
  const ids = [...new Set([...mems, ...caps, ...sols].map((r) => r.tid))];
  if (ids.length === 0) return [];

  const tours = await db
    .select({
      id: tournaments.id,
      name: tournaments.name,
      status: tournaments.status,
      ownerName: users.displayName,
      createdAt: tournaments.createdAt,
    })
    .from(tournaments)
    .innerJoin(users, eq(users.id, tournaments.ownerId))
    .where(inArray(tournaments.id, ids))
    .orderBy(desc(tournaments.createdAt));

  // Soldier's team (bought / allocated) for the card colour.
  const soldierTeamIds = sols.map((s) => s.teamId).filter((x): x is string => x !== null);
  const soldierTeams = soldierTeamIds.length
    ? await db
        .select({ id: teams.id, name: teams.name, shortName: teams.shortName, color: teams.color })
        .from(teams)
        .where(inArray(teams.id, soldierTeamIds))
    : [];

  return tours.map((t) => {
    const roles: TournamentRole[] = [];
    const mem = mems.find((m) => m.tid === t.id);
    if (mem) roles.push(mem.role);
    const cap = caps.find((c) => c.tid === t.id);
    const sol = sols.find((s) => s.tid === t.id);
    if (cap?.approval === 'APPROVED') roles.push('CAPTAIN');
    if (sol && APPROVED_SOLDIER.has(sol.status)) roles.push('SOLDIER');
    const pending: ParticipantKind | null =
      cap?.approval === 'PENDING' ? 'LEADER' : sol?.status === 'PENDING_APPROVAL' ? 'PLAYER' : null;
    const rejected: ParticipantKind | null =
      cap?.approval === 'REJECTED' ? 'LEADER' : sol?.status === 'REJECTED' ? 'PLAYER' : null;
    const captainTeam =
      cap?.approval === 'APPROVED' && cap.teamName && cap.teamShort && cap.teamColor
        ? { name: cap.teamName, shortName: cap.teamShort, color: cap.teamColor }
        : null;
    const soldierTeam = sol?.teamId
      ? (soldierTeams.find((x) => x.id === sol.teamId) ?? null)
      : null;
    return {
      ...t,
      roles,
      pending,
      rejected,
      myTeam: captainTeam ?? (soldierTeam ? { ...soldierTeam } : null),
    };
  });
}

export interface RosterCounts {
  captains: number;
  soldiers: number;
  pendingCaptains: number;
  pendingSoldiers: number;
}

export async function rosterCounts(db: Db, tournamentId: string): Promise<RosterCounts> {
  const [l] = await db
    .select({
      approved: sql<number>`count(*) filter (where ${leaders.approval} = 'APPROVED')`,
      pending: sql<number>`count(*) filter (where ${leaders.approval} = 'PENDING')`,
    })
    .from(leaders)
    .where(eq(leaders.tournamentId, tournamentId));
  const [p] = await db
    .select({
      approved: sql<number>`count(*) filter (where ${players.status} not in ('PENDING_APPROVAL', 'REJECTED'))`,
      pending: sql<number>`count(*) filter (where ${players.status} = 'PENDING_APPROVAL')`,
    })
    .from(players)
    .where(eq(players.tournamentId, tournamentId));
  return {
    captains: Number(l?.approved ?? 0),
    pendingCaptains: Number(l?.pending ?? 0),
    soldiers: Number(p?.approved ?? 0),
    pendingSoldiers: Number(p?.pending ?? 0),
  };
}

export interface OrganiserDashboard {
  active: (TournamentDetail & { counts: RosterCounts }) | null;
  organisingForOthers: MyTournament[];
  archive: MyTournament[];
  copySources: { id: string; name: string; status: TournamentStatus }[];
}

/** Organiser half of the dashboard (§7.1). */
export async function getOrganiserDashboard(
  userId: string,
  mine: MyTournament[],
  db: Db = getDb(),
): Promise<OrganiserDashboard> {
  const [activeRow] = await db
    .select({ id: tournaments.id })
    .from(tournaments)
    .where(
      and(
        eq(tournaments.ownerId, userId),
        notInArray(tournaments.status, [...INACTIVE_TOURNAMENT_STATUSES]),
      ),
    )
    .limit(1);
  const active = activeRow
    ? {
        ...(await loadDetail(activeRow.id, ['OWNER'], db)),
        counts: await rosterCounts(db, activeRow.id),
      }
    : null;
  const inactive = new Set<TournamentStatus>(INACTIVE_TOURNAMENT_STATUSES);
  return {
    active,
    organisingForOthers: mine.filter(
      (t) =>
        !inactive.has(t.status) &&
        t.roles.some((r) => r === 'CO_ADMIN' || r === 'AUCTIONEER') &&
        !t.roles.includes('OWNER'),
    ),
    archive: mine.filter((t) => inactive.has(t.status) && t.roles.includes('OWNER')),
    copySources: mine
      .filter((t) => t.roles.includes('OWNER') || t.roles.includes('CO_ADMIN'))
      .map((t) => ({ id: t.id, name: t.name, status: t.status })),
  };
}

/** Non-rejected key sign-ups vs the cap, for the "23 registered · 4 pending" counter. */
export async function registrationCounter(
  db: Db,
  tournamentId: string,
): Promise<{ registered: number; pending: number }> {
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
  const counts = await rosterCounts(db, tournamentId);
  return {
    registered: Number(l?.n ?? 0) + Number(p?.n ?? 0),
    pending: counts.pendingCaptains + counts.pendingSoldiers,
  };
}
