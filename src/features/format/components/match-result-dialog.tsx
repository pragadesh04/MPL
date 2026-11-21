'use client';

import { AlertTriangle, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/sonner';
import { TeamChip } from '@/components/ui/team-chip';
import { gamesToWin, MATCH_SCORE_MESSAGES, scoreMatch } from '@/lib/rules/matchScore';
import { MINI_MILITIA_MAPS } from '@/lib/schemas/domain';
import { useSoundEnabled } from '@/lib/sound';
import { cn } from '@/lib/utils';
import { ApiClientError, apiRequest, errorMessage } from '../client-api';
import { playFanfare } from '../sfx';
import type { MatchView, PlayerView, TeamView } from '../types';
import { useFormat } from './match-context';

interface GameField {
  map: string;
  killsA: string;
  killsB: string;
}
interface StatField {
  playerId: string;
  kills: string;
  deaths: string;
}
interface ResultForm {
  games: GameField[];
  stats: StatField[];
  mvp: string;
}

const toInt = (v: string): number => (v.trim() === '' ? NaN : Number(v));

/**
 * Result entry, game by game (§4.3, §7.11): map + kills per team. A tied game can't be saved
 * ("replay required"), extra games after the decision are refused, optional per-soldier kills /
 * deaths / MVP. Editing a decided knockout result that changes a later match asks to confirm.
 */
export function MatchResultDialog({
  open,
  onOpenChange,
  match,
  teamA,
  teamB,
  squadA,
  squadB,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  match: MatchView;
  teamA: TeamView;
  teamB: TeamView;
  squadA: PlayerView[];
  squadB: PlayerView[];
}) {
  const { data } = useFormat();
  const router = useRouter();
  const sound = useSoundEnabled();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const soldiers = [...squadA, ...squadB];
  const existing = new Map(match.playerStats.map((s) => [s.playerId, s]));

  const form = useForm<ResultForm>({
    defaultValues: {
      games:
        match.games.length > 0
          ? match.games.map((g) => ({
              map: g.map ?? '',
              killsA: String(g.killsA),
              killsB: String(g.killsB),
            }))
          : [{ map: '', killsA: '', killsB: '' }],
      stats: soldiers.map((p) => ({
        playerId: p.id,
        kills: existing.has(p.id) ? String(existing.get(p.id)!.kills) : '',
        deaths: existing.has(p.id) ? String(existing.get(p.id)!.deaths) : '',
      })),
      mvp: match.playerStats.find((s) => s.mvp)?.playerId ?? '',
    },
  });
  const games = useFieldArray({ control: form.control, name: 'games' });
  const watched = useWatch({ control: form.control, name: 'games' });
  const parsed = watched.map((g) => ({ killsA: toInt(g.killsA), killsB: toInt(g.killsB) }));
  const complete = parsed.every(
    (g) =>
      Number.isInteger(g.killsA) && Number.isInteger(g.killsB) && g.killsA >= 0 && g.killsB >= 0,
  );
  const score = scoreMatch(complete ? parsed : [], match.bestOf);
  const need = gamesToWin(match.bestOf);
  const canAddGame =
    watched.length < match.bestOf && score.decided === null && score.problem === null;

  async function submit(values: ResultForm, confirmCascade = false): Promise<void> {
    setBusy(true);
    try {
      const playerStats = values.stats
        .filter((s) => s.kills.trim() !== '' || s.deaths.trim() !== '' || values.mvp === s.playerId)
        .map((s) => ({
          playerId: s.playerId,
          kills: toInt(s.kills) || 0,
          deaths: toInt(s.deaths) || 0,
          mvp: values.mvp === s.playerId,
        }));
      await apiRequest('PATCH', `/api/tournaments/${data.tournament.id}/matches/${match.id}`, {
        action: 'result',
        games: values.games.map((g) => ({
          map: g.map || null,
          killsA: toInt(g.killsA),
          killsB: toInt(g.killsB),
        })),
        playerStats,
        confirmCascade,
      });
      toast.success(score.decided ? 'Result saved' : 'Games saved');
      if (score.decided && sound) playFanfare();
      setConfirm(null);
      onOpenChange(false);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiClientError && err.details?.needsConfirm === true) {
        setConfirm(err.message);
      } else {
        toast.error(errorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  }

  const problemGame = score.problem?.gameIndex;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {match.matchNumber ? `M${match.matchNumber} · ` : ''}
            {match.stageLabel}
          </DialogTitle>
          <DialogDescription>
            Best of {match.bestOf}: first to {need} game{need === 1 ? '' : 's'}. Enter the kills for
            each game.
          </DialogDescription>
        </DialogHeader>

        <form id="result-form" className="space-y-5" onSubmit={form.handleSubmit((v) => submit(v))}>
          <div className="space-y-2">
            <div className="grid grid-cols-[3.5rem_1fr_5rem_5rem_2rem] items-center gap-2 text-xs font-bold tracking-widest text-muted uppercase">
              <span>Game</span>
              <span>Map</span>
              <TeamChip
                name={teamA.name}
                shortName={teamA.shortName}
                color={teamA.color}
                size="sm"
                hideName
              />
              <TeamChip
                name={teamB.name}
                shortName={teamB.shortName}
                color={teamB.color}
                size="sm"
                hideName
              />
              <span />
            </div>
            {games.fields.map((field, i) => (
              <div
                key={field.id}
                className={cn(
                  'grid grid-cols-[3.5rem_1fr_5rem_5rem_2rem] items-center gap-2 rounded-md',
                  problemGame === i && 'ring-1 ring-blood',
                )}
              >
                <span className="text-sm text-muted">#{i + 1}</span>
                <select
                  {...form.register(`games.${i}.map`)}
                  aria-label={`Game ${i + 1} map`}
                  className="h-10 rounded-md border border-border bg-input px-2 text-sm"
                >
                  <option value="">Map…</option>
                  {MINI_MILITIA_MAPS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  aria-label={`Game ${i + 1} kills ${teamA.shortName}`}
                  {...form.register(`games.${i}.killsA`)}
                />
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  aria-label={`Game ${i + 1} kills ${teamB.shortName}`}
                  {...form.register(`games.${i}.killsB`)}
                />
                <button
                  type="button"
                  onClick={() => games.remove(i)}
                  aria-label={`Remove game ${i + 1}`}
                  className="grid size-8 place-items-center rounded-md text-muted hover:text-blood"
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </div>
            ))}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!canAddGame}
                onClick={() => games.append({ map: '', killsA: '', killsB: '' })}
              >
                <Plus aria-hidden /> Add game
              </Button>
              <p className="tabular font-numeric text-sm" aria-live="polite">
                Games {teamA.shortName} {score.winsA} – {score.winsB} {teamB.shortName}
                {score.decided ? (
                  <strong className="ml-2 text-lime">
                    {(score.decided === 'A' ? teamA : teamB).name} win
                  </strong>
                ) : null}
              </p>
            </div>
            {score.problem ? (
              <p role="alert" className="flex items-center gap-2 text-sm text-blood">
                <AlertTriangle className="size-4" aria-hidden />
                Game {score.problem.gameIndex + 1}: {MATCH_SCORE_MESSAGES[score.problem.reason]}
              </p>
            ) : null}
          </div>

          {soldiers.length > 0 ? (
            <details className="rounded-md border border-border p-3">
              <summary className="cursor-pointer text-sm font-semibold">
                Per-soldier stats (optional)
              </summary>
              <div className="mt-3 space-y-1.5">
                <div className="grid grid-cols-[1fr_4.5rem_4.5rem_3rem] gap-2 text-xs font-bold tracking-widest text-muted uppercase">
                  <span>Soldier</span>
                  <span>Kills</span>
                  <span>Deaths</span>
                  <span>MVP</span>
                </div>
                {soldiers.map((p, i) => {
                  const team = p.teamId === teamA.id ? teamA : teamB;
                  return (
                    <div
                      key={p.id}
                      className="grid grid-cols-[1fr_4.5rem_4.5rem_3rem] items-center gap-2"
                    >
                      <span className="flex min-w-0 items-center gap-2 text-sm">
                        <TeamChip
                          name={team.name}
                          shortName={team.shortName}
                          color={team.color}
                          size="sm"
                          hideName
                        />
                        <span className="truncate">{p.name}</span>
                      </span>
                      <Input
                        type="number"
                        min={0}
                        inputMode="numeric"
                        aria-label={`${p.name} kills`}
                        {...form.register(`stats.${i}.kills`)}
                      />
                      <Input
                        type="number"
                        min={0}
                        inputMode="numeric"
                        aria-label={`${p.name} deaths`}
                        {...form.register(`stats.${i}.deaths`)}
                      />
                      <input
                        type="radio"
                        value={p.id}
                        aria-label={`${p.name} is MVP`}
                        className="size-4 accent-gold"
                        {...form.register('mvp')}
                      />
                    </div>
                  );
                })}
              </div>
            </details>
          ) : null}

          {confirm ? (
            <div
              role="alert"
              className="space-y-2 rounded-md border border-amber/50 bg-amber/10 p-3 text-sm text-amber"
            >
              <p className="flex items-center gap-2 font-semibold">
                <AlertTriangle className="size-4" aria-hidden /> {confirm}
              </p>
              <p>Those matches haven’t started, so their teams will be updated. Continue?</p>
            </div>
          ) : null}
        </form>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {confirm ? (
            <Button
              type="button"
              variant="gold"
              disabled={busy}
              onClick={form.handleSubmit((v) => submit(v, true))}
            >
              Yes, update the bracket
            </Button>
          ) : (
            <Button
              type="submit"
              form="result-form"
              disabled={busy || !complete || score.problem !== null}
            >
              {score.decided ? 'Save result' : watched.length === 0 ? 'Clear result' : 'Save games'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
