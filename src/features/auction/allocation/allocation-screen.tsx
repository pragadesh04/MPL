'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { PlayIcon, SkipForwardIcon, TriangleAlertIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { JetpackSoldier } from '@/components/mascots/jetpack-soldier';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { MpAmount } from '@/components/ui/mp-amount';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { StatusPill } from '@/components/ui/status-pill';
import { TeamChip } from '@/components/ui/team-chip';
import { Textarea } from '@/components/ui/textarea';
import type { ApiError } from '@/lib/schemas/api';
import { teamStyle } from '@/lib/team-color';
import { cn } from '@/lib/utils';
import type { AllocationPreview } from '@/server/services/allocation/allocation';

/**
 * Leftover allocation screen (PLAN §3.4, §7.10): "Leftover soldiers: 3" → preview → animated
 * step-by-step run with the reason for each pick → optional overrides (logged with a reason) →
 * Confirm, which moves the tournament to GROUP_DRAW.
 */

export interface AllocationScreenProps {
  tournamentId: string;
  preview: AllocationPreview;
  canConfirm: boolean;
}

const STEP_MS = 900;

export function AllocationScreen({ tournamentId, preview, canConfirm }: AllocationScreenProps) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState(0);
  const [running, setRunning] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const steps = useMemo(
    () =>
      preview.steps.map((s) => {
        const teamId = overrides[s.playerId] ?? s.teamId;
        const team = preview.teams.find((t) => t.teamId === teamId)!;
        return {
          ...s,
          teamId,
          teamName: team.name,
          teamShortName: team.shortName,
          teamColor: team.color,
          reason: teamId === s.teamId && !overrides[s.playerId] ? s.reason : 'Organiser override',
        };
      }),
    [preview, overrides],
  );
  const overrideCount = steps.filter((s) => s.reason === 'Organiser override').length;
  const sizes = useMemo(() => {
    const m = new Map(preview.teams.map((t) => [t.teamId, t.squadSize]));
    for (const s of steps) m.set(s.teamId, (m.get(s.teamId) ?? 0) + 1);
    return m;
  }, [preview.teams, steps]);
  const overLimit = preview.teams.filter(
    (t) => (sizes.get(t.teamId) ?? 0) > preview.maxPlayersPerTeam,
  );
  const belowMin = preview.teams.filter(
    (t) => (sizes.get(t.teamId) ?? 0) < preview.minPlayersPerTeam,
  );

  const animating = running && revealed < steps.length;
  useEffect(() => {
    if (!animating) return;
    const id = setTimeout(() => setRevealed((r) => r + 1), reduceMotion ? 0 : STEP_MS);
    return () => clearTimeout(id);
  }, [animating, revealed, reduceMotion]);

  if (preview.status !== 'ALLOCATION') {
    const done = ['GROUP_DRAW', 'GROUP_STAGE', 'KNOCKOUT', 'COMPLETED'].includes(preview.status);
    return (
      <Card className="mx-auto max-w-lg text-center">
        <CardHeader className="items-center">
          <JetpackSoldier pose={done ? 'cheer' : 'idle'} className="mx-auto size-24" />
          <CardTitle className="font-display text-2xl">
            {done ? 'Allocation complete' : 'Allocation opens after the auction'}
          </CardTitle>
          <CardDescription>
            {done
              ? 'Every soldier has a squad. The group draw is next.'
              : 'Leftover soldiers are placed once every auction round is done.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href={done ? `/t/${tournamentId}` : `/t/${tournamentId}/auction`}>
              {done ? 'Tournament home' : 'Back to the auction room'}
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  async function confirm(): Promise<void> {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/auction/allocation`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          commandId: crypto.randomUUID(),
          overrides: Object.entries(overrides).map(([playerId, teamId]) => ({ playerId, teamId })),
          ...(reason.trim() ? { reason: reason.trim() } : {}),
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as ApiError | null;
        toast.error(body?.error.message ?? 'Allocation failed');
        return;
      }
      toast.success('Allocation confirmed. On to the group draw!');
      setConfirmOpen(false);
      router.refresh();
    } catch {
      toast.error('Connection problem. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const blocked = overLimit.length > 0 || belowMin.length > 0 || preview.unplaced.length > 0;
  const shown = steps.slice(0, revealed);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-display text-3xl tracking-wide">Leftover allocation</h1>
          <div className="flex flex-wrap gap-2">
            <StatusPill tone="amber">Leftover soldiers: {preview.leftovers.length}</StatusPill>
            <StatusPill tone="neutral">
              Squads {preview.minPlayersPerTeam}–{preview.maxPlayersPerTeam}
            </StatusPill>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={steps.length === 0 || animating}
            onClick={() => {
              setRevealed(0);
              setRunning(true);
            }}
          >
            <PlayIcon aria-hidden="true" /> Run allocation
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={steps.length === 0}
            onClick={() => {
              setRunning(false);
              setRevealed(steps.length);
            }}
          >
            <SkipForwardIcon aria-hidden="true" /> Show all
          </Button>
          {canConfirm ? (
            <Button
              type="button"
              disabled={blocked || submitting}
              onClick={() => setConfirmOpen(true)}
            >
              Confirm allocation
            </Button>
          ) : null}
        </div>
      </header>

      <p className="text-sm text-muted">
        Fewest players first, then the lowest MP left, then team order. Every pick is free (0 MP).
      </p>

      {blocked ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-blood/50 bg-blood/10 p-3 text-sm"
        >
          <TriangleAlertIcon className="mt-0.5 size-4 text-blood" aria-hidden="true" />
          <div className="space-y-1">
            {preview.unplaced.length > 0 ? (
              <p>{preview.unplaced.length} soldier(s) don&apos;t fit in any squad.</p>
            ) : null}
            {overLimit.map((t) => (
              <p key={t.teamId}>{t.name} would be over the squad limit.</p>
            ))}
            {belowMin.map((t) => (
              <p key={t.teamId}>
                {t.name} would stay below {preview.minPlayersPerTeam} players. Override a pick to
                fix it.
              </p>
            ))}
          </div>
        </div>
      ) : null}

      {/* Animated reveal: one column per team, picks fly in with their reason. */}
      <section aria-label="Allocation reveal" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {preview.teams.map((team) => {
          const picks = shown.filter((s) => s.teamId === team.teamId);
          return (
            <div
              key={team.teamId}
              style={teamStyle(team.color)}
              className="overflow-hidden rounded-lg border border-border bg-surface"
            >
              <div className="bg-team h-1.5" aria-hidden="true" />
              <div className="space-y-2 p-3">
                <div className="flex items-center justify-between gap-2">
                  <TeamChip name={team.name} shortName={team.shortName} color={team.color} />
                  <span className="tabular font-numeric text-sm text-muted">
                    {team.squadSize + picks.length}/{preview.maxPlayersPerTeam}
                  </span>
                </div>
                <ul className="min-h-12 space-y-2">
                  <AnimatePresence>
                    {picks.map((s) => (
                      <motion.li
                        key={s.playerId}
                        layout
                        initial={reduceMotion ? false : { opacity: 0, y: -40, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        className="rounded-md border border-border bg-surface-2 p-2 text-sm"
                      >
                        <p className="font-semibold">{s.playerName}</p>
                        <p className="text-xs text-lime">{s.reason}</p>
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
              </div>
            </div>
          );
        })}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Preview</CardTitle>
          <CardDescription>
            {canConfirm
              ? 'Change a squad to override a pick. Overrides need a reason and are logged.'
              : 'Only the owner and co-admins can confirm the allocation.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {steps.length === 0 ? (
            <p className="text-sm text-muted">Nothing to allocate. Confirm to move on.</p>
          ) : (
            <ol className="divide-y divide-border">
              {steps.map((s) => (
                <li key={s.playerId} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                  <span className="tabular w-6 font-numeric text-muted">{s.step}</span>
                  <span className="min-w-32 flex-1 font-semibold">{s.playerName}</span>
                  <span className="flex items-center gap-1 text-muted">
                    base <MpAmount value={s.basePrice} size="sm" />
                  </span>
                  <Select
                    value={s.teamId}
                    disabled={!canConfirm}
                    onValueChange={(teamId) =>
                      setOverrides((prev) => {
                        const original = preview.steps.find((x) => x.playerId === s.playerId);
                        const next = { ...prev };
                        if (original?.teamId === teamId) delete next[s.playerId];
                        else next[s.playerId] = teamId;
                        return next;
                      })
                    }
                  >
                    <SelectTrigger className="w-52" aria-label={`Squad for ${s.playerName}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {preview.teams.map((t) => (
                        <SelectItem key={t.teamId} value={t.teamId}>
                          {t.name} ({t.shortName})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span
                    className={cn(
                      'text-xs',
                      s.reason === 'Organiser override' ? 'text-amber' : 'text-lime',
                    )}
                  >
                    {s.reason}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm the allocation?</DialogTitle>
            <DialogDescription>
              {steps.length} soldier(s) join their squads at 0 MP and the tournament moves to the
              group draw. This can&apos;t be undone from here.
            </DialogDescription>
          </DialogHeader>
          {overrideCount > 0 ? (
            <div className="space-y-2">
              <Label htmlFor="override-reason">
                Reason for {overrideCount} override(s) (logged)
              </Label>
              <Textarea
                id="override-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={500}
              />
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={submitting || (overrideCount > 0 && reason.trim().length === 0)}
              onClick={() => void confirm()}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
