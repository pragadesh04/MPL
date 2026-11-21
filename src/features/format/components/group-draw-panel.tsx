'use client';

import { Dices, GripVertical, Hand, Trophy } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState, type DragEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MpAmount } from '@/components/ui/mp-amount';
import { toast } from '@/components/ui/sonner';
import { TeamChip } from '@/components/ui/team-chip';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { groupName, makePots } from '@/lib/rules/generateGroups';
import type { FormatPlan } from '@/lib/rules/planFormat';
import { cn } from '@/lib/utils';
import { apiRequest, errorMessage } from '../client-api';
import type { TeamView } from '../types';

type Mode = 'RANDOM' | 'MANUAL';

/**
 * Group draw (§4.2, §7.11) for owners / co-admins at GROUP_DRAW: seeding pots (ranked by MP
 * spent), then a random draw or manual placement. Manual placement works by drag and drop, or by
 * the "Move to" buttons on each team (keyboard and touch friendly).
 */
export function GroupDrawPanel({
  tournamentId,
  teams,
  plan,
  canAdvance,
}: {
  tournamentId: string;
  teams: TeamView[];
  plan: FormatPlan;
  canAdvance: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('RANDOM');
  const [busy, setBusy] = useState(false);
  const [placement, setPlacement] = useState<Record<string, number | null>>({});
  const byId = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const pots = useMemo(
    () =>
      plan.groupCount === 0
        ? []
        : makePots(
            teams.map((t) => ({ teamId: t.id, seedValue: t.spent, sortOrder: t.sortOrder })),
            plan.groupCount,
          ),
    [teams, plan.groupCount],
  );
  const groupIndexes = Array.from({ length: plan.groupCount }, (_, i) => i);
  const members = (gi: number): string[] =>
    teams.filter((t) => placement[t.id] === gi).map((t) => t.id);
  const unplaced = teams.filter((t) => placement[t.id] == null);
  const sizes = groupIndexes.map((gi) => members(gi).length);
  const balanced = [...sizes].sort((a, b) => b - a).join(',') === plan.groupSizes.join(',');
  const maxSize = plan.groupSizes[0] ?? 0;

  async function run(body: unknown): Promise<void> {
    setBusy(true);
    try {
      await apiRequest('POST', `/api/tournaments/${tournamentId}/groups/draw`, body);
      toast.success(plan.groupCount === 0 ? 'The final is set!' : 'The groups are drawn!');
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const place = (teamId: string, gi: number | null): void => {
    if (gi !== null && members(gi).length >= maxSize) {
      toast.warning(`Group ${groupName(gi)} is full (${maxSize} teams).`);
      return;
    }
    setPlacement((p) => ({ ...p, [teamId]: gi }));
  };
  const onDrop = (gi: number | null) => (e: DragEvent) => {
    e.preventDefault();
    const teamId = e.dataTransfer.getData('text/plain');
    if (byId.has(teamId)) place(teamId, gi);
  };

  if (plan.groupCount === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="size-5 text-gold" aria-hidden /> Straight to the final
          </CardTitle>
          <CardDescription>
            With 2 teams there are no groups: they play a best-of final.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            {teams.map((t) => (
              <TeamChip
                key={t.id}
                name={t.name}
                shortName={t.shortName}
                color={t.color}
                size="lg"
              />
            ))}
          </div>
          {canAdvance ? (
            <Button type="button" disabled={busy} onClick={() => run({ mode: 'RANDOM' })}>
              Create the final
            </Button>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Seeding pots</CardTitle>
          <CardDescription>
            Teams ranked by MP spent in the auction. Each group gets one team from each pot.{' '}
            {plan.summary}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {pots.map((pot, i) => (
              <li key={i} className="rounded-md border border-border bg-surface-2/40 p-3">
                <p className="mb-2 text-xs font-bold tracking-widest text-muted uppercase">
                  Pot {i + 1}
                </p>
                <ul className="space-y-1.5">
                  {pot.map((p) => {
                    const t = byId.get(p.teamId)!;
                    return (
                      <li key={t.id} className="flex items-center justify-between gap-2">
                        <TeamChip name={t.name} shortName={t.shortName} color={t.color} size="sm" />
                        <MpAmount value={t.spent} className="text-xs text-muted" />
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      {canAdvance ? (
        <Card>
          <CardHeader>
            <CardTitle>Run the draw</CardTitle>
            <CardDescription>
              Random draw for the ceremony on the big screen, or place teams yourself.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-start gap-5">
            <ToggleGroup
              type="single"
              value={mode}
              onValueChange={(v) => {
                if (v === 'RANDOM' || v === 'MANUAL') setMode(v);
              }}
              aria-label="Draw mode"
            >
              <ToggleGroupItem value="RANDOM">
                <Dices aria-hidden /> Random draw
              </ToggleGroupItem>
              <ToggleGroupItem value="MANUAL">
                <Hand aria-hidden /> Manual placement
              </ToggleGroupItem>
            </ToggleGroup>

            {mode === 'RANDOM' ? (
              <Button
                type="button"
                size="lg"
                disabled={busy}
                onClick={() => run({ mode: 'RANDOM' })}
              >
                <Dices aria-hidden /> Draw the groups
              </Button>
            ) : (
              <div className="space-y-4">
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={onDrop(null)}
                  className="min-h-14 rounded-md border border-dashed border-border p-3"
                  aria-label="Unplaced teams"
                >
                  <p className="mb-2 text-xs font-bold tracking-widest text-muted uppercase">
                    Unplaced ({unplaced.length})
                  </p>
                  <ul className="flex flex-wrap gap-2">
                    {unplaced.map((t) => (
                      <DraggableTeam
                        key={t.id}
                        team={t}
                        groupCount={plan.groupCount}
                        onMove={place}
                      />
                    ))}
                  </ul>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {groupIndexes.map((gi) => (
                    <div
                      key={gi}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={onDrop(gi)}
                      className="min-h-32 rounded-md border border-border bg-surface-2/40 p-3"
                      aria-label={`Group ${groupName(gi)}`}
                    >
                      <p className="mb-2 flex justify-between text-xs font-bold tracking-widest uppercase">
                        <span>Group {groupName(gi)}</span>
                        <span className="tabular text-muted">
                          {sizes[gi]}/{maxSize}
                        </span>
                      </p>
                      <ul className="space-y-1.5">
                        {members(gi).map((id) => (
                          <DraggableTeam
                            key={id}
                            team={byId.get(id)!}
                            groupCount={plan.groupCount}
                            current={gi}
                            onMove={place}
                          />
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
                <Button
                  type="button"
                  size="lg"
                  disabled={busy || unplaced.length > 0 || !balanced}
                  onClick={() => run({ mode: 'MANUAL', groups: groupIndexes.map(members) })}
                >
                  Confirm placement
                </Button>
                {unplaced.length === 0 && !balanced ? (
                  <p className="text-sm text-amber">
                    Groups must be balanced: sizes {plan.groupSizes.join(', ')}.
                  </p>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-6 text-center text-muted">
            The organisers are about to draw the groups. Hold steady!
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function DraggableTeam({
  team,
  groupCount,
  current = null,
  onMove,
}: {
  team: TeamView;
  groupCount: number;
  current?: number | null;
  onMove: (teamId: string, gi: number | null) => void;
}) {
  return (
    <li
      draggable
      onDragStart={(e) => e.dataTransfer.setData('text/plain', team.id)}
      className="flex cursor-grab items-center gap-1.5 rounded-md border border-border bg-surface px-2 py-1 active:cursor-grabbing"
    >
      <GripVertical className="size-3.5 text-muted" aria-hidden />
      <TeamChip name={team.name} shortName={team.shortName} color={team.color} size="sm" />
      <span className="ml-auto flex gap-0.5">
        {Array.from({ length: groupCount }, (_, gi) =>
          gi === current ? null : (
            <button
              key={gi}
              type="button"
              onClick={() => onMove(team.id, gi)}
              aria-label={`Move ${team.name} to group ${groupName(gi)}`}
              className={cn(
                'size-6 rounded-sm border border-border text-[0.625rem] font-bold text-muted hover:border-lime hover:text-lime',
              )}
            >
              {groupName(gi)}
            </button>
          ),
        )}
        {current !== null ? (
          <button
            type="button"
            onClick={() => onMove(team.id, null)}
            aria-label={`Remove ${team.name} from its group`}
            className="size-6 rounded-sm border border-border text-[0.625rem] font-bold text-muted hover:border-blood hover:text-blood"
          >
            ×
          </button>
        ) : null}
      </span>
    </li>
  );
}
