import 'server-only';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { can, isOrganiserRole } from '@/lib/permissions';
import {
  buildTournamentTree,
  sourceLabel,
  type TreeInputMatch,
} from '@/lib/rules/buildTournamentTree';
import { computeStandings } from '@/lib/rules/computeStandings';
import { roundName, THIRD_PLACE_NAME } from '@/lib/rules/knockout';
import { advancePerGroupOf, planFormat } from '@/lib/rules/planFormat';
import { parseSettings, type TournamentSettings } from '@/lib/schemas/settings';
import type {
  FormatData,
  FormatPageData,
  FormatSettingsView,
  GameView,
  GroupView,
  MatchView,
  PlayerStatView,
  PlayerView,
  TeamView,
  Viewer,
} from '@/features/format/types';
import { getReadDb, type Db } from '../../db/client';
import {
  groups,
  groupTeams,
  leaders,
  matches,
  matchGames,
  players,
  playerStats,
  teams,
  tournaments,
} from '../../db/schema';
import { dbNow } from '../../db/sql';
import { notFound } from '../../errors';
import { requireParticipant, type TournamentAccess } from '../roles';
import { loadDrawOrders } from './standings';

export function formatSettingsView(s: TournamentSettings): FormatSettingsView {
  return {
    groupCount: s.groupCount,
    advancePerGroup: s.advancePerGroup,
    roundRobinLegs: s.roundRobinLegs,
    groupMatchBestOf: s.groupMatchBestOf,
    knockoutBestOf: s.knockoutBestOf,
    finalBestOf: s.finalBestOf,
    pointsForWin: s.pointsForWin,
    thirdPlaceMatch: s.thirdPlaceMatch,
  };
}

/** Games won per side, or null when no game is recorded. */
export function scoreOf(
  games: { killsA: number; killsB: number }[],
): { a: number; b: number } | null {
  if (games.length === 0) return null;
  const a = games.filter((g) => g.killsA > g.killsB).length;
  return { a, b: games.length - a };
}

/**
 * Everything the format screens need for one tournament, with standings computed from results
 * (never stored) and the tree built from the same match rows as the list (§7.10a). No access
 * check: callers authorise first (`getFormatPageData`, or the live screen's liveCode check).
 */
export async function loadFormatData(
  tournamentId: string,
  db: Db = getReadDb(),
): Promise<FormatData> {
  const [t] = await db.select().from(tournaments).where(eq(tournaments.id, tournamentId)).limit(1);
  if (!t) throw notFound();
  const settings = parseSettings(t.settings);

  const [teamRows, groupRows, memberRows, matchRows, drawOrders, serverNow] = await Promise.all([
    db
      .select({
        id: teams.id,
        name: teams.name,
        shortName: teams.shortName,
        color: teams.color,
        emoji: teams.emoji,
        logoUrl: teams.logoUrl,
        motto: teams.motto,
        sortOrder: teams.sortOrder,
        captainName: leaders.name,
        purseTotal: leaders.purseTotal,
        purseRemaining: leaders.purseRemaining,
      })
      .from(teams)
      .innerJoin(leaders, eq(leaders.id, teams.leaderId))
      .where(eq(teams.tournamentId, tournamentId))
      .orderBy(asc(teams.sortOrder), asc(teams.name)),
    db
      .select()
      .from(groups)
      .where(eq(groups.tournamentId, tournamentId))
      .orderBy(asc(groups.sortOrder), asc(groups.name)),
    db
      .select()
      .from(groupTeams)
      .where(eq(groupTeams.tournamentId, tournamentId))
      .orderBy(asc(groupTeams.pot)),
    db
      .select()
      .from(matches)
      .where(eq(matches.tournamentId, tournamentId))
      .orderBy(asc(matches.matchNumber), asc(matches.round), asc(matches.slot)),
    loadDrawOrders(db, tournamentId),
    dbNow(db),
  ]);

  const matchIds = matchRows.map((m) => m.id);
  const [gameRows, statRows, playerRows] = await Promise.all([
    matchIds.length === 0
      ? []
      : db
          .select()
          .from(matchGames)
          .where(inArray(matchGames.matchId, matchIds))
          .orderBy(asc(matchGames.gameNo)),
    matchIds.length === 0
      ? []
      : db.select().from(playerStats).where(inArray(playerStats.matchId, matchIds)),
    db
      .select({
        id: players.id,
        teamId: players.teamId,
        name: players.name,
        ign: players.ign,
        photoUrl: players.photoUrl,
        soldPrice: players.soldPrice,
        acquiredVia: players.acquiredVia,
      })
      .from(players)
      .where(
        and(eq(players.tournamentId, tournamentId), inArray(players.status, ['SOLD', 'ALLOCATED'])),
      )
      .orderBy(desc(players.soldPrice), asc(players.name)),
  ]);
  const statsByMatch = new Map<string, PlayerStatView[]>();
  for (const r of statRows) {
    const list = statsByMatch.get(r.matchId) ?? [];
    list.push({ playerId: r.playerId, kills: r.kills, deaths: r.deaths, mvp: r.mvp });
    statsByMatch.set(r.matchId, list);
  }
  const playerViews: PlayerView[] = playerRows.flatMap((p) =>
    p.teamId && p.acquiredVia
      ? [{ ...p, teamId: p.teamId, soldPrice: p.soldPrice ?? 0, acquiredVia: p.acquiredVia }]
      : [],
  );
  const gamesByMatch = new Map<string, GameView[]>();
  for (const g of gameRows) {
    const list = gamesByMatch.get(g.matchId) ?? [];
    list.push({
      gameNo: g.gameNo,
      map: g.map,
      killsA: g.killsA,
      killsB: g.killsB,
      winnerTeamId: g.winnerTeamId,
    });
    gamesByMatch.set(g.matchId, list);
  }

  const teamViews: TeamView[] = teamRows.map((r) => ({
    ...r,
    spent: r.purseTotal - r.purseRemaining,
  }));
  const plan = planFormat(teamViews.length, settings);
  const advance = advancePerGroupOf(plan);

  // Group views + standings (matches in running order, so "form" reads right).
  const groupMatches = matchRows.filter((m) => m.stage === 'GROUP');
  const groupViews: GroupView[] = groupRows.map((g) => {
    const members = memberRows.filter((m) => m.groupId === g.id);
    const own = groupMatches.filter((m) => m.groupId === g.id);
    const standings = computeStandings({
      teamIds: members.map((m) => m.teamId),
      matches: own.map((m) => ({
        matchId: m.id,
        teamAId: m.teamAId ?? '',
        teamBId: m.teamBId ?? '',
        status: m.status,
        winnerTeamId: m.winnerTeamId,
        games: gamesByMatch.get(m.id) ?? [],
      })),
      pointsForWin: settings.pointsForWin,
      drawOrder: drawOrders.get(g.id),
    });
    const complete = own.length > 0 && own.every((m) => m.status === 'DONE');
    return {
      id: g.id,
      name: g.name,
      teams: members.map((m) => ({ teamId: m.teamId, pot: m.pot })),
      standings,
      complete,
      advance,
      needsTiebreakDraw: complete && standings.some((r) => r.needsDraw && r.position <= advance),
    };
  });

  const groupNameById = new Map(groupRows.map((g) => [g.id, g.name]));
  const numberById = new Map(matchRows.map((m) => [m.id, m.matchNumber]));
  const totalRounds = Math.max(
    0,
    ...matchRows.filter((m) => m.stage === 'KNOCKOUT').map((m) => m.round ?? 0),
  );

  const matchViews: MatchView[] = matchRows.map((m) => {
    const games = gamesByMatch.get(m.id) ?? [];
    const stageLabel =
      m.stage === 'GROUP'
        ? `Group ${groupNameById.get(m.groupId ?? '') ?? '?'} · Matchday ${m.matchday ?? 1}`
        : m.stage === 'THIRD_PLACE'
          ? THIRD_PLACE_NAME
          : roundName(totalRounds - (m.round ?? 1) + 1, totalRounds);
    return {
      id: m.id,
      matchNumber: m.matchNumber,
      stage: m.stage,
      groupId: m.groupId,
      groupName: m.groupId ? (groupNameById.get(m.groupId) ?? null) : null,
      matchday: m.matchday,
      round: m.round,
      slot: m.slot,
      stageLabel,
      teamAId: m.teamAId,
      teamBId: m.teamBId,
      sourceA: m.sourceA ?? null,
      sourceB: m.sourceB ?? null,
      labelA: m.teamAId ? null : sourceLabel(m.sourceA ?? null, groupNameById, numberById),
      labelB: m.teamBId
        ? null
        : m.isBye
          ? 'BYE'
          : sourceLabel(m.sourceB ?? null, groupNameById, numberById),
      bestOf: m.bestOf,
      winnerTeamId: m.winnerTeamId,
      nextMatchId: m.nextMatchId,
      nextSlot: m.nextSlot === 'A' || m.nextSlot === 'B' ? m.nextSlot : null,
      isBye: m.isBye,
      status: m.status,
      scheduledAt: m.scheduledAt ? m.scheduledAt.toISOString() : null,
      games,
      playerStats: statsByMatch.get(m.id) ?? [],
      score: scoreOf(games),
    };
  });
  // Numbered matches in running order first, byes last.
  matchViews.sort(
    (a, b) =>
      (a.matchNumber ?? Number.MAX_SAFE_INTEGER) - (b.matchNumber ?? Number.MAX_SAFE_INTEGER),
  );

  const treeMatches: TreeInputMatch[] = matchViews.map((m) => ({
    id: m.id,
    matchNumber: m.matchNumber,
    stage: m.stage,
    groupId: m.groupId,
    round: m.round,
    slot: m.slot,
    teamAId: m.teamAId,
    teamBId: m.teamBId,
    sourceA: m.sourceA,
    sourceB: m.sourceB,
    winnerTeamId: m.winnerTeamId,
    nextMatchId: m.nextMatchId,
    isBye: m.isBye,
    status: m.status,
    score: m.score,
  }));
  const tree = buildTournamentTree(
    groupViews.map((g) => ({
      groupId: g.id,
      name: g.name,
      teamIds: g.teams.map((x) => x.teamId),
      standings: g.standings,
      advancePerGroup: g.advance,
    })),
    treeMatches,
  );

  return {
    tournament: {
      id: t.id,
      name: t.name,
      status: t.status,
      announcement: t.announcement,
      liveCode: t.liveCode,
      liveScreenEnabled: t.liveScreenEnabled,
    },
    settings: formatSettingsView(settings),
    plan,
    teams: teamViews,
    players: playerViews,
    groups: groupViews,
    matches: matchViews,
    tree,
    readyForKnockout:
      t.status === 'GROUP_STAGE' && groupViews.length > 0 && groupViews.every((g) => g.complete),
    championTeamId: tree.championTeamId,
    serverNow: serverNow.toISOString(),
  };
}

/** The soldier's or captain's own team in this tournament, if any. */
export async function myTeamId(
  access: TournamentAccess,
  db: Db = getReadDb(),
): Promise<string | null> {
  if (access.teamId) return access.teamId;
  if (!access.playerId) return null;
  const [row] = await db
    .select({ teamId: players.teamId })
    .from(players)
    .where(eq(players.id, access.playerId))
    .limit(1);
  return row?.teamId ?? null;
}

export async function viewerFor(access: TournamentAccess, db: Db = getReadDb()): Promise<Viewer> {
  return {
    userId: access.userId,
    roles: access.roles,
    canEditMatches: can(access.roles, 'matches:edit'),
    canAdvance: can(access.roles, 'stage:advance'),
    canPostAnnouncement: can(access.roles, 'announcement:post'),
    isOrganiser: access.roles.some(isOrganiserRole),
    myTeamId: await myTeamId(access, db),
  };
}

/** Any participant (404 for everyone else, §4.6): format data plus who is looking. */
export async function getFormatPageData(
  userId: string | null,
  tournamentId: string,
  db: Db = getReadDb(),
): Promise<FormatPageData> {
  const access = await requireParticipant(userId, tournamentId, db);
  const [data, viewer] = await Promise.all([
    loadFormatData(tournamentId, db),
    viewerFor(access, db),
  ]);
  return { ...data, viewer };
}
