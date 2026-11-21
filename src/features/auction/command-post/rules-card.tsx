'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { Controller, useForm } from 'react-hook-form';
import { LockIcon } from 'lucide-react';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/components/ui/sonner';
import type { ActionResult } from '@/lib/schemas/api';
import {
  EDITABLE_AFTER_START,
  UNSOLD_POLICIES,
  unsoldPolicySchema,
  type EditableAfterStartKey,
  type TournamentSettings,
  type UnsoldPolicy,
} from '@/lib/schemas/settings';

export const UNSOLD_POLICY_TEXT: Record<UnsoldPolicy, string> = {
  REAUCTION_THEN_ALLOCATE: 'Re-auction, then allocate to the smallest squads',
  RANDOM_SQUAD: 'Send to a random squad with space',
  ADMIN_DECIDES: 'Stay unsold until an organiser assigns them',
};

const ORDER_TEXT: Record<TournamentSettings['playerOrder'], string> = {
  random: 'Random',
  byBasePriceDesc: 'Highest base price first',
  manualQueue: 'Manual queue',
};

const seconds = (label: string, min: number, max: number) =>
  z
    .number({ error: `${label} must be a number` })
    .int(`${label} must be a whole number of seconds`)
    .min(min, `${label} must be at least ${min} s`)
    .max(max, `${label} must be at most ${max} s`);

/** The `EDITABLE_AFTER_START` keys, with the same bounds as the settings schema (§3.1). */
export const liveRulesFormSchema = z
  .object({
    bidTimerSeconds: seconds('Bid timer', 5, 600),
    timerResetSeconds: seconds('Timer reset', 1, 600),
    breakSeconds: seconds('Break', 0, 120),
    unsoldPolicy: unsoldPolicySchema,
  })
  .refine((v) => v.timerResetSeconds <= v.bidTimerSeconds, {
    message: 'Timer reset must not exceed the bid timer',
    path: ['timerResetSeconds'],
  });
export type LiveRulesFormValues = z.infer<typeof liveRulesFormSchema>;

function pickLive(s: TournamentSettings): LiveRulesFormValues {
  return {
    bidTimerSeconds: s.bidTimerSeconds,
    timerResetSeconds: s.timerResetSeconds,
    breakSeconds: s.breakSeconds,
    unsoldPolicy: s.unsoldPolicy,
  };
}

function raiseText(s: TournamentSettings): string {
  const inc = s.bidIncrements;
  if (inc.type === 'flat') return `+${inc.step} MP`;
  return inc.bands.map((b) => `from ${b.from}: +${b.step}`).join(', ');
}

type SecondsKey = Exclude<EditableAfterStartKey, 'unsoldPolicy'>;

const onOff = (v: boolean): string => (v ? 'On' : 'Off');

interface RulesCardProps {
  tournamentId: string;
  settings: TournamentSettings;
  /** Viewer may edit and the auction is live or paused. */
  editable: boolean;
  onSave: (
    tournamentId: string,
    patch: Partial<LiveRulesFormValues>,
  ) => Promise<ActionResult<TournamentSettings>>;
}

/** Rules card (§7.6a): §3.1 settings summary; only the live keys stay editable after Start. */
export function RulesCard({ tournamentId, settings, editable, onSave }: RulesCardProps) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm<LiveRulesFormValues>({
    resolver: zodResolver(liveRulesFormSchema),
    defaultValues: pickLive(settings),
  });
  const { errors, isSubmitting, isDirty } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    const res = await onSave(tournamentId, values);
    if (res.ok) {
      form.reset(pickLive(res.data));
      toast.success('Rules saved. They apply from the next soldier');
      router.refresh();
      return;
    }
    setServerError(res.error.message);
    for (const key of EDITABLE_AFTER_START) {
      const msg = res.fieldErrors?.[key]?.[0];
      if (msg) form.setError(key, { message: msg });
    }
    toast.error(res.error.message);
  });

  const locked: { label: string; value: string }[] = [
    { label: 'Purse', value: `${settings.defaultPurse} MP` },
    {
      label: 'Squad size',
      value: `${settings.minPlayersPerTeam}–${settings.maxPlayersPerTeam} (captain included)`,
    },
    { label: 'Opening bid', value: `${settings.minBasePrice} MP` },
    { label: 'Minimum raise', value: raiseText(settings) },
    { label: 'Custom bids', value: onOff(settings.allowCustomBids) },
    { label: 'Re-auction rounds', value: String(settings.unsoldReauctionRounds) },
    { label: 'Re-auction price', value: `${settings.reauctionPricePercent}%` },
    { label: 'Soldier order', value: ORDER_TEXT[settings.playerOrder] },
    { label: 'Auctioneer fallback bids', value: onOff(settings.allowAuctioneerBids) },
  ];

  const field = (key: SecondsKey, label: string) => {
    const id = `rules-${key}`;
    const error = errors[key]?.message;
    return (
      <div className="grid gap-1.5">
        <Label htmlFor={id}>{label}</Label>
        <div className="flex items-center gap-2">
          <Input
            id={id}
            type="number"
            inputMode="numeric"
            className="w-24"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            {...form.register(key, { valueAsNumber: true })}
          />
          <span className="text-sm text-muted">s</span>
        </div>
        {error ? (
          <p id={`${id}-error`} role="alert" className="text-xs text-blood">
            {error}
          </p>
        ) : null}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Rules of engagement</CardTitle>
        <CardDescription>
          Other rules are locked after Start. Timer, break and the unsold rule stay adjustable.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          {locked.map((r) => (
            <div key={r.label} className="contents">
              <dt className="flex items-center gap-1.5 text-muted">
                <LockIcon className="size-3" aria-hidden="true" />
                {r.label}
              </dt>
              <dd>{r.value}</dd>
            </div>
          ))}
        </dl>

        {editable ? (
          <form onSubmit={onSubmit} noValidate className="grid gap-4 border-t border-border pt-4">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {field('bidTimerSeconds', 'Bid timer')}
              {field('timerResetSeconds', 'Timer reset')}
              {field('breakSeconds', 'Break')}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rules-unsoldPolicy">When nobody bids</Label>
              <Controller
                control={form.control}
                name="unsoldPolicy"
                render={({ field: f }) => (
                  <Select
                    value={f.value}
                    onValueChange={(v) => {
                      const parsed = unsoldPolicySchema.safeParse(v);
                      if (parsed.success) f.onChange(parsed.data);
                    }}
                  >
                    <SelectTrigger id="rules-unsoldPolicy" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {UNSOLD_POLICIES.map((p) => (
                        <SelectItem key={p} value={p}>
                          {UNSOLD_POLICY_TEXT[p]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            {serverError ? (
              <p role="alert" className="text-sm text-blood">
                {serverError}
              </p>
            ) : null}
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={isSubmitting || !isDirty}>
                Save rules
              </Button>
              <span className="text-xs text-muted">
                Changes apply from the next soldier or break.
              </span>
            </div>
          </form>
        ) : (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 border-t border-border pt-4 text-sm">
            <dt className="text-muted">Bid timer</dt>
            <dd>{settings.bidTimerSeconds} s</dd>
            <dt className="text-muted">Timer reset</dt>
            <dd>{settings.timerResetSeconds} s</dd>
            <dt className="text-muted">Break</dt>
            <dd>{settings.breakSeconds} s</dd>
            <dt className="text-muted">When nobody bids</dt>
            <dd>{UNSOLD_POLICY_TEXT[settings.unsoldPolicy]}</dd>
          </dl>
        )}
      </CardContent>
    </Card>
  );
}
