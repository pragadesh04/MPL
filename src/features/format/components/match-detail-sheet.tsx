'use client';

import { CalendarClock, Crown, Pencil, Radio, Square } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { toast } from '@/components/ui/sonner';
import { StatusPill } from '@/components/ui/status-pill';
import { TeamChip } from '@/components/ui/team-chip';
import { cn } from '@/lib/utils';
import { apiRequest, errorMessage } from '../client-api';
import { MATCH_STATUS_PILL } from '../status';
import type { MatchView, PlayerView, TeamView } from '../types';
import { LocalTime } from './local-time';
import { useFormat } from './match-context';
import { MatchResultDialog } from './match-result-dialog';
import { TeamSlot } from './team-slot';

/** `datetime-local` value (local time, no zone) for an ISO string. */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Match detail (§7.10a "Tap a match"): both squads, game-by-game results, per-soldier stats and
 * MVP. Owners / co-admins also get Mark live, Enter result and Set time here.
 */
export function MatchDetailSheet({
  match,
  onClose,
}: {
  match: MatchView | undefined;
  onClose: () => void;
}) {
  const { teams, squads, data } = useFormat();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const [time, setTime] = useState<string | null>(null);
  const canEdit = data.viewer.canEditMatches && match !== undefined && !match.isBye;

  async function patch(body: unknown, success: string): Promise<void> {
    if (!match) return;
    setBusy(true);
    try {
      await apiRequest('PATCH', `/api/tournaments/${data.tournament.id}/matches/${match.id}`, body);
      toast.success(success);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const a = match?.teamAId ? teams.get(match.teamAId) : undefined;
  const b = match?.teamBId ? teams.get(match.teamBId) : undefined;
  const statFor = (playerId: string) => match?.playerStats.find((s) => s.playerId === playerId);
  const mvp = match?.playerStats.find((s) => s.mvp);
  const mvpPlayer = mvp ? data.players.find((p) => p.id === mvp.playerId) : undefined;

  return (
    <Sheet
      open={match !== undefined}
      onOpenChange={(open) => {
        if (!open) {
          setTime(null);
          onClose();
        }
      }}
    >
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {match ? (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2 font-display text-2xl tracking-wide">
                <span className="text-lime">
                  {match.matchNumber ? `M${match.matchNumber}` : 'Bye'}
                </span>
                <span className="text-base text-muted">{match.stageLabel}</span>
              </SheetTitle>
              <SheetDescription className="flex flex-wrap items-center gap-2">
                <span>Best of {match.bestOf}</span>
                {match.isBye ? null : (
                  <StatusPill
                    tone={MATCH_STATUS_PILL[match.status].tone}
                    live={MATCH_STATUS_PILL[match.status].live}
                  >
                    {MATCH_STATUS_PILL[match.status].label}
                  </StatusPill>
                )}
                {match.scheduledAt ? <LocalTime iso={match.scheduledAt} /> : null}
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-6 px-4 pb-6">
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-lg border border-border bg-surface-2/40 p-4">
                <TeamSlot
                  team={a}
                  label={match.labelA}
                  winner={match.winnerTeamId === match.teamAId && !!a}
                />
                <span className="tabular font-numeric text-3xl font-bold">
                  {match.score ? `${match.score.a}–${match.score.b}` : 'vs'}
                </span>
                <TeamSlot
                  team={b}
                  label={match.labelB}
                  winner={match.winnerTeamId === match.teamBId && !!b}
                  className="justify-self-end"
                />
              </div>

              {canEdit ? (
                <div className="space-y-3 rounded-lg border border-border p-3">
                  <p className="text-xs font-bold tracking-widest text-muted uppercase">
                    Organiser
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {match.status === 'SCHEDULED' ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy || !a || !b}
                        onClick={() =>
                          patch({ action: 'mark-live' }, `M${match.matchNumber} is live`)
                        }
                      >
                        <Radio aria-hidden /> Mark live
                      </Button>
                    ) : null}
                    {match.status === 'LIVE' && match.games.length === 0 ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => patch({ action: 'unmark-live' }, 'No longer live')}
                      >
                        <Square aria-hidden /> Not live
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      disabled={busy || !a || !b}
                      onClick={() => setResultOpen(true)}
                    >
                      <Pencil aria-hidden />{' '}
                      {match.games.length > 0 ? 'Edit result' : 'Enter result'}
                    </Button>
                  </div>
                  <form
                    className="flex flex-wrap items-end gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const value = time ?? toLocalInput(match.scheduledAt);
                      void patch(
                        {
                          action: 'schedule',
                          scheduledAt: value ? new Date(value).toISOString() : null,
                        },
                        value ? 'Time set' : 'Time cleared',
                      );
                    }}
                  >
                    <div className="grid gap-1">
                      <Label htmlFor="match-time">Set time</Label>
                      <Input
                        id="match-time"
                        type="datetime-local"
                        className="w-auto"
                        value={time ?? toLocalInput(match.scheduledAt)}
                        onChange={(e) => setTime(e.target.value)}
                      />
                    </div>
                    <Button type="submit" size="sm" variant="outline" disabled={busy}>
                      <CalendarClock aria-hidden /> Save time
                    </Button>
                  </form>
                  {!a || !b ? (
                    <p className="text-xs text-muted">
                      Both teams must be known before this match is played.
                    </p>
                  ) : null}
                </div>
              ) : null}

              {match.games.length > 0 ? (
                <section className="space-y-2">
                  <h3 className="text-xs font-bold tracking-widest text-muted uppercase">Games</h3>
                  <ol className="divide-y divide-border rounded-lg border border-border">
                    {match.games.map((g) => {
                      const winner = g.winnerTeamId ? teams.get(g.winnerTeamId) : undefined;
                      return (
                        <li key={g.gameNo} className="flex items-center gap-3 px-3 py-2 text-sm">
                          <span className="w-14 text-muted">Game {g.gameNo}</span>
                          <span className="flex-1 truncate">{g.map ?? '—'}</span>
                          <span className="tabular font-numeric font-bold">
                            {g.killsA}–{g.killsB}
                          </span>
                          {winner ? (
                            <TeamChip
                              name={winner.name}
                              shortName={winner.shortName}
                              color={winner.color}
                              size="sm"
                              hideName
                            />
                          ) : null}
                        </li>
                      );
                    })}
                  </ol>
                  {mvpPlayer ? (
                    <p className="flex items-center gap-2 text-sm">
                      <Crown className="size-4 text-gold" aria-hidden /> MVP:{' '}
                      <strong>{mvpPlayer.name}</strong>
                      {mvpPlayer.ign ? <span className="text-muted">({mvpPlayer.ign})</span> : null}
                    </p>
                  ) : null}
                </section>
              ) : null}

              {[a, b].map((team) =>
                team ? (
                  <Squad
                    key={team.id}
                    team={team}
                    squad={squads.get(team.id) ?? []}
                    statFor={statFor}
                  />
                ) : null,
              )}
            </div>
            {canEdit && a && b ? (
              <MatchResultDialog
                open={resultOpen}
                onOpenChange={setResultOpen}
                match={match}
                teamA={a}
                teamB={b}
                squadA={squads.get(a.id) ?? []}
                squadB={squads.get(b.id) ?? []}
              />
            ) : null}
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function Squad({
  team,
  squad,
  statFor,
}: {
  team: TeamView;
  squad: PlayerView[];
  statFor: (playerId: string) => { kills: number; deaths: number; mvp: boolean } | undefined;
}) {
  return (
    <section className="space-y-2">
      <h3 className="flex items-center justify-between">
        <TeamChip name={team.name} shortName={team.shortName} color={team.color} size="sm" />
        <span className="text-xs text-muted">K / D</span>
      </h3>
      <ul className="space-y-1 text-sm">
        <li className="flex justify-between text-muted">
          <span>
            {team.captainName}{' '}
            <span className="text-[0.625rem] font-bold tracking-widest uppercase">Captain</span>
          </span>
        </li>
        {squad.map((p) => {
          const s = statFor(p.id);
          return (
            <li
              key={p.id}
              className={cn('flex justify-between gap-2', s?.mvp && 'font-bold text-gold')}
            >
              <span className="truncate">
                {p.name}
                {p.ign ? <span className="ml-1 text-muted">({p.ign})</span> : null}
                {s?.mvp ? <Crown className="ml-1 inline size-3.5" aria-label="MVP" /> : null}
              </span>
              <span className="tabular font-numeric">{s ? `${s.kills} / ${s.deaths}` : '—'}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
