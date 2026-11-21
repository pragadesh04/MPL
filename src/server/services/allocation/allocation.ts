import 'server-only';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { allocateLeftovers, type AllocationStep } from '@/lib/rules/allocateLeftovers';
import { commandIdSchema } from '@/lib/schemas/auction';
import { idSchema } from '@/lib/schemas/domain';
import { parseSettings } from '@/lib/schemas/settings';
import { getDb, type Db } from '../../db/client';
import { players, tournaments } from '../../db/schema';
import { notFound, ruleViolation } from '../../errors';
import { writeAudit } from '../audit';
import { requireRole } from '../roles';
import { emit, loadTeams, setStatus, type CtxTeam } from '../auction/engine';
import { runAuctionWrite } from '../auction/run';

/**
 * Leftover allocation (PLAN §3.4, §7.10, §13.5 B7). After the last auction round the tournament is
 * in ALLOCATION. Organisers preview the plan (`allocateLeftovers`: fewest players → lowest MP left →
 * team order, price 0), may override single picks with a logged reason, then confirm. Confirming
 * runs in the auction pipeline (same lock and event sequence): every pick is one `allocation.step`
 * event, the audit log records the plan and overrides, and the status becomes GROUP_DRAW, where
 * Lane C's group draw takes over.
 */

export interface AllocationPreviewStep extends AllocationStep {
  playerName: string;
  basePrice: number;
  teamName: string;
  teamShortName: string;
  teamColor: string;
}

export interface AllocationPreview {
  status: string;
  leftovers: {
    playerId: string;
    name: string;
    ign: string | null;
    photoUrl: string | null;
    basePrice: number;
  }[];
  steps: AllocationPreviewStep[];
  unplaced: string[];
  teams: (CtxTeam & { squadSizeAfter: number })[];
  minPlayersPerTeam: number;
  maxPlayersPerTeam: number;
  /** Teams that would still be below the minimum squad size after this plan. */
  belowMinimum: string[];
}

export const confirmAllocationSchema = z.object({
  commandId: commandIdSchema,
  overrides: z
    .array(z.object({ playerId: idSchema, teamId: idSchema }))
    .max(200)
    .default([]),
  reason: z.string().trim().max(500).optional(),
});
export type ConfirmAllocationRequest = z.input<typeof confirmAllocationSchema>;

async function loadLeftovers(db: Db, tournamentId: string) {
  return db
    .select({
      playerId: players.id,
      name: players.name,
      ign: players.ign,
      photoUrl: players.photoUrl,
      basePrice: players.basePrice,
    })
    .from(players)
    .where(and(eq(players.tournamentId, tournamentId), inArray(players.status, ['UNSOLD', 'POOL'])))
    .orderBy(asc(players.auctionOrder), asc(players.name));
}

function buildPlan(
  leftovers: Awaited<ReturnType<typeof loadLeftovers>>,
  teams: CtxTeam[],
  maxPlayers: number,
  overrides: { playerId: string; teamId: string }[],
) {
  const plan = allocateLeftovers(
    leftovers.map((l) => ({ playerId: l.playerId, basePrice: l.basePrice })),
    teams.map((t) => ({ ...t })),
    { maxPlayersPerTeam: maxPlayers },
  );
  const byPlayer = new Map(overrides.map((o) => [o.playerId, o.teamId]));
  for (const o of overrides) {
    if (!leftovers.some((l) => l.playerId === o.playerId)) throw notFound();
    if (!teams.some((t) => t.teamId === o.teamId)) throw notFound();
  }
  const steps = plan.steps.map((s) => {
    const teamId = byPlayer.get(s.playerId);
    return teamId && teamId !== s.teamId ? { ...s, teamId, reason: 'Organiser override' } : s;
  });
  // Overrides can also place soldiers the plan couldn't place.
  for (const playerId of plan.unplaced) {
    const teamId = byPlayer.get(playerId);
    if (teamId)
      steps.push({ step: steps.length + 1, playerId, teamId, reason: 'Organiser override' });
  }
  const unplaced = plan.unplaced.filter((p) => !byPlayer.has(p));
  const after = new Map(teams.map((t) => [t.teamId, t.squadSize]));
  for (const s of steps) after.set(s.teamId, (after.get(s.teamId) ?? 0) + 1);
  return { steps, unplaced, after };
}

export async function previewAllocation(
  userId: string | null,
  tournamentId: string,
): Promise<AllocationPreview> {
  await requireRole(userId, tournamentId, 'tournament:view-admin');
  const db = getDb();
  const [tour] = await db
    .select({ status: tournaments.status, settings: tournaments.settings })
    .from(tournaments)
    .where(eq(tournaments.id, tournamentId));
  if (!tour) throw notFound();
  const settings = parseSettings(tour.settings);
  const leftovers = await loadLeftovers(db, tournamentId);
  const teams = await loadTeams(db, tournamentId);
  const { steps, unplaced, after } = buildPlan(leftovers, teams, settings.maxPlayersPerTeam, []);
  const teamById = new Map(teams.map((t) => [t.teamId, t]));
  const playerById = new Map(leftovers.map((l) => [l.playerId, l]));
  return {
    status: tour.status,
    leftovers,
    steps: steps.map((s) => {
      const team = teamById.get(s.teamId)!;
      const player = playerById.get(s.playerId)!;
      return {
        ...s,
        playerName: player.name,
        basePrice: player.basePrice,
        teamName: team.name,
        teamShortName: team.shortName,
        teamColor: team.color,
      };
    }),
    unplaced,
    teams: teams.map((t) => ({ ...t, squadSizeAfter: after.get(t.teamId) ?? t.squadSize })),
    minPlayersPerTeam: settings.minPlayersPerTeam,
    maxPlayersPerTeam: settings.maxPlayersPerTeam,
    belowMinimum: teams
      .filter((t) => (after.get(t.teamId) ?? t.squadSize) < settings.minPlayersPerTeam)
      .map((t) => t.teamId),
  };
}

export async function confirmAllocation(
  userId: string | null,
  tournamentId: string,
  body: ConfirmAllocationRequest,
): Promise<{ status: 'GROUP_DRAW'; allocated: number }> {
  const access = await requireRole(userId, tournamentId, 'stage:advance');
  const input = confirmAllocationSchema.parse(body);
  let allocated = 0;
  await runAuctionWrite({
    tournamentId,
    actorUserId: access.userId,
    commandId: input.commandId,
    command: async (ctx) => {
      if (ctx.status !== 'ALLOCATION') {
        throw ruleViolation('NOT_ALLOCATION', 'Allocation runs after the last auction round');
      }
      if (input.overrides.length > 0 && !input.reason) {
        throw ruleViolation('REASON_REQUIRED', 'Give a reason for the overrides');
      }
      const max = ctx.settings.maxPlayersPerTeam;
      const leftovers = await loadLeftovers(ctx.tx, tournamentId);
      const teams = await loadTeams(ctx.tx, tournamentId);
      const { steps, unplaced, after } = buildPlan(leftovers, teams, max, input.overrides);
      if (unplaced.length > 0) {
        throw ruleViolation('NO_SPACE', `${unplaced.length} soldier(s) don't fit in any squad`);
      }
      const full = teams.filter((t) => (after.get(t.teamId) ?? 0) > max);
      if (full.length > 0) {
        throw ruleViolation(
          'SQUAD_FULL',
          `${full.map((t) => t.name).join(', ')} would be over the squad limit`,
        );
      }
      const short = teams.filter(
        (t) => (after.get(t.teamId) ?? 0) < ctx.settings.minPlayersPerTeam,
      );
      if (short.length > 0) {
        throw ruleViolation(
          'BELOW_MINIMUM',
          `${short.map((t) => t.name).join(', ')} would stay below ${ctx.settings.minPlayersPerTeam} players`,
        );
      }
      const teamById = new Map(teams.map((t) => [t.teamId, t]));
      const playerById = new Map(leftovers.map((l) => [l.playerId, l]));
      for (const [i, s] of steps.entries()) {
        const overridden = s.reason === 'Organiser override';
        await ctx.tx
          .update(players)
          .set({
            status: 'ALLOCATED',
            teamId: s.teamId,
            soldPrice: 0,
            acquiredVia: overridden ? 'ADMIN_PICK' : 'AUTO_ALLOCATED',
          })
          .where(eq(players.id, s.playerId));
        emit(ctx, 'allocation.step', {
          step: i + 1,
          playerId: s.playerId,
          teamId: s.teamId,
          reason: s.reason,
        });
      }
      allocated = steps.length;
      await writeAudit(ctx.tx, {
        tournamentId,
        actorUserId: access.userId,
        action: 'allocation.completed',
        after: {
          steps: steps.map(({ playerId, teamId, reason }) => ({ playerId, teamId, reason })),
        },
        reason: input.reason ?? null,
      });
      ctx.webhooks.push({
        event: 'allocation.completed',
        data: {
          count: steps.length,
          steps: steps.map((s) => {
            const team = teamById.get(s.teamId)!;
            return {
              playerName: playerById.get(s.playerId)!.name,
              teamName: team.name,
              teamShortName: team.shortName,
              teamColor: team.color,
              reason: s.reason,
            };
          }),
        },
      });
      ctx.rosterChanged = true;
      setStatus(ctx, 'GROUP_DRAW');
    },
  });
  return { status: 'GROUP_DRAW', allocated };
}
