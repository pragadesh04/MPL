import 'server-only';
import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { reorderWithinStage, REORDER_MESSAGES } from '@/lib/rules/assignMatchOrder';
import { shuffle } from '@/lib/rules/generateGroups';
import { MATCH_SCORE_MESSAGES, scoreMatch } from '@/lib/rules/matchScore';
import { advancePerGroupOf, planFormat } from '@/lib/rules/planFormat';
import type { TournamentStatus } from '@/lib/schemas/enums';
import { parseSettings } from '@/lib/schemas/settings';
import type { GameInput, MatchPatch, PlayerStatInput } from '@/features/format/schemas';
import { withTransaction, type OnCommit, type Tx } from '../../db/client';
import {
  matches,
  matchGames,
  players,
  playerStats,
  tournaments,
  type Match,
} from '../../db/schema';
import { badRequest, conflict, notFound, ruleViolation } from '../../errors';
import { writeAudit } from '../audit';
import { cryptoRandom } from '../format/groupDraw';
import { queueUpdates, type FormatEvent } from '../format/events';
import {
  loadTeamCards,
  matchResultEvent,
  queueFormatWebhooks,
  tournamentCompletedEvent,
} from '../format/webhooks';
import type { OutgoingEvent } from '../webhooks/dispatch';
import {
  loadGroupStandings,
  needsTiebreakDraw,
  TIEBREAK_AUDIT_ACTION,
  type GroupStanding,
} from '../format/standings';
import { lockTournament } from '../roster';
import { requireRole } from '../roles';

/**
 * Results and progression (PLAN §4.3–4.6, §7.10a–7.12). Every write:
 * - checks the role first (`matches:edit`, or `stage:advance` for knockout generation and draws),
 * - locks the tournament row so format writes for one tournament happen one at a time,
 * - audit-logs the change and publishes `match.updated` (+ `tournament.status`) after COMMIT.
 */

type Tournament = typeof tournaments.$inferSelect;

const PLAYABLE_STATUSES: readonly TournamentStatus[] = ['GROUP_STAGE', 'KNOCKOUT', 'COMPLETED'];

interface Ctx {
  tx: Tx;
  onCommit: OnCommit;
  tournament: Tournament;
  userId: string;
  events: FormatEvent[];
  changedMatchIds: Set<string>;
  /** Outgoing webhooks (match.result, tournament.completed), queued after COMMIT. */
  webhooks: OutgoingEvent[];
}

/** Run `fn` with the tournament locked; queue the collected events after it. */
async function inTournament<T>(
  userId: string,
  tournamentId: string,
  fn: (ctx: Ctx) => Promise<T>,
): Promise<T> {
  return withTransaction(async (tx, onCommit) => {
    const tournament = await lockTournament(tx, tournamentId);
    const ctx: Ctx = {
      tx,
      onCommit,
      tournament,
      userId,
      events: [],
      changedMatchIds: new Set(),
      webhooks: [],
    };
    const result = await fn(ctx);
    const events: FormatEvent[] = [];
    if (ctx.changedMatchIds.size > 0) {
      events.push({ type: 'match.updated', data: { matchIds: [...ctx.changedMatchIds] } });
    }
    events.push(...ctx.events);
    if (events.length > 0) await queueUpdates(tx, onCommit, tournamentId, events);
    queueFormatWebhooks(onCommit, tournamentId, ctx.webhooks);
    return result;
  });
}

async function loadMatch(ctx: Ctx, matchId: string): Promise<Match> {
  const [m] = await ctx.tx
    .select()
    .from(matches)
    .where(and(eq(matches.id, matchId), eq(matches.tournamentId, ctx.tournament.id)))
    .limit(1);
  if (!m) throw notFound();
  return m;
}

function label(m: Pick<Match, 'matchNumber'>): string {
  return m.matchNumber ? `M${m.matchNumber}` : 'that match';
}

async function setStatus(ctx: Ctx, status: TournamentStatus): Promise<void> {
  if (ctx.tournament.status === status) return;
  await ctx.tx
    .update(tournaments)
    .set({
      status,
      completedAt: status === 'COMPLETED' ? sql`now()` : null,
    })
    .where(eq(tournaments.id, ctx.tournament.id));
  await writeAudit(ctx.tx, {
    tournamentId: ctx.tournament.id,
    actorUserId: ctx.userId,
    action: status === 'COMPLETED' ? 'tournament.completed' : 'tournament.status_changed',
    before: { status: ctx.tournament.status },
    after: { status },
  });
  ctx.tournament = { ...ctx.tournament, status };
  ctx.events.push({ type: 'tournament.status', data: { status } });
}

/** A non-bye knockout or 3rd-place match is LIVE or DONE. */
async function knockoutStarted(ctx: Ctx): Promise<boolean> {
  const [row] = await ctx.tx
    .select({ id: matches.id })
    .from(matches)
    .where(
      and(
        eq(matches.tournamentId, ctx.tournament.id),
        ne(matches.stage, 'GROUP'),
        eq(matches.isBye, false),
        ne(matches.status, 'SCHEDULED'),
      ),
    )
    .limit(1);
  return Boolean(row);
}

function assertEditable(ctx: Ctx, m: Match): void {
  if (!PLAYABLE_STATUSES.includes(ctx.tournament.status)) {
    throw conflict('Matches can be played once the groups are drawn.');
  }
  if (m.isBye) throw conflict('A bye is never played.');
}

function bothTeams(m: Match): { a: string; b: string } {
  if (!m.teamAId || !m.teamBId) {
    throw ruleViolation('TEAMS_UNDECIDED', `Both teams of ${label(m)} must be known first.`);
  }
  return { a: m.teamAId, b: m.teamBId };
}

// ─── Knockout filling ─────────────────────────────────────────────────────────────────────

/**
 * Put the group finishers into every knockout slot that comes from a group position, and resolve
 * byes (DONE, the team advances). With `standings = null`, empty those slots again instead.
 */
async function fillKnockoutFromGroups(ctx: Ctx, standings: GroupStanding[] | null): Promise<void> {
  const byGroup = new Map((standings ?? []).map((g) => [g.groupId, g.standings]));
  const resolve = (source: Match['sourceA']): string | null | undefined => {
    if (!source || source.type !== 'GROUP_POS') return undefined;
    if (!standings) return null;
    const [groupId, pos] = source.ref.split(':');
    return byGroup.get(groupId!)?.[Number(pos) - 1]?.teamId ?? null;
  };
  const ko = await ctx.tx
    .select()
    .from(matches)
    .where(and(eq(matches.tournamentId, ctx.tournament.id), ne(matches.stage, 'GROUP')));
  for (const m of ko) {
    const a = resolve(m.sourceA);
    const b = resolve(m.sourceB);
    if (a === undefined && b === undefined) continue;
    const teamAId = a === undefined ? m.teamAId : a;
    const teamBId = b === undefined ? m.teamBId : b;
    const bye = m.isBye
      ? { status: teamAId ? ('DONE' as const) : ('SCHEDULED' as const), winnerTeamId: teamAId }
      : {};
    await ctx.tx
      .update(matches)
      .set({ teamAId, teamBId, ...bye, updatedAt: sql`now()` })
      .where(eq(matches.id, m.id));
    ctx.changedMatchIds.add(m.id);
  }
}

/** POST /matches/knockout — fill the knockout from the final group standings (§4.4, §7.11). */
export async function generateKnockout(
  userId: string | null,
  tournamentId: string,
): Promise<{ status: TournamentStatus }> {
  const access = await requireRole(userId, tournamentId, 'stage:advance');
  return inTournament(access.userId, tournamentId, async (ctx) => {
    if (ctx.tournament.status !== 'GROUP_STAGE') {
      throw conflict('The knockout is generated once, when the group stage is over.');
    }
    const settings = parseSettings(ctx.tournament.settings);
    const standings = await loadGroupStandings(ctx.tx, tournamentId, settings.pointsForWin);
    if (standings.length === 0 || standings.some((g) => !g.complete)) {
      throw ruleViolation('GROUPS_NOT_DONE', 'Every group match must be played first.');
    }
    const teamCount = standings.reduce((n, g) => n + g.teamIds.length, 0);
    const advance = advancePerGroupOf(planFormat(teamCount, settings));
    const tied = standings.filter((g) => needsTiebreakDraw(g, advance));
    if (tied.length > 0) {
      throw ruleViolation(
        'TIEBREAK_DRAW_NEEDED',
        `Group ${tied.map((g) => g.name).join(', ')} has teams level on every tie-break: run the draw first.`,
      );
    }
    await fillKnockoutFromGroups(ctx, standings);
    await writeAudit(ctx.tx, {
      tournamentId,
      actorUserId: ctx.userId,
      action: 'knockout.generated',
      after: {
        qualified: standings.map((g) => ({
          group: g.name,
          teams: g.standings.slice(0, advance).map((r) => r.teamId),
        })),
      },
    });
    await setStatus(ctx, 'KNOCKOUT');
    return { status: ctx.tournament.status };
  });
}

/**
 * POST /groups/:gid/tiebreak — organiser-run draw for teams level on every tie-break (§4.3).
 * Orders the level teams at random and logs it; standings read it back.
 */
export async function runTiebreakDraw(
  userId: string | null,
  tournamentId: string,
  groupId: string,
  random: () => number = cryptoRandom,
): Promise<{ order: string[] }> {
  const access = await requireRole(userId, tournamentId, 'stage:advance');
  return inTournament(access.userId, tournamentId, async (ctx) => {
    if (ctx.tournament.status !== 'GROUP_STAGE') {
      throw conflict('Tie-break draws happen before the knockout is generated.');
    }
    const settings = parseSettings(ctx.tournament.settings);
    const all = await loadGroupStandings(ctx.tx, tournamentId, settings.pointsForWin);
    const group = all.find((g) => g.groupId === groupId);
    if (!group) throw notFound();
    if (!group.complete) throw ruleViolation('GROUP_NOT_DONE', 'Finish the group’s matches first.');
    const level = group.standings.filter((r) => r.needsDraw).map((r) => r.teamId);
    if (level.length < 2) throw conflict('No teams in this group need a draw.');
    const order = shuffle(level, random);
    await writeAudit(ctx.tx, {
      tournamentId,
      actorUserId: ctx.userId,
      action: TIEBREAK_AUDIT_ACTION,
      after: { groupId, group: group.name, order },
      reason: 'Organiser-run draw: level on head-to-head, game diff, kill diff and kills',
    });
    ctx.events.push({ type: 'groups.updated', data: {} });
    return { order };
  });
}

// ─── Match edits ──────────────────────────────────────────────────────────────────────────

/** Validate a game list against best-of (`scoreMatch`); throws the rule's reason as a 409. */
export function scoreGames(
  games: Pick<GameInput, 'killsA' | 'killsB'>[],
  bestOf: number,
): { winsA: number; winsB: number; decided: 'A' | 'B' | null } {
  const { winsA, winsB, decided, problem } = scoreMatch(games, bestOf);
  if (problem) {
    throw ruleViolation(
      problem.reason,
      `Game ${problem.gameIndex + 1}: ${MATCH_SCORE_MESSAGES[problem.reason]}`,
    );
  }
  return { winsA, winsB, decided };
}

async function savePlayerStats(ctx: Ctx, m: Match, stats: PlayerStatInput[]): Promise<void> {
  const ids = stats.map((s) => s.playerId);
  if (new Set(ids).size !== ids.length) throw badRequest('Each soldier can appear once.');
  if (stats.filter((s) => s.mvp).length > 1) throw badRequest('Pick at most one MVP.');
  if (ids.length > 0) {
    const rows = await ctx.tx
      .select({ id: players.id, teamId: players.teamId })
      .from(players)
      .where(and(eq(players.tournamentId, ctx.tournament.id), inArray(players.id, ids)));
    const allowed = new Set([m.teamAId, m.teamBId]);
    if (rows.length !== ids.length || rows.some((r) => !r.teamId || !allowed.has(r.teamId))) {
      throw badRequest('Stats can only be entered for soldiers of the two teams.');
    }
  }
  await ctx.tx.delete(playerStats).where(eq(playerStats.matchId, m.id));
  if (stats.length > 0) {
    await ctx.tx.insert(playerStats).values(
      stats.map((s) => ({
        matchId: m.id,
        playerId: s.playerId,
        kills: s.kills,
        deaths: s.deaths,
        mvp: s.mvp,
      })),
    );
  }
}

/** The 3rd-place match fed by this match's loser, if any. */
async function loserTarget(ctx: Ctx, m: Match): Promise<{ match: Match; slot: 'A' | 'B' } | null> {
  const [tp] = await ctx.tx
    .select()
    .from(matches)
    .where(and(eq(matches.tournamentId, ctx.tournament.id), eq(matches.stage, 'THIRD_PLACE')))
    .limit(1);
  if (!tp) return null;
  if (tp.sourceA?.type === 'LOSER_OF' && tp.sourceA.ref === m.id) return { match: tp, slot: 'A' };
  if (tp.sourceB?.type === 'LOSER_OF' && tp.sourceB.ref === m.id) return { match: tp, slot: 'B' };
  return null;
}

/**
 * Knockout auto-advance (§4.5): the winner moves into the next slot and the loser into the
 * 3rd-place match. When an earlier result changes, downstream slots are only rewritten if those
 * matches haven't started; otherwise the edit is refused (§9 item 10).
 */
async function propagate(
  ctx: Ctx,
  m: Match,
  winner: string | null,
  loser: string | null,
  confirm: boolean,
): Promise<void> {
  const targets: { match: Match; slot: 'A' | 'B'; team: string | null }[] = [];
  if (m.nextMatchId && (m.nextSlot === 'A' || m.nextSlot === 'B')) {
    const [next] = await ctx.tx
      .select()
      .from(matches)
      .where(eq(matches.id, m.nextMatchId))
      .limit(1);
    if (next) targets.push({ match: next, slot: m.nextSlot, team: winner });
  }
  const tp = await loserTarget(ctx, m);
  if (tp) targets.push({ ...tp, team: loser });

  const changes = targets.filter(
    (t) => (t.slot === 'A' ? t.match.teamAId : t.match.teamBId) !== t.team,
  );
  if (changes.length === 0) return;
  const started = changes.filter((t) => t.match.status !== 'SCHEDULED');
  if (started.length > 0) {
    throw conflict(
      `${started.map((t) => label(t.match)).join(' and ')} already started. Clear its result first, then edit this one.`,
    );
  }
  const filled = changes.filter(
    (t) => (t.slot === 'A' ? t.match.teamAId : t.match.teamBId) !== null,
  );
  if (filled.length > 0 && !confirm) {
    throw conflict(
      `Changing this result changes who plays in ${filled.map((t) => label(t.match)).join(' and ')}.`,
      { needsConfirm: true, affected: filled.map((t) => t.match.matchNumber) },
    );
  }
  for (const t of changes) {
    await ctx.tx
      .update(matches)
      .set(
        t.slot === 'A'
          ? { teamAId: t.team, updatedAt: sql`now()` }
          : { teamBId: t.team, updatedAt: sql`now()` },
      )
      .where(eq(matches.id, t.match.id));
    ctx.changedMatchIds.add(t.match.id);
  }
}

async function recordResult(
  ctx: Ctx,
  m: Match,
  input: Extract<MatchPatch, { action: 'result' }>,
): Promise<void> {
  const settings = parseSettings(ctx.tournament.settings);
  const { a, b } = bothTeams(m);
  if (m.stage === 'GROUP') {
    if (ctx.tournament.status === 'COMPLETED' || (await knockoutStarted(ctx))) {
      throw conflict('The knockout has started, so group results are locked.');
    }
  } else if (ctx.tournament.status === 'GROUP_STAGE') {
    throw conflict('Knockout matches are played after Generate knockout.');
  }

  const { winsA, winsB, decided } = scoreGames(input.games, m.bestOf);
  const winner = decided === 'A' ? a : decided === 'B' ? b : null;
  // Undecided: LIVE while games are in, otherwise back to SCHEDULED (unless it was marked live).
  const status = decided
    ? 'DONE'
    : input.games.length > 0 || m.status === 'LIVE'
      ? 'LIVE'
      : 'SCHEDULED';

  if (m.stage !== 'GROUP') {
    const loser = winner === null ? null : winner === a ? b : a;
    await propagate(ctx, m, winner, loser, input.confirmCascade ?? false);
  }

  await ctx.tx.delete(matchGames).where(eq(matchGames.matchId, m.id));
  if (input.games.length > 0) {
    await ctx.tx.insert(matchGames).values(
      input.games.map((g, i) => ({
        matchId: m.id,
        gameNo: i + 1,
        map: g.map ?? null,
        killsA: g.killsA,
        killsB: g.killsB,
        winnerTeamId: g.killsA > g.killsB ? a : b,
      })),
    );
  }
  if (input.playerStats) await savePlayerStats(ctx, m, input.playerStats);
  await ctx.tx
    .update(matches)
    .set({ status, winnerTeamId: winner, updatedAt: sql`now()` })
    .where(eq(matches.id, m.id));
  ctx.changedMatchIds.add(m.id);
  await writeAudit(ctx.tx, {
    tournamentId: ctx.tournament.id,
    actorUserId: ctx.userId,
    action: m.status === 'DONE' ? 'match.result_edited' : 'match.result_recorded',
    before: { status: m.status, winnerTeamId: m.winnerTeamId },
    after: { match: m.matchNumber, status, winnerTeamId: winner, score: `${winsA}-${winsB}` },
  });
  const cards = winner ? await loadTeamCards(ctx.tx, [a, b]) : null;
  if (winner && cards) {
    ctx.webhooks.push(
      matchResultEvent({
        matchNumber: m.matchNumber,
        stage: m.stage,
        teamA: cards.get(a),
        teamB: cards.get(b),
        winsA,
        winsB,
        winner: cards.get(winner),
      }),
    );
  }

  if (m.stage === 'GROUP') {
    // A group result changed after the knockout was filled (nothing played there yet): refill it,
    // or empty it again (and go back to the group stage) if a group is no longer complete.
    if (ctx.tournament.status === 'KNOCKOUT') {
      const standings = await loadGroupStandings(ctx.tx, ctx.tournament.id, settings.pointsForWin);
      if (standings.every((g) => g.complete)) {
        await fillKnockoutFromGroups(ctx, standings);
      } else {
        await fillKnockoutFromGroups(ctx, null);
        await setStatus(ctx, 'GROUP_STAGE');
      }
    }
    return;
  }

  // The final decides the champion; un-deciding it reopens the tournament.
  if (m.stage === 'KNOCKOUT' && !m.nextMatchId) {
    if (winner) {
      const wasCompleted = ctx.tournament.status === 'COMPLETED';
      await setStatus(ctx, 'COMPLETED');
      if (!wasCompleted) ctx.webhooks.push(tournamentCompletedEvent(cards?.get(winner)));
    } else if (ctx.tournament.status === 'COMPLETED') await setStatus(ctx, 'KNOCKOUT');
  }
}

/** PATCH /matches/:mid — mark live, schedule, or enter / edit a result. */
export async function updateMatch(
  userId: string | null,
  tournamentId: string,
  matchId: string,
  patch: MatchPatch,
): Promise<{ matchId: string; status: string; tournamentStatus: TournamentStatus }> {
  const access = await requireRole(userId, tournamentId, 'matches:edit');
  return inTournament(access.userId, tournamentId, async (ctx) => {
    const m = await loadMatch(ctx, matchId);
    assertEditable(ctx, m);
    switch (patch.action) {
      case 'mark-live': {
        bothTeams(m);
        if (m.status !== 'SCHEDULED')
          throw conflict(`${label(m)} is already ${m.status === 'LIVE' ? 'live' : 'played'}.`);
        if (
          m.stage === 'GROUP'
            ? ctx.tournament.status !== 'GROUP_STAGE'
            : ctx.tournament.status !== 'KNOCKOUT'
        ) {
          throw conflict(`${label(m)} can’t be played in this stage.`);
        }
        await ctx.tx
          .update(matches)
          .set({ status: 'LIVE', updatedAt: sql`now()` })
          .where(eq(matches.id, m.id));
        ctx.changedMatchIds.add(m.id);
        await writeAudit(ctx.tx, {
          tournamentId,
          actorUserId: ctx.userId,
          action: 'match.marked_live',
          after: { match: m.matchNumber },
        });
        break;
      }
      case 'unmark-live': {
        if (m.status !== 'LIVE') throw conflict(`${label(m)} isn’t live.`);
        const [game] = await ctx.tx
          .select({ n: matchGames.gameNo })
          .from(matchGames)
          .where(eq(matchGames.matchId, m.id))
          .limit(1);
        if (game)
          throw conflict('Games are already recorded: clear them in the result form first.');
        await ctx.tx
          .update(matches)
          .set({ status: 'SCHEDULED', updatedAt: sql`now()` })
          .where(eq(matches.id, m.id));
        ctx.changedMatchIds.add(m.id);
        break;
      }
      case 'schedule': {
        await ctx.tx
          .update(matches)
          .set({
            scheduledAt: patch.scheduledAt ? new Date(patch.scheduledAt) : null,
            updatedAt: sql`now()`,
          })
          .where(eq(matches.id, m.id));
        ctx.changedMatchIds.add(m.id);
        break;
      }
      case 'result':
        await recordResult(ctx, m, patch);
        break;
    }
    const [after] = await ctx.tx
      .select({ status: matches.status })
      .from(matches)
      .where(eq(matches.id, m.id));
    return { matchId: m.id, status: after!.status, tournamentStatus: ctx.tournament.status };
  });
}

/** PATCH /matches/order — reorder unplayed matches within one stage (§4.6). */
export async function reorderMatches(
  userId: string | null,
  tournamentId: string,
  orderedIds: string[],
): Promise<{ numbers: { id: string; matchNumber: number }[] }> {
  const access = await requireRole(userId, tournamentId, 'matches:edit');
  return inTournament(access.userId, tournamentId, async (ctx) => {
    const all = await ctx.tx
      .select({
        id: matches.id,
        matchNumber: matches.matchNumber,
        stage: matches.stage,
        status: matches.status,
        round: matches.round,
      })
      .from(matches)
      .where(eq(matches.tournamentId, tournamentId));
    const res = reorderWithinStage(all, orderedIds);
    if (!res.ok) throw ruleViolation(res.reason, REORDER_MESSAGES[res.reason]);
    const moved = res.numbers.filter(
      (n) => all.find((m) => m.id === n.id)!.matchNumber !== n.matchNumber,
    );
    // Two passes so the unique (tournament_id, match_number) index never sees a duplicate.
    for (const n of moved) {
      await ctx.tx.update(matches).set({ matchNumber: -n.matchNumber }).where(eq(matches.id, n.id));
    }
    for (const n of moved) {
      await ctx.tx
        .update(matches)
        .set({ matchNumber: n.matchNumber, updatedAt: sql`now()` })
        .where(eq(matches.id, n.id));
      ctx.changedMatchIds.add(n.id);
    }
    if (moved.length > 0) {
      await writeAudit(ctx.tx, {
        tournamentId,
        actorUserId: ctx.userId,
        action: 'matches.reordered',
        after: { numbers: moved },
      });
    }
    return { numbers: res.numbers };
  });
}
