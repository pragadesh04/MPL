import { notFound } from 'next/navigation';
import { LeaderboardCard } from '@/features/format/components/leaderboard-card';
import { TournamentHeader } from '@/features/format/components/tournament-header';
import { getSessionUserId } from '@/server/auth/session';
import { isAppError } from '@/server/errors';
import { getStats } from '@/server/services/stats/stats';

export const metadata = { title: 'Stats' };

/** Stats & leaderboards (§7.13): most kills, best K/D, MVPs, most expensive, best value. */
export default async function StatsPage({ params }: PageProps<'/t/[id]/stats'>) {
  const { id } = await params;
  let data;
  try {
    data = await getStats(await getSessionUserId(), id);
  } catch (err) {
    if (isAppError(err) && err.code === 'NOT_FOUND') notFound();
    throw err;
  }
  const teams = new Map(data.teams.map((t) => [t.id, t]));
  const lb = data.leaderboards;
  return (
    <>
      <TournamentHeader
        tournament={data.tournament}
        isOrganiser={data.viewer.isOrganiser}
        title="Stats"
      />
      <p className="mb-4 text-sm text-muted">
        From the per-soldier kills, deaths and MVPs organisers enter with each result.
      </p>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <LeaderboardCard title="Most kills" unit="K" rows={lb.kills} teams={teams} />
        <LeaderboardCard title="Best K/D" unit="K/D" rows={lb.kd} teams={teams} />
        <LeaderboardCard title="MVP awards" unit="MVP" rows={lb.mvps} teams={teams} />
        <LeaderboardCard
          title="Most expensive soldier"
          unit="MP"
          rows={lb.expensive}
          teams={teams}
        />
        <LeaderboardCard title="Best-value buy" unit="K/MP" rows={lb.value} teams={teams} />
      </div>
    </>
  );
}
