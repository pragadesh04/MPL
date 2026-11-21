import 'server-only';
import { filterMatches, type MatchFilters } from '@/features/format/filters';
import type { MatchView } from '@/features/format/types';
import type { TournamentTree } from '@/lib/rules/buildTournamentTree';
import { getFormatPageData } from '../format/data';

export type MatchesHubResponse =
  | { view: 'list'; serverNow: string; matches: MatchView[] }
  | { view: 'tree'; serverNow: string; tree: TournamentTree };

/**
 * GET /api/tournaments/:id/matches?view=list|tree&stage=&team=&status= — any participant (404 for
 * everyone else, §4.6). List and tree come from the same match rows.
 */
export async function getMatchesHub(
  userId: string | null,
  tournamentId: string,
  query: { view: 'list' | 'tree'; filters: MatchFilters },
): Promise<MatchesHubResponse> {
  const data = await getFormatPageData(userId, tournamentId);
  if (query.view === 'tree') return { view: 'tree', serverNow: data.serverNow, tree: data.tree };
  const teams = new Map(data.teams.map((t) => [t.id, t]));
  return {
    view: 'list',
    serverNow: data.serverNow,
    matches: filterMatches(data.matches, query.filters, teams),
  };
}
