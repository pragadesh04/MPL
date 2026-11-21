import 'server-only';
import { and, count, eq, inArray, notInArray } from 'drizzle-orm';
import { rulesOfEngagement, type RuleCard } from '@/features/public/rules-of-engagement';
import type { FormatData, FormatPageData, HomeCounts, Viewer } from '@/features/format/types';
import { parseSettings } from '@/lib/schemas/settings';
import { getReadDb, type Db } from '../../db/client';
import { leaders, players, tournaments } from '../../db/schema';
import { notFound } from '../../errors';
import { requireParticipant } from '../roles';
import { loadFormatData, viewerFor } from './data';

export interface HomeExtras {
  counts: HomeCounts;
  rules: RuleCard[];
}

export interface TournamentHomeData extends FormatPageData, HomeExtras {}

/** Counts for the status pills and the Rules of engagement cards (from the real settings). */
export async function loadHomeExtras(data: FormatData, db: Db = getReadDb()): Promise<HomeExtras> {
  const tid = data.tournament.id;
  const [[t], [cap], [sol], [sq]] = await Promise.all([
    db.select({ settings: tournaments.settings }).from(tournaments).where(eq(tournaments.id, tid)),
    db
      .select({ n: count() })
      .from(leaders)
      .where(and(eq(leaders.tournamentId, tid), eq(leaders.approval, 'APPROVED'))),
    db
      .select({ n: count() })
      .from(players)
      .where(
        and(
          eq(players.tournamentId, tid),
          notInArray(players.status, ['PENDING_APPROVAL', 'REJECTED']),
        ),
      ),
    db
      .select({ n: count() })
      .from(players)
      .where(and(eq(players.tournamentId, tid), inArray(players.status, ['SOLD', 'ALLOCATED']))),
  ]);
  if (!t) throw notFound();
  return {
    counts: { captains: cap?.n ?? 0, soldiers: sol?.n ?? 0, inSquads: sq?.n ?? 0 },
    rules: rulesOfEngagement(parseSettings(t.settings), data.plan),
  };
}

/** Tournament home (§7) for any participant; 404 for everyone else. */
export async function getTournamentHome(
  userId: string | null,
  tournamentId: string,
  db: Db = getReadDb(),
): Promise<TournamentHomeData> {
  const access = await requireParticipant(userId, tournamentId, db);
  const [data, viewer] = await Promise.all([
    loadFormatData(tournamentId, db),
    viewerFor(access, db),
  ]);
  return { ...data, viewer, ...(await loadHomeExtras(data, db)) };
}

/** Read-only viewer for the public big screen: no role, nothing editable. */
export const LIVE_SCREEN_VIEWER: Viewer = {
  userId: '',
  roles: [],
  canEditMatches: false,
  canAdvance: false,
  canPostAnnouncement: false,
  isOrganiser: false,
  myTeamId: null,
};

/**
 * Public big screen `/live/:liveCode` (§4.6, §7.7): no login, but only while the organisers keep
 * the live screen enabled. Unknown or disabled codes are the same generic 404.
 */
export async function loadLiveScreen(
  liveCode: string,
  db: Db = getReadDb(),
): Promise<TournamentHomeData> {
  const [t] = await db
    .select({ id: tournaments.id, enabled: tournaments.liveScreenEnabled })
    .from(tournaments)
    .where(eq(tournaments.liveCode, liveCode))
    .limit(1);
  if (!t || !t.enabled) throw notFound();
  const data = await loadFormatData(t.id, db);
  return { ...data, viewer: LIVE_SCREEN_VIEWER, ...(await loadHomeExtras(data, db)) };
}
