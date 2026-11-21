'use client';

import { Route, Trophy } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { TeamChip } from '@/components/ui/team-chip';
import type { TreeNode } from '@/lib/rules/buildTournamentTree';
import { teamStyle } from '@/lib/team-color';
import { cn } from '@/lib/utils';
import { layoutTree } from '../tree-layout';
import { useFormat } from './match-context';
import { TeamSlot } from './team-slot';
import { ZoomPan } from './zoom-pan';

/**
 * Tree mode (§7.10a) and the knockout screen (§7.12): group cards with mini standings → knockout
 * rounds → final → champion, with connector lines, M-number badges, the live match pulsing and the
 * winner path in the team colour. "My team path" highlights the viewer's route. Built from
 * `buildTournamentTree`, i.e. the same match rows as the list.
 */
export function TreeView({
  showGroups = true,
  fileName = 'mpl-bracket.png',
  minimal = false,
}: {
  showGroups?: boolean;
  fileName?: string;
  /** Big screen: no toolbar, no "My team path". */
  minimal?: boolean;
}) {
  const { data, teams, openMatch } = useFormat();
  const myTeamId = data.viewer.myTeamId;
  const [myPath, setMyPath] = useState(myTeamId !== null);
  const tree = data.tree;
  const layout = useMemo(() => layoutTree(tree, { showGroups }), [tree, showGroups]);
  const nodesById = useMemo(() => {
    const all = [
      ...tree.rounds.flatMap((r) => r.nodes),
      ...(tree.thirdPlace ? [tree.thirdPlace] : []),
    ];
    return new Map(all.map((n) => [n.matchId, n]));
  }, [tree]);

  const highlight = myPath && myTeamId !== null;
  const involves = (n: TreeNode): boolean =>
    n.match.teamAId === myTeamId || n.match.teamBId === myTeamId;
  const myTeam = myTeamId ? teams.get(myTeamId) : undefined;
  const champion = tree.championTeamId ? teams.get(tree.championTeamId) : undefined;

  if (tree.rounds.length === 0 && (!showGroups || tree.groups.length === 0)) {
    return (
      <p className="rounded-lg border border-border p-6 text-center text-muted">
        The tree appears once the groups are drawn.
      </p>
    );
  }

  return (
    <ZoomPan
      width={layout.width}
      height={layout.height}
      fileName={fileName}
      minimal={minimal}
      toolbarExtra={
        myTeam ? (
          <Button
            type="button"
            size="sm"
            variant={myPath ? 'default' : 'outline'}
            aria-pressed={myPath}
            onClick={() => setMyPath((v) => !v)}
          >
            <Route aria-hidden /> My team path
          </Button>
        ) : null
      }
    >
      <svg
        width={layout.width}
        height={layout.height}
        className="pointer-events-none absolute inset-0"
        aria-hidden
      >
        {layout.connectors.map((c) => {
          const from = nodesById.get(c.from);
          const winner =
            from?.match.status === 'DONE' && from.match.winnerTeamId
              ? teams.get(from.match.winnerTeamId)
              : undefined;
          const to = nodesById.get(c.to);
          const onMyPath =
            highlight && to !== undefined && involves(to) && (from === undefined || involves(from));
          const coloured = winner ?? (onMyPath ? myTeam : undefined);
          return (
            <path
              key={`${c.from}-${c.to}-${c.slot}`}
              d={c.d}
              fill="none"
              style={coloured ? teamStyle(coloured.color) : undefined}
              className={cn(
                coloured ? '[stroke:var(--team)]' : 'stroke-border',
                highlight && !onMyPath ? 'opacity-25' : 'opacity-90',
              )}
              strokeWidth={coloured ? 3 : 1.5}
            />
          );
        })}
      </svg>

      {layout.groups.map((box) => {
        const g = tree.groups.find((x) => x.groupId === box.groupId)!;
        const rows = g.standings.length > 0 ? g.standings.map((r) => r.teamId) : g.teamIds;
        return (
          <div
            key={g.groupId}
            className="absolute rounded-md border border-border bg-surface"
            style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
          >
            <p className="flex h-[34px] items-center px-3 font-display tracking-wider text-lime">
              Group {g.name}
            </p>
            <ol>
              {rows.map((teamId, i) => {
                const team = teams.get(teamId);
                const qualifies = i < g.advancePerGroup;
                const mine = highlight && teamId === myTeamId;
                return (
                  <li
                    key={teamId}
                    style={mine && team ? teamStyle(team.color) : undefined}
                    className={cn(
                      'flex h-[26px] items-center gap-2 px-3 text-xs',
                      qualifies && 'border-l-2 border-lime',
                      i === g.advancePerGroup - 1 && 'border-b border-dashed border-b-lime/50',
                      mine && 'bg-surface-2',
                      highlight && !mine && 'opacity-40',
                    )}
                  >
                    <span className="w-6 font-numeric text-muted">
                      {g.name}
                      {i + 1}
                    </span>
                    {team ? (
                      <TeamChip
                        name={team.name}
                        shortName={team.shortName}
                        color={team.color}
                        size="sm"
                      />
                    ) : null}
                    <span className="tabular ml-auto font-numeric">
                      {g.standings[i]?.points ?? ''}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        );
      })}

      {layout.nodes.map((box) => {
        const n = nodesById.get(box.matchId)!;
        const m = n.match;
        const a = m.teamAId ? teams.get(m.teamAId) : undefined;
        const b = m.teamBId ? teams.get(m.teamBId) : undefined;
        const mine = highlight && involves(n);
        return (
          <button
            key={box.matchId}
            type="button"
            onClick={() => openMatch(m.id)}
            aria-label={`${n.roundName}${m.matchNumber ? ` M${m.matchNumber}` : ''}`}
            style={{
              left: box.x,
              top: box.y,
              width: box.w,
              height: box.h,
              ...(mine && myTeam ? teamStyle(myTeam.color) : {}),
            }}
            className={cn(
              'absolute flex flex-col justify-center gap-1 rounded-md border bg-surface px-2 text-left transition-opacity hover:border-lime-dim',
              m.isBye ? 'border-dashed border-border opacity-70' : 'border-border',
              m.status === 'LIVE' && 'animate-pulse-glow border-blood',
              mine && 'border-team border-2',
              highlight && !mine && 'opacity-35',
            )}
          >
            <span className="absolute -top-2.5 left-2 rounded-sm bg-background px-1 text-[0.625rem] font-bold tracking-widest text-lime uppercase">
              {m.matchNumber ? `M${m.matchNumber}` : 'Bye'} · {n.roundName}
            </span>
            {(['A', 'B'] as const).map((side) => {
              const team = side === 'A' ? a : b;
              const won = team !== undefined && m.winnerTeamId === team.id && m.status === 'DONE';
              return (
                <span
                  key={side}
                  className={cn(
                    'flex items-center justify-between gap-2',
                    m.status === 'DONE' && !won && 'opacity-60',
                  )}
                >
                  <TeamSlot
                    team={team}
                    label={side === 'A' ? n.labelA : n.labelB}
                    size="sm"
                    winner={won}
                  />
                  {m.score ? (
                    <span
                      className={cn('tabular font-numeric text-sm', won && 'font-bold text-lime')}
                    >
                      {side === 'A' ? m.score.a : m.score.b}
                    </span>
                  ) : null}
                </span>
              );
            })}
          </button>
        );
      })}

      {layout.champion ? (
        <div
          style={{
            left: layout.champion.x,
            top: layout.champion.y,
            width: layout.champion.w,
            height: layout.champion.h,
            ...(champion ? teamStyle(champion.color) : {}),
          }}
          className={cn(
            'absolute flex flex-col items-center justify-center gap-2 rounded-lg border-2 text-center',
            champion ? 'border-team bg-surface' : 'border-dashed border-border text-muted',
          )}
        >
          <Trophy className={cn('size-8', champion ? 'text-gold' : 'text-muted')} aria-hidden />
          {champion ? (
            <TeamChip name={champion.name} shortName={champion.shortName} color={champion.color} />
          ) : (
            <span className="text-sm">Champion</span>
          )}
        </div>
      ) : null}
    </ZoomPan>
  );
}
