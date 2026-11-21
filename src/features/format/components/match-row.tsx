'use client';

import { Clock } from 'lucide-react';
import { StatusPill } from '@/components/ui/status-pill';
import { teamStyle } from '@/lib/team-color';
import { cn } from '@/lib/utils';
import { MATCH_STATUS_PILL } from '../status';
import type { MatchView } from '../types';
import { LocalTime } from './local-time';
import { useFormat } from './match-context';
import { TeamSlot } from './team-slot';

/**
 * One match in the running order (§7.10a List mode): `M7 · Group B · Matchday 2 · RHN vs HWK ·
 * Bo1 · 6:30 PM · status · score`. The viewer's own team is highlighted in its colour. Tap → detail.
 */
export function MatchRow({
  match,
  upNext = false,
  showStage = true,
  className,
  dragHandle,
}: {
  match: MatchView;
  upNext?: boolean;
  showStage?: boolean;
  className?: string;
  dragHandle?: React.ReactNode;
}) {
  const { teams, data, openMatch } = useFormat();
  const myTeamId = data.viewer.myTeamId;
  const mine = myTeamId !== null && (match.teamAId === myTeamId || match.teamBId === myTeamId);
  const myTeam = mine ? teams.get(myTeamId) : undefined;
  const pill = MATCH_STATUS_PILL[match.status];
  const a = match.teamAId ? teams.get(match.teamAId) : undefined;
  const b = match.teamBId ? teams.get(match.teamBId) : undefined;

  return (
    <div
      style={myTeam ? teamStyle(myTeam.color) : undefined}
      className={cn(
        'flex items-stretch rounded-md border bg-surface/80 transition-colors',
        mine ? 'border-team' : 'border-border',
        match.status === 'LIVE' && 'animate-pulse-glow border-blood',
        className,
      )}
    >
      {dragHandle}
      <button
        type="button"
        onClick={() => openMatch(match.id)}
        className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5 text-left hover:bg-surface-2/50"
        aria-label={`Match ${match.matchNumber ?? 'bye'} details`}
      >
        <span className="tabular w-10 shrink-0 font-numeric text-sm font-bold text-lime">
          {match.matchNumber ? `M${match.matchNumber}` : 'BYE'}
        </span>
        {showStage ? (
          <span className="w-full text-xs font-semibold tracking-wider text-muted uppercase sm:w-44 sm:shrink-0">
            {match.stageLabel} · Bo{match.bestOf}
          </span>
        ) : null}
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <TeamSlot
            team={a}
            label={match.labelA}
            size="sm"
            winner={match.winnerTeamId === match.teamAId && a !== undefined}
          />
          <span className="tabular shrink-0 font-numeric text-sm">
            {match.score ? (
              <span className="rounded-sm bg-surface-2 px-1.5 py-0.5 font-bold">
                {match.score.a}–{match.score.b}
              </span>
            ) : (
              <span className="text-xs text-muted">vs</span>
            )}
          </span>
          <TeamSlot
            team={b}
            label={match.labelB}
            size="sm"
            winner={match.winnerTeamId === match.teamBId && b !== undefined}
          />
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-2">
          {match.scheduledAt && match.status === 'SCHEDULED' ? (
            <span className="flex items-center gap-1 text-xs text-muted">
              <Clock className="size-3" aria-hidden />
              <LocalTime iso={match.scheduledAt} />
            </span>
          ) : null}
          {upNext && match.status === 'SCHEDULED' ? (
            <StatusPill tone="amber">Up next</StatusPill>
          ) : match.isBye ? null : (
            <StatusPill tone={pill.tone} live={pill.live}>
              {pill.label}
            </StatusPill>
          )}
        </span>
      </button>
    </div>
  );
}
