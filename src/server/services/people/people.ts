import 'server-only';
import { and, asc, eq } from 'drizzle-orm';
import type { z } from 'zod';
import {
  addPersonSchema,
  importPeopleSchema,
  updateLeaderSchema,
  updatePlayerSchema,
} from '@/features/identity/schemas';
import { findDuplicatePeople } from '@/lib/rules/validateReadyToStart';
import type {
  JoinSource,
  LeaderApproval,
  LeaderInviteStatus,
  ParticipantKind,
  PlayerInviteStatus,
  PlayerStatus,
} from '@/lib/schemas/enums';
import { parseSettings, type TournamentSettings } from '@/lib/schemas/settings';
import { getDb, withTransaction, type Db, type Tx } from '../../db/client';
import { leaders, players, teams, tournaments } from '../../db/schema';
import { badRequest, conflict, notFound } from '../../errors';
import { writeAudit } from '../audit';
import { lockTournament } from '../roster';
import { requireRole } from '../roles';
import { assertSetupEditable } from '../tournaments/tournaments';
import { personalLink } from './links';
import { afterRosterChange } from './roster-events';

/**
 * Captains and soldiers as organisers see them (PLAN §2.2, §7.2 step 3). Path A: organisers add
 * people directly; each row gets a personal link and is approved at once.
 */

export type PersonKind = ParticipantKind;

function ruleErr(field: string, message: string): Error {
  return badRequest(message, { issues: { [field]: [message] } });
}

function checkAmounts(
  settings: TournamentSettings,
  kind: PersonKind,
  amount: number | undefined,
): number {
  if (kind === 'LEADER') return amount ?? settings.defaultPurse;
  const price = amount ?? settings.minBasePrice;
  if (price < settings.minBasePrice) {
    throw ruleErr('basePrice', `Base price can’t be below ${settings.minBasePrice} MP`);
  }
  return price;
}

export interface AddedPerson {
  kind: PersonKind;
  id: string;
  name: string;
  link: string;
}

async function insertPerson(
  tx: Tx,
  tournamentId: string,
  settings: TournamentSettings,
  input: z.output<typeof addPersonSchema>,
): Promise<AddedPerson> {
  const base = {
    tournamentId,
    name: input.name,
    ign: input.ign ?? null,
    phone: input.phone ?? null,
    source: 'ADDED_BY_ORGANISER' as const,
  };
  if (input.type === 'LEADER') {
    const purse = checkAmounts(settings, 'LEADER', input.purse);
    const [row] = await tx
      .insert(leaders)
      .values({ ...base, approval: 'APPROVED', purseTotal: purse, purseRemaining: purse })
      .returning({ id: leaders.id, v: leaders.linkVersion });
    return {
      kind: 'LEADER',
      id: row!.id,
      name: input.name,
      link: personalLink('LEADER', row!.id, tournamentId, row!.v),
    };
  }
  const basePrice = checkAmounts(settings, 'PLAYER', input.basePrice);
  const [row] = await tx
    .insert(players)
    .values({ ...base, status: 'POOL', basePrice })
    .returning({ id: players.id, v: players.linkVersion });
  return {
    kind: 'PLAYER',
    id: row!.id,
    name: input.name,
    link: personalLink('PLAYER', row!.id, tournamentId, row!.v),
  };
}

/** "Add person" drawer (path A): an approved captain or soldier with a personal link. */
export async function addPerson(
  userId: string,
  tournamentId: string,
  input: z.input<typeof addPersonSchema>,
  db: Db = getDb(),
): Promise<AddedPerson> {
  const data = addPersonSchema.parse(input);
  await requireRole(userId, tournamentId, 'people:manage', db);
  return withTransaction(async (tx, onCommit) => {
    const tour = await lockTournament(tx, tournamentId);
    assertSetupEditable(tour.status);
    const added = await insertPerson(tx, tournamentId, parseSettings(tour.settings), data);
    await afterRosterChange(tx, tournamentId, onCommit, {
      type: 'people.updated',
      data: { kind: added.kind, ids: [added.id] },
    });
    return added;
  }, db);
}

/** CSV / Excel import (already mapped + validated client-side; re-validated here). All or nothing. */
export async function importPeople(
  userId: string,
  tournamentId: string,
  input: z.input<typeof importPeopleSchema>,
  db: Db = getDb(),
): Promise<AddedPerson[]> {
  const { rows } = importPeopleSchema.parse(input);
  await requireRole(userId, tournamentId, 'people:manage', db);
  return withTransaction(async (tx, onCommit) => {
    const tour = await lockTournament(tx, tournamentId);
    assertSetupEditable(tour.status);
    const settings = parseSettings(tour.settings);
    const added: AddedPerson[] = [];
    for (const [i, row] of rows.entries()) {
      try {
        added.push(await insertPerson(tx, tournamentId, settings, row));
      } catch (err) {
        throw badRequest(`Row ${i + 1}: ${err instanceof Error ? err.message : 'invalid'}`);
      }
    }
    await writeAudit(tx, {
      tournamentId,
      actorUserId: userId,
      action: 'people.imported',
      after: { count: added.length },
    });
    await afterRosterChange(tx, tournamentId, onCommit, {
      type: 'people.updated',
      data: { ids: added.map((a) => a.id) },
    });
    return added;
  }, db);
}

// ─── Listing ──────────────────────────────────────────────────────────────────────────────

export interface CaptainRow {
  id: string;
  userId: string | null;
  name: string;
  ign: string | null;
  phone: string | null;
  photoUrl: string | null;
  source: JoinSource;
  approval: LeaderApproval;
  rejectReason: string | null;
  purseTotal: number;
  inviteStatus: LeaderInviteStatus;
  lastActivityAt: Date | null;
  createdAt: Date;
  team: { id: string; name: string; shortName: string; color: string; emoji: string | null } | null;
  duplicate: boolean;
}

export interface SoldierRow {
  id: string;
  userId: string | null;
  name: string;
  ign: string | null;
  phone: string | null;
  photoUrl: string | null;
  source: JoinSource;
  status: PlayerStatus;
  rejectReason: string | null;
  basePrice: number;
  inviteStatus: PlayerInviteStatus;
  lastActivityAt: Date | null;
  createdAt: Date;
  duplicate: boolean;
}

export interface Roster {
  captains: CaptainRow[];
  soldiers: SoldierRow[];
}

/** Both tabs for organisers (any organiser role; auctioneers view only). */
export async function listRoster(
  userId: string | null,
  tournamentId: string,
  db: Db = getDb(),
): Promise<Roster> {
  await requireRole(userId, tournamentId, 'tournament:view-admin', db);
  return loadRoster(db, tournamentId);
}

export async function loadRoster(db: Db, tournamentId: string): Promise<Roster> {
  const capRows = await db
    .select({
      id: leaders.id,
      userId: leaders.userId,
      name: leaders.name,
      ign: leaders.ign,
      phone: leaders.phone,
      photoUrl: leaders.photoUrl,
      source: leaders.source,
      approval: leaders.approval,
      rejectReason: leaders.rejectReason,
      purseTotal: leaders.purseTotal,
      inviteStatus: leaders.inviteStatus,
      lastActivityAt: leaders.lastActivityAt,
      createdAt: leaders.createdAt,
      teamId: teams.id,
      teamName: teams.name,
      teamShort: teams.shortName,
      teamColor: teams.color,
      teamEmoji: teams.emoji,
    })
    .from(leaders)
    .leftJoin(teams, eq(teams.leaderId, leaders.id))
    .where(eq(leaders.tournamentId, tournamentId))
    .orderBy(asc(leaders.createdAt));
  const solRows = await db
    .select({
      id: players.id,
      userId: players.userId,
      name: players.name,
      ign: players.ign,
      phone: players.phone,
      photoUrl: players.photoUrl,
      source: players.source,
      status: players.status,
      rejectReason: players.rejectReason,
      basePrice: players.basePrice,
      inviteStatus: players.inviteStatus,
      lastActivityAt: players.lastActivityAt,
      createdAt: players.createdAt,
    })
    .from(players)
    .where(eq(players.tournamentId, tournamentId))
    .orderBy(asc(players.createdAt));

  const dupes = new Set(
    findDuplicatePeople([
      ...capRows.filter((c) => c.approval !== 'REJECTED'),
      ...solRows.filter((s) => s.status !== 'REJECTED'),
    ]),
  );
  return {
    captains: capRows.map(({ teamId, teamName, teamShort, teamColor, teamEmoji, ...c }) => ({
      ...c,
      team:
        teamId && teamName && teamShort && teamColor
          ? { id: teamId, name: teamName, shortName: teamShort, color: teamColor, emoji: teamEmoji }
          : null,
      duplicate: dupes.has(c.id),
    })),
    soldiers: solRows.map((s) => ({ ...s, duplicate: dupes.has(s.id) })),
  };
}

// ─── Per-row actions ──────────────────────────────────────────────────────────────────────

async function loadRow(tx: Db, tournamentId: string, kind: PersonKind, id: string) {
  const table = kind === 'LEADER' ? leaders : players;
  const [row] = await tx
    .select({
      id: table.id,
      userId: table.userId,
      name: table.name,
      linkVersion: table.linkVersion,
    })
    .from(table)
    .where(and(eq(table.id, id), eq(table.tournamentId, tournamentId)))
    .for('update');
  if (!row) throw notFound();
  return row;
}

/** Personal share URL (captains AND soldiers). */
export async function getPersonLink(
  userId: string,
  tournamentId: string,
  kind: PersonKind,
  id: string,
  db: Db = getDb(),
): Promise<{ link: string; claimed: boolean }> {
  await requireRole(userId, tournamentId, 'people:manage', db);
  const table = kind === 'LEADER' ? leaders : players;
  const [row] = await db
    .select({ v: table.linkVersion, userId: table.userId })
    .from(table)
    .where(and(eq(table.id, id), eq(table.tournamentId, tournamentId)));
  if (!row) throw notFound();
  return { link: personalLink(kind, id, tournamentId, row.v), claimed: row.userId !== null };
}

/** Regenerate: bump `link_version` so the old link dies at once. */
export async function regeneratePersonLink(
  userId: string,
  tournamentId: string,
  kind: PersonKind,
  id: string,
  db: Db = getDb(),
): Promise<{ link: string }> {
  await requireRole(userId, tournamentId, 'people:manage', db);
  return withTransaction(async (tx, onCommit) => {
    const tour = await lockTournament(tx, tournamentId);
    if (tour.status === 'COMPLETED' || tour.status === 'CANCELLED') throw notFound();
    const row = await loadRow(tx, tournamentId, kind, id);
    const v = row.linkVersion + 1;
    if (kind === 'LEADER') {
      await tx
        .update(leaders)
        .set({
          linkVersion: v,
          ...(row.userId ? {} : { inviteStatus: 'NOT_OPENED' as const }),
        })
        .where(eq(leaders.id, id));
    } else {
      await tx
        .update(players)
        .set({
          linkVersion: v,
          ...(row.userId ? {} : { inviteStatus: 'NOT_OPENED' as const }),
        })
        .where(eq(players.id, id));
    }
    await writeAudit(tx, {
      tournamentId,
      actorUserId: userId,
      action: 'people.link_regenerated',
      after: { kind, id },
    });
    await afterRosterChange(tx, tournamentId, onCommit, {
      type: 'people.updated',
      data: { kind, ids: [id] },
    });
    return { link: personalLink(kind, id, tournamentId, v) };
  }, db);
}

/** Unlink account: free a wrongly claimed spot (audit-logged). The link is regenerated too. */
export async function unlinkPerson(
  userId: string,
  tournamentId: string,
  kind: PersonKind,
  id: string,
  db: Db = getDb(),
): Promise<void> {
  await requireRole(userId, tournamentId, 'people:manage', db);
  await withTransaction(async (tx, onCommit) => {
    const tour = await lockTournament(tx, tournamentId);
    if (tour.status === 'COMPLETED' || tour.status === 'CANCELLED') throw notFound();
    const row = await loadRow(tx, tournamentId, kind, id);
    if (!row.userId) throw conflict('Nobody has claimed this spot yet');
    const reset = {
      userId: null,
      inviteStatus: 'NOT_OPENED' as const,
      linkVersion: row.linkVersion + 1,
      lastActivityAt: null,
    };
    if (kind === 'LEADER') await tx.update(leaders).set(reset).where(eq(leaders.id, id));
    else await tx.update(players).set(reset).where(eq(players.id, id));
    await writeAudit(tx, {
      tournamentId,
      actorUserId: userId,
      action: 'people.unlinked',
      before: { kind, id, userId: row.userId },
      after: { kind, id, userId: null },
    });
    await afterRosterChange(tx, tournamentId, onCommit, {
      type: 'people.updated',
      data: { kind, ids: [id] },
    });
  }, db);
}

/** Edit a captain (name, IGN, phone, purse) before Start. */
export async function updateLeader(
  userId: string,
  tournamentId: string,
  id: string,
  input: z.input<typeof updateLeaderSchema>,
  db: Db = getDb(),
): Promise<void> {
  const data = updateLeaderSchema.parse(input);
  await requireRole(userId, tournamentId, 'people:approve', db);
  await withTransaction(async (tx, onCommit) => {
    const tour = await lockTournament(tx, tournamentId);
    assertSetupEditable(tour.status);
    await loadRow(tx, tournamentId, 'LEADER', id);
    await tx
      .update(leaders)
      .set({
        name: data.name,
        ign: data.ign ?? null,
        phone: data.phone ?? null,
        purseTotal: data.purse,
        purseRemaining: data.purse,
      })
      .where(eq(leaders.id, id));
    await afterRosterChange(tx, tournamentId, onCommit, {
      type: 'people.updated',
      data: { kind: 'LEADER', ids: [id] },
    });
  }, db);
}

/** Edit a soldier (name, IGN, phone, base price ≥ minBasePrice) before Start. */
export async function updatePlayer(
  userId: string,
  tournamentId: string,
  id: string,
  input: z.input<typeof updatePlayerSchema>,
  db: Db = getDb(),
): Promise<void> {
  const data = updatePlayerSchema.parse(input);
  await requireRole(userId, tournamentId, 'people:approve', db);
  await withTransaction(async (tx, onCommit) => {
    const tour = await lockTournament(tx, tournamentId);
    assertSetupEditable(tour.status);
    checkAmounts(parseSettings(tour.settings), 'PLAYER', data.basePrice);
    await loadRow(tx, tournamentId, 'PLAYER', id);
    await tx
      .update(players)
      .set({
        name: data.name,
        ign: data.ign ?? null,
        phone: data.phone ?? null,
        basePrice: data.basePrice,
      })
      .where(eq(players.id, id));
    await afterRosterChange(tx, tournamentId, onCommit, {
      type: 'people.updated',
      data: { kind: 'PLAYER', ids: [id] },
    });
  }, db);
}

/** Remove a captain (and their team) or a soldier before Start. */
export async function removePerson(
  userId: string,
  tournamentId: string,
  kind: PersonKind,
  id: string,
  db: Db = getDb(),
): Promise<void> {
  await requireRole(userId, tournamentId, 'people:manage', db);
  await withTransaction(async (tx, onCommit) => {
    const tour = await lockTournament(tx, tournamentId);
    assertSetupEditable(tour.status);
    const row = await loadRow(tx, tournamentId, kind, id);
    if (kind === 'LEADER') await tx.delete(leaders).where(eq(leaders.id, id));
    else await tx.delete(players).where(eq(players.id, id));
    await writeAudit(tx, {
      tournamentId,
      actorUserId: userId,
      action: 'people.removed',
      before: { kind, id, name: row.name, userId: row.userId },
    });
    await afterRosterChange(tx, tournamentId, onCommit, {
      type: 'people.updated',
      data: { kind, ids: [id] },
    });
  }, db);
}

/** Small helper for other Lane A services: the tournament's parsed settings. */
export async function loadSettings(db: Db, tournamentId: string): Promise<TournamentSettings> {
  const [row] = await db
    .select({ settings: tournaments.settings })
    .from(tournaments)
    .where(eq(tournaments.id, tournamentId));
  if (!row) throw notFound();
  return parseSettings(row.settings);
}

export { checkAmounts };
