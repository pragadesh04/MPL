import { MonitorPlay } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ChampionScreen } from '@/features/format/components/champion-screen';
import { FormatProvider } from '@/features/format/components/match-context';
import { NowPlayingBanner } from '@/features/format/components/now-playing';
import { TournamentHeader } from '@/features/format/components/tournament-header';
import { hasFormat } from '@/features/format/status';
import { AnnouncementForm } from '@/features/public/components/announcement-form';
import { RulesCards } from '@/features/public/components/rules-cards';
import { TournamentHero } from '@/features/public/components/tournament-hero';
import { getSessionUserId } from '@/server/auth/session';
import { isAppError } from '@/server/errors';
import { getTournamentHome, type TournamentHomeData } from '@/server/services/format/home';

export const metadata = { title: 'Tournament' };

async function load(id: string): Promise<TournamentHomeData> {
  try {
    return await getTournamentHome(await getSessionUserId(), id);
  } catch (err) {
    if (isAppError(err) && err.code === 'NOT_FOUND') notFound();
    throw err;
  }
}

/**
 * Tournament home (§7): status badges, the announcement banner, a hero with the name, the
 * champion once decided, what's playing now, and "Rules of engagement" generated from settings.
 * Every participant role; 404 for anyone else.
 */
export default async function TournamentHomePage({ params }: PageProps<'/t/[id]'>) {
  const { id } = await params;
  const data = await load(id);
  const champion = data.championTeamId
    ? data.teams.find((t) => t.id === data.championTeamId)
    : undefined;

  return (
    <FormatProvider data={data}>
      <TournamentHeader tournament={data.tournament} isOrganiser={data.viewer.isOrganiser} />
      <div className="space-y-8">
        <TournamentHero
          name={data.tournament.name}
          status={data.tournament.status}
          counts={data.counts}
        />
        {data.viewer.canPostAnnouncement ? (
          <AnnouncementForm
            tournamentId={data.tournament.id}
            current={data.tournament.announcement}
          />
        ) : null}
        {champion ? (
          <ChampionScreen
            team={champion}
            squad={data.players.filter((p) => p.teamId === champion.id)}
          />
        ) : null}
        {hasFormat(data.tournament.status) && !champion ? <NowPlayingBanner /> : null}
        <RulesCards rules={data.rules} />
        {data.viewer.isOrganiser && data.tournament.liveScreenEnabled ? (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface/60 p-4 text-sm">
            <MonitorPlay className="size-5 text-lime" aria-hidden />
            <span className="flex-1 text-muted">
              Big screen for the projector (no login): the auction, then groups, bracket and
              champion.
            </span>
            <Button asChild variant="outline" size="sm">
              <Link href={`/live/${data.tournament.liveCode}`} target="_blank">
                Open big screen
              </Link>
            </Button>
          </div>
        ) : null}
      </div>
    </FormatProvider>
  );
}
