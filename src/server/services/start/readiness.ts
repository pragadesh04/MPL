import 'server-only';
import { asc, eq } from 'drizzle-orm';
import {
  validateReadyToStart,
  type ReadyToStartInput,
  type ReadyToStartResult,
} from '@/lib/rules/validateReadyToStart';
import { parseSettings } from '@/lib/schemas/settings';
import type { Db } from '../../db/client';
import { leaders, players, teams, tournaments } from '../../db/schema';
import { notFound } from '../../errors';

/** Load everything `validateReadyToStart` needs for one tournament (PLAN §3.5). */
export async function loadReadyInput(db: Db, tournamentId: string): Promise<ReadyToStartInput> {
  const [tour] = await db
    .select({ settings: tournaments.settings })
    .from(tournaments)
    .where(eq(tournaments.id, tournamentId));
  if (!tour) throw notFound();

  const captainRows = await db
    .select({
      leaderId: leaders.id,
      name: leaders.name,
      userId: leaders.userId,
      approval: leaders.approval,
      purseTotal: leaders.purseTotal,
      ign: leaders.ign,
      phone: leaders.phone,
      teamName: teams.name,
      teamShort: teams.shortName,
      teamColor: teams.color,
    })
    .from(leaders)
    .leftJoin(teams, eq(teams.leaderId, leaders.id))
    .where(eq(leaders.tournamentId, tournamentId))
    .orderBy(asc(leaders.createdAt));

  const soldierRows = await db
    .select({
      playerId: players.id,
      name: players.name,
      userId: players.userId,
      status: players.status,
      basePrice: players.basePrice,
      ign: players.ign,
      phone: players.phone,
    })
    .from(players)
    .where(eq(players.tournamentId, tournamentId))
    .orderBy(asc(players.createdAt));

  return {
    settings: parseSettings(tour.settings),
    captains: captainRows.map(({ teamName, teamShort, teamColor, ...c }) => ({
      ...c,
      team:
        teamName !== null && teamShort !== null && teamColor !== null
          ? { name: teamName, shortName: teamShort, color: teamColor }
          : null,
    })),
    soldiers: soldierRows,
  };
}

export async function computeReadiness(db: Db, tournamentId: string): Promise<ReadyToStartResult> {
  return validateReadyToStart(await loadReadyInput(db, tournamentId));
}

/**
 * Keep DRAFT ⇄ READY in step with the checks (PLAN §1: READY = "every validation check passes").
 * Only touches tournaments in DRAFT / READY. Returns true when the status changed.
 */
export async function syncReadyStatus(db: Db, tournamentId: string): Promise<boolean> {
  const [tour] = await db
    .select({ status: tournaments.status })
    .from(tournaments)
    .where(eq(tournaments.id, tournamentId));
  if (!tour || (tour.status !== 'DRAFT' && tour.status !== 'READY')) return false;
  const { ok } = await computeReadiness(db, tournamentId);
  const next = ok ? 'READY' : 'DRAFT';
  if (next === tour.status) return false;
  await db.update(tournaments).set({ status: next }).where(eq(tournaments.id, tournamentId));
  return true;
}
