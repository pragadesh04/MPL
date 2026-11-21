import 'server-only';
import { and, eq } from 'drizzle-orm';
import { can } from '@/lib/permissions';
import type { Permission, TournamentRole } from '@/lib/schemas/domain';
import type { MembershipRole, TournamentStatus } from '@/lib/schemas/enums';
import { getDb, type Db } from '../db/client';
import { leaders, memberships, players, teams, tournaments } from '../db/schema';
import { forbidden, notFound } from '../errors';

/**
 * Per-tournament roles (PLAN §2.1, §2.4, §5 "Access control"). There is NO global role and no
 * "current tournament" in the session: every request resolves (userId, tournamentId) here.
 *
 * Only APPROVED captain rows and approved soldier rows (any status except PENDING_APPROVAL /
 * REJECTED) count as roles. Pending people get no role (→ 404 on tournament routes); their own
 * "waiting for approval" card is served from `access.pending`.
 */
export interface TournamentAccess {
  userId: string;
  tournamentId: string;
  ownerId: string;
  status: TournamentStatus;
  /** Every role held, e.g. ['CO_ADMIN', 'CAPTAIN']. Empty = no access. */
  roles: TournamentRole[];
  membershipRole: MembershipRole | null;
  /** Set when the user is an approved captain. */
  leaderId: string | null;
  /** The captain's team, once set up. */
  teamId: string | null;
  /** Set when the user is an approved soldier. */
  playerId: string | null;
  /** The user's own rows still waiting for approval (key sign-ups). Not a role. */
  pending: { leaderId: string | null; playerId: string | null };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const APPROVED_PLAYER_STATUSES = new Set(['POOL', 'ON_BLOCK', 'SOLD', 'UNSOLD', 'ALLOCATED']);

/**
 * Resolve the user's role(s) in one tournament with one query (tournament ⟕ membership ⟕
 * captain ⟕ team ⟕ soldier). Returns null when the tournament doesn't exist.
 */
export async function loadTournamentRole(
  userId: string,
  tournamentId: string,
  db: Db = getDb(),
): Promise<TournamentAccess | null> {
  // A malformed id from the URL is just "not found", never a 500.
  if (!UUID_RE.test(tournamentId) || !UUID_RE.test(userId)) return null;
  const [row] = await db
    .select({
      ownerId: tournaments.ownerId,
      status: tournaments.status,
      membershipRole: memberships.role,
      leaderId: leaders.id,
      leaderApproval: leaders.approval,
      teamId: teams.id,
      playerId: players.id,
      playerStatus: players.status,
    })
    .from(tournaments)
    .leftJoin(
      memberships,
      and(eq(memberships.tournamentId, tournaments.id), eq(memberships.userId, userId)),
    )
    .leftJoin(leaders, and(eq(leaders.tournamentId, tournaments.id), eq(leaders.userId, userId)))
    .leftJoin(teams, eq(teams.leaderId, leaders.id))
    .leftJoin(players, and(eq(players.tournamentId, tournaments.id), eq(players.userId, userId)))
    .where(eq(tournaments.id, tournamentId))
    .limit(1);

  if (!row) return null;

  const roles: TournamentRole[] = [];
  if (row.membershipRole) roles.push(row.membershipRole);
  const isCaptain = row.leaderId !== null && row.leaderApproval === 'APPROVED';
  const isSoldier = row.playerId !== null && APPROVED_PLAYER_STATUSES.has(row.playerStatus ?? '');
  if (isCaptain) roles.push('CAPTAIN');
  if (isSoldier) roles.push('SOLDIER');

  return {
    userId,
    tournamentId,
    ownerId: row.ownerId,
    status: row.status,
    roles,
    membershipRole: row.membershipRole,
    leaderId: isCaptain ? row.leaderId : null,
    teamId: isCaptain ? row.teamId : null,
    playerId: isSoldier ? row.playerId : null,
    pending: {
      leaderId: row.leaderId !== null && row.leaderApproval === 'PENDING' ? row.leaderId : null,
      playerId:
        row.playerId !== null && row.playerStatus === 'PENDING_APPROVAL' ? row.playerId : null,
    },
  };
}

/**
 * Load the role and check `permission` against the §2.4 table.
 * - not logged in / no role in this tournament / tournament missing → 404 (never reveal it exists)
 * - a participant whose role lacks the permission → 403
 */
export async function requireRole(
  userId: string | null,
  tournamentId: string,
  permission: Permission,
  db: Db = getDb(),
): Promise<TournamentAccess> {
  if (!userId) throw notFound();
  const access = await loadTournamentRole(userId, tournamentId, db);
  if (!access || access.roles.length === 0) throw notFound();
  if (!can(access.roles, permission)) throw forbidden();
  return access;
}

/** Same as `requireRole(…, 'tournament:view')`: any participant role. */
export function requireParticipant(
  userId: string | null,
  tournamentId: string,
  db: Db = getDb(),
): Promise<TournamentAccess> {
  return requireRole(userId, tournamentId, 'tournament:view', db);
}
