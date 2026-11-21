import { TournamentNav } from '@/components/shell/tournament-nav';
import { tournamentNavItems } from '@/lib/navigation';
import { getSessionUserId } from '@/server/auth/session';
import { loadTournamentRole } from '@/server/services/roles';

/**
 * Shared frame for every `/t/[id]/…` page (PLAN §13.8 I3): role- and stage-based navigation
 * across Lane A (setup, people, teams, settings), Lane B (auction, command post, allocation) and
 * Lane C (home, matches, groups, knockout, squads, stats, audit).
 *
 * It never 404s by itself: pending people (key sign-ups waiting for approval) have no role yet
 * but still open their own "waiting for approval" pages, and every page enforces its own access.
 * Without a role there is simply no navigation.
 */
export default async function TournamentLayout({ children, params }: LayoutProps<'/t/[id]'>) {
  const { id } = await params;
  const userId = await getSessionUserId();
  const access = userId ? await loadTournamentRole(userId, id) : null;
  const items =
    access && access.roles.length > 0 ? tournamentNavItems(id, access.roles, access.status) : [];
  return (
    <>
      <TournamentNav items={items} />
      {children}
    </>
  );
}
