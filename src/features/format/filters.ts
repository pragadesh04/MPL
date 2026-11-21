import type { MatchStage, MatchStatus } from '@/lib/schemas/enums';
import type { MatchView, TeamView } from './types';

/** Matches hub filters (§7.10a). Also used by GET /api/tournaments/:id/matches. */
export interface MatchFilters {
  /** Only matches of this team (the viewer's own team for "My team"). */
  teamId?: string | null;
  stage?: MatchStage | null;
  groupId?: string | null;
  status?: MatchStatus | null;
  /** Case-insensitive team name / short code search. */
  search?: string | null;
  /** Byes are hidden from the list unless asked for. */
  includeByes?: boolean;
}

export function filterMatches(
  matches: readonly MatchView[],
  filters: MatchFilters,
  teams: ReadonlyMap<string, TeamView>,
): MatchView[] {
  const q = filters.search?.trim().toLowerCase() ?? '';
  return matches.filter((m) => {
    if (m.isBye && !filters.includeByes) return false;
    if (filters.teamId && m.teamAId !== filters.teamId && m.teamBId !== filters.teamId)
      return false;
    if (filters.stage && m.stage !== filters.stage) return false;
    if (filters.groupId && m.groupId !== filters.groupId) return false;
    if (filters.status && m.status !== filters.status) return false;
    if (q) {
      const names = [m.teamAId, m.teamBId]
        .map((id) => (id ? teams.get(id) : undefined))
        .flatMap((t) => (t ? [t.name.toLowerCase(), t.shortName.toLowerCase()] : []));
      if (!names.some((n) => n.includes(q))) return false;
    }
    return true;
  });
}

/** Stage separators for the list: "Group stage", "Quarter-final", "3rd place", "Final"… */
export function sectionLabel(m: MatchView): string {
  return m.stage === 'GROUP' ? 'Group stage' : m.stageLabel;
}

/** Split matches (already in running order) into consecutive sections. */
export function sections(matches: readonly MatchView[]): { label: string; matches: MatchView[] }[] {
  const out: { label: string; matches: MatchView[] }[] = [];
  for (const m of matches) {
    const label = sectionLabel(m);
    const last = out[out.length - 1];
    if (last && last.label === label) last.matches.push(m);
    else out.push({ label, matches: [m] });
  }
  return out;
}

/**
 * New order of one stage block's unplayed matches after moving `movedId` to `targetId`'s place.
 * Returns null when the move isn't possible (different block, or either match isn't unplayed).
 */
export function moveWithinBlock(
  matches: readonly MatchView[],
  movedId: string,
  targetId: string,
): string[] | null {
  const block = (m: MatchView): string => (m.stage === 'GROUP' ? 'GROUP' : 'KNOCKOUT');
  const moved = matches.find((m) => m.id === movedId);
  const target = matches.find((m) => m.id === targetId);
  if (!moved || !target || block(moved) !== block(target)) return null;
  const unplayed = matches.filter(
    (m) =>
      !m.isBye && m.matchNumber !== null && m.status === 'SCHEDULED' && block(m) === block(moved),
  );
  const ids = unplayed.map((m) => m.id);
  const from = ids.indexOf(movedId);
  const to = ids.indexOf(targetId);
  if (from < 0 || to < 0 || from === to) return null;
  ids.splice(from, 1);
  ids.splice(to, 0, movedId);
  return ids;
}
