import 'server-only';
import { and, eq, sql } from 'drizzle-orm';
import type { ParticipantKind, TournamentStatus } from '@/lib/schemas/enums';
import { getDb, withTransaction, type Db } from '../../db/client';
import { leaders, players, teams, tournaments, users } from '../../db/schema';
import { conflict, notFound } from '../../errors';
import { enforceRateLimit } from '../../rate-limit';
import { lockTournament } from '../roster';
import { decodeInviteToken, type InvitePayload } from '../people/links';
import { afterRosterChange } from '../people/roster-events';
import { alreadyInTournament, findExistingSpot } from './exclusion';

/**
 * Path A claim (PLAN §2.2, §7.4): `/i/<token>` → preview → register or log in → claim once.
 * Invalid / tampered / regenerated / deleted / finished → the same generic 404.
 */

export interface InvitePreview {
  kind: ParticipantKind;
  tournamentId: string;
  tournamentName: string;
  tournamentLogoUrl: string | null;
  tournamentStatus: TournamentStatus;
  organiserName: string;
  spot: { name: string; ign: string | null; purse: number | null; basePrice: number | null };
  claimed: boolean;
  claimedByMe: boolean;
}

const FINISHED = new Set<TournamentStatus>(['COMPLETED', 'CANCELLED']);

interface SpotRow {
  id: string;
  tournamentId: string;
  userId: string | null;
  name: string;
  ign: string | null;
  linkVersion: number;
  inviteStatus: string;
  purse: number | null;
  basePrice: number | null;
}

async function loadSpot(db: Db, p: InvitePayload, lock: boolean): Promise<SpotRow | null> {
  if (p.k === 'L') {
    const q = db
      .select({
        id: leaders.id,
        tournamentId: leaders.tournamentId,
        userId: leaders.userId,
        name: leaders.name,
        ign: leaders.ign,
        linkVersion: leaders.linkVersion,
        inviteStatus: leaders.inviteStatus,
        purse: leaders.purseTotal,
        approval: leaders.approval,
      })
      .from(leaders)
      .where(and(eq(leaders.id, p.id), eq(leaders.tournamentId, p.tid)));
    const [row] = lock ? await q.for('update') : await q;
    if (!row || row.approval !== 'APPROVED') return null;
    return { ...row, basePrice: null };
  }
  const q = db
    .select({
      id: players.id,
      tournamentId: players.tournamentId,
      userId: players.userId,
      name: players.name,
      ign: players.ign,
      linkVersion: players.linkVersion,
      inviteStatus: players.inviteStatus,
      basePrice: players.basePrice,
      status: players.status,
    })
    .from(players)
    .where(and(eq(players.id, p.id), eq(players.tournamentId, p.tid)));
  const [row] = lock ? await q.for('update') : await q;
  if (!row || row.status === 'PENDING_APPROVAL' || row.status === 'REJECTED') return null;
  return { ...row, purse: null };
}

/** GET /api/invites/:token — preview; marks the link "Opened" the first time. */
export async function previewInvite(
  token: string,
  ip: string,
  viewerUserId: string | null,
  db: Db = getDb(),
): Promise<InvitePreview> {
  await enforceRateLimit(`invite-view:ip:${ip}`, 60, 600, db);
  const payload = decodeInviteToken(token);
  if (!payload) throw notFound();
  const spot = await loadSpot(db, payload, false);
  if (!spot || spot.linkVersion !== payload.v) throw notFound();
  const [tour] = await db
    .select({
      name: tournaments.name,
      logoUrl: tournaments.logoUrl,
      status: tournaments.status,
      organiserName: users.displayName,
    })
    .from(tournaments)
    .innerJoin(users, eq(users.id, tournaments.ownerId))
    .where(eq(tournaments.id, payload.tid));
  if (!tour || FINISHED.has(tour.status)) throw notFound();

  if (spot.userId === null && spot.inviteStatus === 'NOT_OPENED') {
    await withTransaction(async (tx, onCommit) => {
      const table = payload.k === 'L' ? leaders : players;
      const [changed] = await tx
        .update(table)
        .set({ inviteStatus: 'OPENED', lastActivityAt: sql`now()` })
        .where(and(eq(table.id, spot.id), eq(table.inviteStatus, 'NOT_OPENED')))
        .returning({ id: table.id });
      if (changed) {
        await afterRosterChange(tx, payload.tid, onCommit, {
          type: 'people.updated',
          data: { kind: payload.k === 'L' ? 'LEADER' : 'PLAYER', ids: [spot.id] },
        });
      }
    }, db);
  }

  return {
    kind: payload.k === 'L' ? 'LEADER' : 'PLAYER',
    tournamentId: payload.tid,
    tournamentName: tour.name,
    tournamentLogoUrl: tour.logoUrl,
    tournamentStatus: tour.status,
    organiserName: tour.organiserName,
    spot: { name: spot.name, ign: spot.ign, purse: spot.purse, basePrice: spot.basePrice },
    claimed: spot.userId !== null,
    claimedByMe: viewerUserId !== null && spot.userId === viewerUserId,
  };
}

export interface ClaimResult {
  kind: ParticipantKind;
  tournamentId: string;
  recordId: string;
}

/**
 * POST /api/invites/:token/claim — link my account to this spot (one-time). Runs under the
 * tournament lock, so nobody ends up as both captain and soldier.
 */
export async function claimInvite(
  userId: string,
  token: string,
  db: Db = getDb(),
): Promise<ClaimResult> {
  await enforceRateLimit(`invite-claim:user:${userId}`, 20, 600, db);
  const payload = decodeInviteToken(token);
  if (!payload) throw notFound();
  const kind: ParticipantKind = payload.k === 'L' ? 'LEADER' : 'PLAYER';

  return withTransaction(async (tx, onCommit) => {
    const tour = await lockTournament(tx, payload.tid);
    if (FINISHED.has(tour.status)) throw notFound();
    const spot = await loadSpot(tx, payload, true);
    if (!spot || spot.linkVersion !== payload.v) throw notFound();
    if (spot.userId === userId) return { kind, tournamentId: payload.tid, recordId: spot.id };
    if (spot.userId !== null) throw conflict('This spot is already taken');

    const existing = await findExistingSpot(tx, payload.tid, userId);
    if (existing) throw alreadyInTournament(existing);

    const [me] = await tx
      .select({ ign: users.ign, photoUrl: users.photoUrl, phone: users.phone })
      .from(users)
      .where(eq(users.id, userId));
    if (!me) throw notFound();

    if (kind === 'LEADER') {
      const [team] = await tx
        .select({ id: teams.id })
        .from(teams)
        .where(eq(teams.leaderId, spot.id));
      await tx
        .update(leaders)
        .set({
          userId,
          inviteStatus: team ? 'TEAM_READY' : 'ACCOUNT_LINKED',
          lastActivityAt: sql`now()`,
          ign: sql`coalesce(${leaders.ign}, ${me.ign})`,
          photoUrl: sql`coalesce(${leaders.photoUrl}, ${me.photoUrl})`,
          phone: sql`coalesce(${leaders.phone}, ${me.phone})`,
        })
        .where(eq(leaders.id, spot.id));
    } else {
      await tx
        .update(players)
        .set({
          userId,
          inviteStatus: 'ACCOUNT_LINKED',
          lastActivityAt: sql`now()`,
          ign: sql`coalesce(${players.ign}, ${me.ign})`,
          photoUrl: sql`coalesce(${players.photoUrl}, ${me.photoUrl})`,
          phone: sql`coalesce(${players.phone}, ${me.phone})`,
        })
        .where(eq(players.id, spot.id));
    }
    await afterRosterChange(tx, payload.tid, onCommit, {
      type: 'people.updated',
      data: { kind, ids: [spot.id] },
    });
    return { kind, tournamentId: payload.tid, recordId: spot.id };
  }, db);
}
