'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ordinal } from '../text';
import type { GroupView, MatchView } from '../types';
import { KnockoutActions } from './knockout-actions';
import { useFormat } from './match-context';
import { MatchRow } from './match-row';
import { StandingsTable } from './standings-table';

/** Matches of one group, by matchday. */
function byMatchday(matches: MatchView[]): [number, MatchView[]][] {
  const days = new Map<number, MatchView[]>();
  for (const m of matches) days.set(m.matchday ?? 1, [...(days.get(m.matchday ?? 1) ?? []), m]);
  return [...days].sort((a, b) => a[0] - b[0]);
}

/** "What does my team need?" (§7.11): a one-line, honest summary for the viewer's own team. */
function myTeamHint(
  group: GroupView,
  matches: MatchView[],
  myTeamId: string | null,
): string | null {
  if (!myTeamId) return null;
  const row = group.standings.find((r) => r.teamId === myTeamId);
  if (!row) return null;
  const left = matches.filter(
    (m) => m.status !== 'DONE' && (m.teamAId === myTeamId || m.teamBId === myTeamId),
  ).length;
  if (left === 0) {
    return row.position <= group.advance
      ? 'Your team qualified!'
      : 'Your team’s group matches are done.';
  }
  const place =
    row.position <= group.advance
      ? 'in a qualifying place'
      : `${ordinal(row.position)}, outside the top ${group.advance}`;
  return `Your team is ${place} with ${left} match${left === 1 ? '' : 'es'} to play.`;
}

/** Standings and fixtures for every group (§7.11), plus the end-of-groups actions. */
export function GroupsBoard() {
  const { data, teams } = useFormat();
  const groupMatches = data.matches.filter((m) => m.stage === 'GROUP');
  const upNext = data.matches.find((m) => !m.isBye && m.status === 'SCHEDULED')?.id;

  return (
    <div className="space-y-6">
      <KnockoutActions />
      <Tabs defaultValue="standings">
        <TabsList>
          <TabsTrigger value="standings">Standings</TabsTrigger>
          <TabsTrigger value="fixtures">Fixtures</TabsTrigger>
        </TabsList>
        <TabsContent value="standings">
          <div className="grid gap-4 xl:grid-cols-2">
            {data.groups.map((g) => {
              const hint = myTeamHint(
                g,
                groupMatches.filter((m) => m.groupId === g.id),
                data.viewer.myTeamId,
              );
              return (
                <Card key={g.id}>
                  <CardHeader>
                    <CardTitle className="font-display text-xl tracking-wider text-lime">
                      Group {g.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <StandingsTable
                      rows={g.standings}
                      teams={teams}
                      advance={g.advance}
                      myTeamId={data.viewer.myTeamId}
                    />
                    <p className="text-xs text-muted">
                      Top {g.advance} qualify. Tie-breaks: head-to-head, game difference, kill
                      difference, total kills, then an organiser draw.
                    </p>
                    {hint ? <p className="text-sm font-semibold text-sand">{hint}</p> : null}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>
        <TabsContent value="fixtures">
          <div className="grid gap-4 xl:grid-cols-2">
            {data.groups.map((g) => (
              <Card key={g.id}>
                <CardHeader>
                  <CardTitle className="font-display text-xl tracking-wider text-lime">
                    Group {g.name}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {byMatchday(groupMatches.filter((m) => m.groupId === g.id)).map(([day, ms]) => (
                    <div key={day} className="space-y-2">
                      <p className="text-xs font-bold tracking-widest text-muted uppercase">
                        Matchday {day}
                      </p>
                      {ms.map((m) => (
                        <MatchRow key={m.id} match={m} showStage={false} upNext={m.id === upNext} />
                      ))}
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
