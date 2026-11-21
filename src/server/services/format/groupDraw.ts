import 'server-only';
import { randomInt, randomUUID } from 'node:crypto';
import { and, asc, eq, inArray, ne } from 'drizzle-orm';
import { assignMatchOrder, type OrderableMatch } from '@/lib/rules/assignMatchOrder';
import {
  generateGroups,
  groupName,
  rankForPots,
  type DrawTeam,
  type GroupDraft,
} from '@/lib/rules/generateGroups';
import { generateRoundRobin } from '@/lib/rules/generateRoundRobin';
import { generateBracket, seedKnockout, type BracketMatch } from '@/lib/rules/knockout';
import { advancePerGroupOf, planFormat, type FormatPlan } from '@/lib/rules/planFormat';
import type { MatchSource } from '@/lib/schemas/domain';
import type { TournamentStatus } from '@/lib/schemas/enums';
import { parseSettings, type TournamentSettings } from '@/lib/schemas/settings';
import type { DrawRequest } from '@/features/format/schemas';
import { withTransaction, type OnCommit, type Tx } from '../../db/client';
import {
  groups,
  groupTeams,
  leaders,
  matches,
  teams,
  tournaments,
  type NewMatch,
} from '../../db/schema';
import { badRequest, conflict, ruleViolation } from '../../errors';
import { writeAudit } from '../audit';
import { lockTournament } from '../roster';
import { requireRole } from '../roles';
import { queueUpdates } from './events';

/** Uniform [0, 1) from the OS CSPRNG, so nobody can predict or replay a draw. */
export const cryptoRandom = (): number => randomInt(0, 2 ** 32) / 2 ** 32;

export interface DrawResult {
  status: TournamentStatus;
  groupCount: number;
  matchCount: number;
}

interface DrawTeamRow extends DrawTeam {
  name: string;
}

/** Teams with their seeding value (MP spent in the auction, PLAN §4.2). */
async function loadDrawTeams(tx: Tx, tournamentId: string): Promise<DrawTeamRow[]> {
  const rows = await tx
    .select({
      teamId: teams.id,
      name: teams.name,
      sortOrder: teams.sortOrder,
      purseTotal: leaders.purseTotal,
      purseRemaining: leaders.purseRemaining,
    })
    .from(teams)
    .innerJoin(leaders, eq(leaders.id, teams.leaderId))
    .where(eq(teams.tournamentId, tournamentId))
    .orderBy(asc(teams.sortOrder), asc(teams.id));
  return rows.map((r) => ({
    teamId: r.teamId,
    name: r.name,
    sortOrder: r.sortOrder,
    seedValue: r.purseTotal - r.purseRemaining,
  }));
}

/** Check a manual placement against the plan: right group count, balanced, every team once. */
export function validateManualPlacement(
  placement: string[][],
  teamIds: readonly string[],
  plan: FormatPlan,
): GroupDraft[] {
  if (placement.length !== plan.groupCount) {
    throw ruleViolation('GROUP_COUNT', `Place the teams into exactly ${plan.groupCount} groups.`);
  }
  const placed = placement.flat();
  const known = new Set(teamIds);
  if (
    placed.length !== teamIds.length ||
    new Set(placed).size !== placed.length ||
    !placed.every((id) => known.has(id))
  ) {
    throw ruleViolation('EVERY_TEAM_ONCE', 'Every team must be placed in exactly one group.');
  }
  const sizes = placement.map((g) => g.length).sort((a, b) => b - a);
  if (sizes.join(',') !== plan.groupSizes.join(',')) {
    throw ruleViolation(
      'UNBALANCED',
      `Groups must be balanced: sizes ${plan.groupSizes.join(', ')} (they may differ by at most 1).`,
    );
  }
  return placement.map((ids, i) => ({
    name: groupName(i),
    teams: ids.map((teamId) => ({ teamId, pot: 0 })),
  }));
}

interface PendingMatch {
  id: string;
  row: NewMatch;
  order: OrderableMatch;
}

/** Bracket rows with real ids; WINNER_OF / LOSER_OF refs and next links point at those ids. */
function bracketRows(
  tournamentId: string,
  bracket: BracketMatch[],
  status: (m: BracketMatch) => NewMatch['status'],
): PendingMatch[] {
  const idByKey = new Map(bracket.map((m) => [m.key, randomUUID()]));
  const mapSource = (s: MatchSource | null): MatchSource | null =>
    s && s.type !== 'GROUP_POS' ? { type: s.type, ref: idByKey.get(s.ref)! } : s;
  return bracket.map((m) => {
    const id = idByKey.get(m.key)!;
    return {
      id,
      row: {
        id,
        tournamentId,
        stage: m.stage,
        round: m.round,
        slot: m.slot,
        teamAId: m.teamA.teamId,
        teamBId: m.teamB.teamId,
        sourceA: mapSource(m.teamA.source),
        sourceB: mapSource(m.teamB.source),
        bestOf: m.bestOf,
        isBye: m.isBye,
        nextMatchId: m.nextKey ? idByKey.get(m.nextKey)! : null,
        nextSlot: m.nextSlot,
        status: status(m),
        winnerTeamId: null,
      },
      order: { id, stage: m.stage, isBye: m.isBye, round: m.round, slot: m.slot },
    };
  });
}

/**
 * The draw itself, inside the caller's transaction (PLAN §4.2, §4.6):
 *  1. lock the tournament; it must be at GROUP_DRAW with no groups yet,
 *  2. place teams in groups (random from seeding pots, or the organiser's manual placement),
 *  3. create round-robin fixtures for every group AND the whole knockout tree with placeholders
 *     ("Group A #1", "Winner of M9"), so the full order and tree show from the moment of the draw,
 *  4. number every playable match (assignMatchOrder), set the status to GROUP_STAGE, audit-log it.
 *
 * 2 teams have no groups: the final is created with both teams and the status goes to KNOCKOUT.
 * Real-time events are queued only when `onCommit` is given (the stub path has none).
 */
export async function performGroupDraw(
  tx: Tx,
  tournamentId: string,
  request: DrawRequest,
  random: () => number,
  actorUserId: string | null,
  onCommit: OnCommit | null = null,
): Promise<DrawResult> {
  const t = await lockTournament(tx, tournamentId);
  if (t.status !== 'GROUP_DRAW') {
    throw conflict('The group draw happens once, after allocation (status GROUP_DRAW).');
  }
  const settings: TournamentSettings = parseSettings(t.settings);
  const drawTeams = await loadDrawTeams(tx, tournamentId);
  if (drawTeams.length < 2) {
    throw ruleViolation('NOT_ENOUGH_TEAMS', 'At least 2 teams are needed for a tournament.');
  }
  const plan = planFormat(drawTeams.length, settings);
  const pending: PendingMatch[] = [];
  let drafts: GroupDraft[] = [];
  let nextStatus: TournamentStatus;

  if (plan.groupCount === 0) {
    if (request.mode === 'MANUAL') throw badRequest('With 2 teams there are no groups to place.');
    // Straight to the final: better seed (more MP spent) in slot A.
    const [a, b] = rankForPots(drawTeams);
    const bracket = generateBracket(
      [a!, b!].map((team, i) => ({
        seed: i + 1,
        teamId: team.teamId,
        source: { type: 'GROUP_POS' as const, ref: `seed:${i + 1}` },
        groupId: null,
      })),
      settings,
    ).map((m) => ({
      ...m,
      teamA: { ...m.teamA, source: null },
      teamB: { ...m.teamB, source: null },
    }));
    pending.push(...bracketRows(tournamentId, bracket, () => 'SCHEDULED'));
    nextStatus = 'KNOCKOUT';
  } else {
    drafts =
      request.mode === 'RANDOM'
        ? generateGroups(drawTeams, settings, random)
        : validateManualPlacement(
            request.groups,
            drawTeams.map((d) => d.teamId),
            plan,
          );

    const groupRows = await tx
      .insert(groups)
      .values(drafts.map((d, i) => ({ tournamentId, name: d.name, sortOrder: i })))
      .returning({ id: groups.id, name: groups.name });
    await tx.insert(groupTeams).values(
      drafts.flatMap((d, i) =>
        d.teams.map((team) => ({
          groupId: groupRows[i]!.id,
          teamId: team.teamId,
          tournamentId,
          // Manual placement has no pots (schema: null for manual).
          pot: request.mode === 'RANDOM' ? team.pot : null,
        })),
      ),
    );

    drafts.forEach((d, gi) => {
      const groupId = groupRows[gi]!.id;
      for (const md of generateRoundRobin(
        d.teams.map((x) => x.teamId),
        settings.roundRobinLegs,
      )) {
        for (const f of md.fixtures) {
          const id = randomUUID();
          pending.push({
            id,
            row: {
              id,
              tournamentId,
              stage: 'GROUP',
              groupId,
              matchday: md.matchday,
              teamAId: f.teamAId,
              teamBId: f.teamBId,
              bestOf: settings.groupMatchBestOf,
              status: 'SCHEDULED',
            },
            order: { id, stage: 'GROUP', isBye: false, groupName: d.name, matchday: md.matchday },
          });
        }
      }
    });

    const seeds = seedKnockout(
      groupRows.map((g) => ({ groupId: g.id, name: g.name, standings: [] })),
      { advancePerGroup: advancePerGroupOf(plan) },
    );
    pending.push(...bracketRows(tournamentId, generateBracket(seeds, settings), () => 'SCHEDULED'));
    nextStatus = 'GROUP_STAGE';
  }

  const numbers = new Map(
    assignMatchOrder(pending.map((p) => p.order)).map((n) => [n.id, n.matchNumber]),
  );
  // Insert later rounds first so every next_match_id already exists (FKs are checked per statement
  // anyway, this just keeps it obvious).
  const rows = pending
    .map((p) => ({ ...p.row, matchNumber: numbers.get(p.id) ?? null }))
    .sort((a, b) => (b.round ?? 0) - (a.round ?? 0));
  await tx.insert(matches).values(rows);

  await tx.update(tournaments).set({ status: nextStatus }).where(eq(tournaments.id, tournamentId));
  await writeAudit(tx, {
    tournamentId,
    actorUserId,
    action: 'groups.drawn',
    after: {
      mode: request.mode,
      groups: drafts.map((d) => ({ name: d.name, teams: d.teams })),
      matches: rows.length,
    },
  });
  await queueUpdates(tx, onCommit, tournamentId, [
    { type: 'groups.updated', data: {} },
    { type: 'tournament.status', data: { status: nextStatus } },
  ]);
  return { status: nextStatus, groupCount: drafts.length, matchCount: rows.length };
}

/** POST /groups/draw: owner / co-admin runs the draw (random or manual placement). */
export async function drawGroups(
  userId: string | null,
  tournamentId: string,
  request: DrawRequest,
  random: () => number = cryptoRandom,
): Promise<DrawResult> {
  await requireRole(userId, tournamentId, 'stage:advance');
  return withTransaction((tx, onCommit) =>
    performGroupDraw(tx, tournamentId, request, random, userId, onCommit),
  );
}

/**
 * DELETE /groups/draw: undo the draw while nothing has been played, so the organiser can redraw.
 * Deletes every group and match and puts the tournament back to GROUP_DRAW (logged).
 */
export async function undoGroupDraw(
  userId: string | null,
  tournamentId: string,
): Promise<{ status: TournamentStatus }> {
  await requireRole(userId, tournamentId, 'stage:advance');
  return withTransaction(async (tx, onCommit) => {
    const t = await lockTournament(tx, tournamentId);
    if (t.status !== 'GROUP_STAGE' && t.status !== 'KNOCKOUT') {
      throw conflict('There is no draw to undo.');
    }
    const [started] = await tx
      .select({ id: matches.id })
      .from(matches)
      .where(
        and(
          eq(matches.tournamentId, tournamentId),
          eq(matches.isBye, false),
          ne(matches.status, 'SCHEDULED'),
        ),
      )
      .limit(1);
    if (started) throw conflict('Matches have already started, so the draw can’t be undone.');

    const ids = (
      await tx
        .select({ id: matches.id })
        .from(matches)
        .where(eq(matches.tournamentId, tournamentId))
    ).map((m) => m.id);
    if (ids.length > 0) {
      // Drop the self-references first, then the rows.
      await tx.update(matches).set({ nextMatchId: null }).where(inArray(matches.id, ids));
      await tx.delete(matches).where(inArray(matches.id, ids));
    }
    await tx.delete(groups).where(eq(groups.tournamentId, tournamentId));
    await tx
      .update(tournaments)
      .set({ status: 'GROUP_DRAW' })
      .where(eq(tournaments.id, tournamentId));
    await writeAudit(tx, {
      tournamentId,
      actorUserId: userId,
      action: 'groups.draw_undone',
      before: { status: t.status },
    });
    await queueUpdates(tx, onCommit, tournamentId, [
      { type: 'groups.updated', data: {} },
      { type: 'tournament.status', data: { status: 'GROUP_DRAW' } },
    ]);
    return { status: 'GROUP_DRAW' as const };
  });
}
