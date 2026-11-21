'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { AnnouncementBanner } from '@/components/shell/announcement-banner';
import { ChampionScreen } from '@/features/format/components/champion-screen';
import { CeremonyOnce } from '@/features/format/components/ceremony-once';
import { LiveRefresh } from '@/features/format/components/live-refresh';
import { FormatProvider, useFormat } from '@/features/format/components/match-context';
import { nowPlaying } from '@/features/format/components/now-playing';
import { StandingsTable } from '@/features/format/components/standings-table';
import { TeamSlot } from '@/features/format/components/team-slot';
import { TreeView } from '@/features/format/components/tree-view';
import type { FormatPageData, HomeCounts, MatchView } from '@/features/format/types';
import { cn } from '@/lib/utils';
import { ServiceWorkerRegister } from './service-worker';
import { StatusPills } from './tournament-hero';

type ViewId = 'draw' | 'standings' | 'bracket' | 'matches' | 'champion';
const LABELS: Record<ViewId, string> = {
  draw: 'The draw',
  standings: 'Standings',
  bracket: 'Bracket',
  matches: 'Match order',
  champion: 'Champions',
};
const ROTATE_MS = 20_000;

/** Views the big screen cycles through for the current stage (§7.7, non-auction part). */
export function bigScreenViews(
  data: Pick<FormatPageData, 'tournament' | 'groups' | 'championTeamId' | 'matches'>,
): ViewId[] {
  if (data.championTeamId) return ['champion', 'bracket'];
  switch (data.tournament.status) {
    case 'GROUP_DRAW':
      return ['draw'];
    case 'GROUP_STAGE':
      return data.groups.length > 0
        ? ['standings', 'matches', 'bracket', 'draw']
        : ['matches', 'bracket'];
    case 'KNOCKOUT':
      return ['bracket', 'matches', ...(data.groups.length > 0 ? (['standings'] as const) : [])];
    default:
      return data.matches.length > 0 ? ['matches', 'bracket'] : ['draw'];
  }
}

/** Big screen / projector for groups, bracket and champion (no login; 1080p, read-only). */
export function BigScreenFormat({ data, counts }: { data: FormatPageData; counts: HomeCounts }) {
  return (
    <FormatProvider data={data}>
      <Screen counts={counts} />
    </FormatProvider>
  );
}

function Screen({ counts }: { counts: HomeCounts }) {
  const { data, teams } = useFormat();
  const reduced = useReducedMotion();
  const views = useMemo(() => bigScreenViews(data), [data]);
  const [index, setIndex] = useState(0);
  const view = views[index % views.length]!;

  useEffect(() => {
    if (views.length < 2) return;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % views.length), ROTATE_MS);
    return () => window.clearInterval(id);
  }, [views.length]);

  const champion = data.championTeamId ? teams.get(data.championTeamId) : undefined;

  return (
    <div className="flex min-h-dvh flex-col gap-6 p-8">
      <LiveRefresh tournamentId={data.tournament.id} />
      <ServiceWorkerRegister />
      <AnnouncementBanner
        text={data.tournament.announcement}
        className="rounded-md border text-xl"
      />
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-5xl tracking-wide">{data.tournament.name}</h1>
        <StatusPills status={data.tournament.status} counts={counts} />
      </header>
      {views.length > 1 ? (
        <nav aria-label="Screens" className="flex gap-2">
          {views.map((v, i) => (
            <button
              key={v}
              type="button"
              onClick={() => setIndex(i)}
              aria-current={v === view ? 'true' : undefined}
              className={cn(
                'rounded-full border px-4 py-1.5 text-sm font-bold tracking-widest uppercase',
                v === view ? 'border-lime text-lime' : 'border-border text-muted',
              )}
            >
              {LABELS[v]}
            </button>
          ))}
        </nav>
      ) : null}
      <AnimatePresence mode="wait">
        <motion.main
          key={view}
          initial={reduced ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduced ? undefined : { opacity: 0, y: -16 }}
          transition={{ duration: 0.35 }}
          className="flex-1"
        >
          {view === 'champion' && champion ? (
            <ChampionScreen
              team={champion}
              squad={data.players.filter((p) => p.teamId === champion.id)}
              large
            />
          ) : view === 'draw' ? (
            data.groups.length > 0 ? (
              <CeremonyOnce
                tournamentId={data.tournament.id}
                groups={data.groups}
                teams={data.teams}
                large
              />
            ) : (
              <p className="py-24 text-center font-display text-5xl text-muted">
                The group draw is about to begin…
              </p>
            )
          ) : view === 'standings' ? (
            <div className="grid gap-6 xl:grid-cols-2">
              {data.groups.map((g) => (
                <section
                  key={g.id}
                  className="rounded-lg border border-border bg-surface/80 p-5 text-lg"
                >
                  <h2 className="mb-3 font-display text-3xl tracking-wider text-lime">
                    Group {g.name}
                  </h2>
                  <StandingsTable rows={g.standings} teams={teams} advance={g.advance} />
                </section>
              ))}
            </div>
          ) : view === 'bracket' ? (
            <TreeView minimal showGroups={data.tournament.status === 'GROUP_STAGE'} />
          ) : (
            <MatchOrder />
          )}
        </motion.main>
      </AnimatePresence>
    </div>
  );
}

/** Now playing + the next matches in running order, big. */
function MatchOrder() {
  const { data, teams } = useFormat();
  const { live } = nowPlaying(data.matches);
  const upcoming = data.matches
    .filter((m) => !m.isBye && m.status === 'SCHEDULED' && m.matchNumber !== null)
    .slice(0, 6);
  const recent = data.matches
    .filter((m) => m.status === 'DONE' && !m.isBye)
    .slice(-3)
    .reverse();
  const row = (m: MatchView, tone: 'live' | 'next' | 'done') => (
    <li
      key={m.id}
      className={cn(
        'flex items-center gap-5 rounded-lg border bg-surface/80 px-5 py-4 text-xl',
        tone === 'live' ? 'animate-pulse-glow border-blood' : 'border-border',
      )}
    >
      <span className="w-16 font-numeric text-2xl font-bold text-lime">M{m.matchNumber}</span>
      <span className="w-56 text-sm font-semibold tracking-widest text-muted uppercase">
        {m.stageLabel}
      </span>
      <TeamSlot team={m.teamAId ? teams.get(m.teamAId) : undefined} label={m.labelA} size="lg" />
      <span className="font-numeric text-2xl font-bold">
        {m.score ? `${m.score.a}–${m.score.b}` : 'vs'}
      </span>
      <TeamSlot team={m.teamBId ? teams.get(m.teamBId) : undefined} label={m.labelB} size="lg" />
    </li>
  );
  return (
    <div className="grid gap-8 xl:grid-cols-2">
      <section className="space-y-3">
        {live.length > 0 ? (
          <>
            <h2 className="font-display text-3xl tracking-wider text-blood">Now playing</h2>
            <ul className="space-y-3">{live.map((m) => row(m, 'live'))}</ul>
          </>
        ) : null}
        <h2 className="font-display text-3xl tracking-wider text-amber">Up next</h2>
        <ul className="space-y-3">{upcoming.map((m) => row(m, 'next'))}</ul>
      </section>
      {recent.length > 0 ? (
        <section className="space-y-3">
          <h2 className="font-display text-3xl tracking-wider text-sand">Latest results</h2>
          <ul className="space-y-3">{recent.map((m) => row(m, 'done'))}</ul>
        </section>
      ) : null}
    </div>
  );
}
