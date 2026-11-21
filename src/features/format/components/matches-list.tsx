'use client';

import { ChevronDown, ChevronUp, GripVertical, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/sonner';
import { Switch } from '@/components/ui/switch';
import type { MatchStage, MatchStatus } from '@/lib/schemas/enums';
import { apiRequest, errorMessage } from '../client-api';
import { filterMatches, moveWithinBlock, sections } from '../filters';
import type { MatchView } from '../types';
import { useFormat } from './match-context';
import { MatchRow } from './match-row';
import { nowPlaying } from './now-playing';

const selectClass = 'h-9 rounded-md border border-border bg-input px-2 text-sm';

/**
 * List mode (§7.10a): the running order with stage separators, filters (My team, stage, group,
 * status, search) and, for organisers, reordering of unplayed matches within a stage (drag the
 * handle, or the up / down buttons on touch and keyboard).
 */
export function MatchesList() {
  const { data, teams } = useFormat();
  const router = useRouter();
  const myTeamId = data.viewer.myTeamId;
  const [mine, setMine] = useState(myTeamId !== null && !data.viewer.isOrganiser);
  const [stage, setStage] = useState<MatchStage | ''>('');
  const [groupId, setGroupId] = useState('');
  const [status, setStatus] = useState<MatchStatus | ''>('');
  const [search, setSearch] = useState('');
  const [dragging, setDragging] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(
    () =>
      filterMatches(
        data.matches,
        {
          teamId: mine ? myTeamId : null,
          stage: stage || null,
          groupId: groupId || null,
          status: status || null,
          search,
        },
        teams,
      ),
    [data.matches, mine, myTeamId, stage, groupId, status, search, teams],
  );
  const unfiltered = !mine && !stage && !groupId && !status && !search.trim();
  const canReorder = data.viewer.canEditMatches && unfiltered;
  const nextId = nowPlaying(data.matches).next?.id;

  async function reorder(orderedIds: string[] | null): Promise<void> {
    if (!orderedIds || busy) return;
    setBusy(true);
    try {
      await apiRequest('PATCH', `/api/tournaments/${data.tournament.id}/matches/order`, {
        orderedIds,
      });
      toast.success('Order updated');
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  /** The unplayed neighbour above / below in the same block, for the arrow buttons. */
  const neighbour = (m: MatchView, dir: -1 | 1): MatchView | undefined => {
    const block = (x: MatchView): boolean => (x.stage === 'GROUP') === (m.stage === 'GROUP');
    const list = data.matches.filter(
      (x) => !x.isBye && x.status === 'SCHEDULED' && x.matchNumber !== null && block(x),
    );
    return list[list.findIndex((x) => x.id === m.id) + dir];
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface/60 p-3">
        {myTeamId ? (
          <div className="flex items-center gap-2">
            <Switch id="my-team" checked={mine} onCheckedChange={setMine} />
            <Label htmlFor="my-team">My team</Label>
          </div>
        ) : null}
        <select
          aria-label="Stage"
          className={selectClass}
          value={stage}
          onChange={(e) => setStage(e.target.value as MatchStage | '')}
        >
          <option value="">All stages</option>
          <option value="GROUP">Group stage</option>
          <option value="KNOCKOUT">Knockout</option>
          <option value="THIRD_PLACE">3rd place</option>
        </select>
        {data.groups.length > 1 ? (
          <select
            aria-label="Group"
            className={selectClass}
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
          >
            <option value="">All groups</option>
            {data.groups.map((g) => (
              <option key={g.id} value={g.id}>
                Group {g.name}
              </option>
            ))}
          </select>
        ) : null}
        <select
          aria-label="Status"
          className={selectClass}
          value={status}
          onChange={(e) => setStatus(e.target.value as MatchStatus | '')}
        >
          <option value="">Any status</option>
          <option value="SCHEDULED">Scheduled</option>
          <option value="LIVE">Live</option>
          <option value="DONE">Played</option>
        </select>
        <div className="relative min-w-48 flex-1">
          <Search
            className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <Input
            aria-label="Search by team"
            placeholder="Search team…"
            className="h-9 pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>
      {data.viewer.canEditMatches && !unfiltered ? (
        <p className="text-xs text-muted">Clear the filters to reorder matches.</p>
      ) : null}

      {filtered.length === 0 ? (
        <p className="rounded-lg border border-border p-6 text-center text-muted">
          No matches match these filters.
        </p>
      ) : (
        sections(filtered).map((section, si) => (
          <section key={`${section.label}-${si}`} className="space-y-2">
            <h2 className="flex items-center gap-3 pt-2 font-display text-lg tracking-wider text-sand">
              {section.label}
              <span className="h-px flex-1 bg-border" aria-hidden />
            </h2>
            {section.matches.map((m) => {
              const movable = canReorder && m.status === 'SCHEDULED' && m.matchNumber !== null;
              const up = movable ? neighbour(m, -1) : undefined;
              const down = movable ? neighbour(m, 1) : undefined;
              return (
                <div
                  key={m.id}
                  draggable={movable}
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', m.id);
                    setDragging(m.id);
                  }}
                  onDragEnd={() => setDragging(null)}
                  onDragOver={(e) => {
                    if (dragging && movable) e.preventDefault();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const from = e.dataTransfer.getData('text/plain');
                    setDragging(null);
                    void reorder(moveWithinBlock(data.matches, from, m.id));
                  }}
                  className={dragging === m.id ? 'opacity-50' : undefined}
                >
                  <MatchRow
                    match={m}
                    upNext={m.id === nextId}
                    dragHandle={
                      movable ? (
                        <span className="flex items-center gap-0.5 border-r border-border px-1">
                          <GripVertical className="size-4 cursor-grab text-muted" aria-hidden />
                          <span className="flex flex-col">
                            <button
                              type="button"
                              disabled={!up || busy}
                              aria-label={`Move M${m.matchNumber} earlier`}
                              onClick={() =>
                                up && reorder(moveWithinBlock(data.matches, m.id, up.id))
                              }
                              className="text-muted hover:text-lime disabled:opacity-30"
                            >
                              <ChevronUp className="size-4" aria-hidden />
                            </button>
                            <button
                              type="button"
                              disabled={!down || busy}
                              aria-label={`Move M${m.matchNumber} later`}
                              onClick={() =>
                                down && reorder(moveWithinBlock(data.matches, m.id, down.id))
                              }
                              className="text-muted hover:text-lime disabled:opacity-30"
                            >
                              <ChevronDown className="size-4" aria-hidden />
                            </button>
                          </span>
                        </span>
                      ) : undefined
                    }
                  />
                </div>
              );
            })}
          </section>
        ))
      )}
    </div>
  );
}
