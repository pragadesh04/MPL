'use client';

import { AlertTriangle, Check, Loader2, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { formatMP } from '@/lib/money';
import { planFormat } from '@/lib/rules/planFormat';
import {
  EXAMPLE_BAND_INCREMENTS,
  tournamentSettingsSchema,
  type TournamentSettings,
  type UnsoldPolicy,
} from '@/lib/schemas/settings';
import { api, errorMessage } from '../lib/api';

export interface RulesPreviewCounts {
  captains: number;
  soldiers: number;
  pending: number;
  totalPurse: number;
}

type SaveState = 'idle' | 'saving' | 'saved' | 'invalid' | 'error';

const UNSOLD_LABELS: Record<UnsoldPolicy, string> = {
  REAUCTION_THEN_ALLOCATE: 'Re-auction, then give to the team with the fewest players',
  RANDOM_SQUAD: 'Send to a random squad with space',
  ADMIN_DECIDES: 'Stay unsold until an organiser assigns them',
};

/** Rules step (§7.2 step 2): every §3.1 + §4.1 setting, live preview, autosave. */
export function RulesForm({
  tournamentId,
  initial,
  counts,
  disabled,
}: {
  tournamentId: string;
  initial: TournamentSettings;
  counts: RulesPreviewCounts;
  disabled: boolean;
}) {
  const router = useRouter();
  const [s, setS] = useState<TournamentSettings>(initial);
  const [state, setState] = useState<SaveState>('idle');
  const [serverError, setServerError] = useState<string | null>(null);
  const savedRef = useRef(JSON.stringify(initial));

  const parsed = tournamentSettingsSchema.safeParse(s);
  const issues = parsed.success
    ? {}
    : Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message]));

  // Autosave 800 ms after the last valid change (one request at a time).
  useEffect(() => {
    if (disabled) return;
    const body = JSON.stringify(s);
    if (body === savedRef.current) return;
    const valid = tournamentSettingsSchema.safeParse(s);
    if (!valid.success) return;
    const id = setTimeout(async () => {
      savedRef.current = body;
      setState('saving');
      try {
        await api(`/api/tournaments/${tournamentId}/settings`, {
          method: 'PATCH',
          body: { settings: valid.data },
        });
        setServerError(null);
        setState('saved');
        router.refresh();
      } catch (err) {
        savedRef.current = '';
        setServerError(errorMessage(err));
        setState('error');
      }
    }, 800);
    return () => clearTimeout(id);
  }, [s, disabled, tournamentId, router]);

  const set = <K extends keyof TournamentSettings>(key: K, value: TournamentSettings[K]): void =>
    setS((prev) => ({ ...prev, [key]: value }));

  const num = (key: keyof TournamentSettings, label: string, hint?: string, suffix?: string) => (
    <NumberField
      id={`s-${key}`}
      label={label}
      hint={hint}
      suffix={suffix}
      value={s[key] as number}
      error={issues[key]}
      disabled={disabled}
      onChange={(v) => setS((prev) => ({ ...prev, [key]: v }))}
    />
  );

  const status = !parsed.success ? 'invalid' : state;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Squads & purse</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {num(
              'minPlayersPerTeam',
              'Min squad size',
              'Captain included. Enforced after allocation.',
            )}
            {num('maxPlayersPerTeam', 'Max squad size', 'Captain included. A full team can’t bid.')}
            {num('defaultPurse', 'Default purse', 'Prefills each captain’s purse.', 'MP')}
            {num(
              'minBasePrice',
              'Opening bid / min base price',
              'No soldier can be cheaper.',
              'MP',
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Bidding</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <IncrementsEditor
              value={s.bidIncrements}
              disabled={disabled}
              error={issues.bidIncrements}
              onChange={(v) => set('bidIncrements', v)}
            />
            <div className="grid gap-4 sm:grid-cols-3">
              {num('bidTimerSeconds', 'Bid timer', 'Countdown per soldier.', 's')}
              {num(
                'timerResetSeconds',
                'Timer after a bid',
                'Equal to the bid timer = every bid restarts the clock.',
                's',
              )}
              {num('breakSeconds', 'Break between soldiers', undefined, 's')}
            </div>
            <ToggleRow
              id="s-allowCustomBids"
              label="Custom bids"
              hint="Captains may bid more than the minimum raise."
              checked={s.allowCustomBids}
              disabled={disabled}
              onChange={(v) => set('allowCustomBids', v)}
            />
            <ToggleRow
              id="s-allowAuctioneerBids"
              label="Auctioneer fallback bids"
              hint="The auctioneer can bid for a captain whose phone drops (logged)."
              checked={s.allowAuctioneerBids}
              disabled={disabled}
              onChange={(v) => set('allowAuctioneerBids', v)}
            />
            <SelectField
              id="s-playerOrder"
              label="Soldier order"
              value={s.playerOrder}
              disabled={disabled}
              options={[
                ['random', 'Random'],
                ['byBasePriceDesc', 'Highest base price first'],
                ['manualQueue', 'Manual queue'],
              ]}
              onChange={(v) => set('playerOrder', v as TournamentSettings['playerOrder'])}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>When nobody bids</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <SelectField
              id="s-unsoldPolicy"
              label="Unsold soldiers"
              value={s.unsoldPolicy}
              disabled={disabled}
              options={Object.entries(UNSOLD_LABELS)}
              onChange={(v) => set('unsoldPolicy', v as UnsoldPolicy)}
            />
            {s.unsoldPolicy === 'REAUCTION_THEN_ALLOCATE' ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {num('unsoldReauctionRounds', 'Re-auction rounds', '0 = straight to allocation.')}
                {num(
                  'reauctionPricePercent',
                  'Re-auction price',
                  '% of the original base price (10–100).',
                  '%',
                )}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Format</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="s-groupCount">Groups</Label>
              <div className="flex items-center gap-2">
                <Switch
                  id="s-groupAuto"
                  checked={s.groupCount === null}
                  disabled={disabled}
                  onCheckedChange={(auto) => set('groupCount', auto ? null : 2)}
                  aria-label="Choose the number of groups automatically"
                />
                <span className="text-sm text-muted">Auto (teams ÷ 4)</span>
              </div>
              {s.groupCount !== null ? (
                <Input
                  id="s-groupCount"
                  type="number"
                  min={1}
                  max={16}
                  value={s.groupCount}
                  disabled={disabled}
                  onChange={(e) => set('groupCount', toInt(e.target.value))}
                />
              ) : null}
            </div>
            {num('advancePerGroup', 'Advance per group')}
            <SelectField
              id="s-legs"
              label="Round robin"
              value={String(s.roundRobinLegs)}
              disabled={disabled}
              options={[
                ['1', 'Play each team once'],
                ['2', 'Home and away'],
              ]}
              onChange={(v) => set('roundRobinLegs', v === '2' ? 2 : 1)}
            />
            {num('pointsForWin', 'Points for a win', 'Loss = 0. No draws.')}
            <BestOfField
              label="Group matches"
              value={s.groupMatchBestOf}
              disabled={disabled}
              onChange={(v) => set('groupMatchBestOf', v)}
            />
            <BestOfField
              label="Knockout"
              value={s.knockoutBestOf}
              disabled={disabled}
              onChange={(v) => set('knockoutBestOf', v)}
            />
            <BestOfField
              label="Final"
              value={s.finalBestOf}
              disabled={disabled}
              onChange={(v) => set('finalBestOf', v)}
            />
            <ToggleRow
              id="s-third"
              label="3rd-place match"
              checked={s.thirdPlaceMatch}
              disabled={disabled}
              onChange={(v) => set('thirdPlaceMatch', v)}
            />
          </CardContent>
        </Card>
      </div>

      <aside className="lg:sticky lg:top-20 lg:self-start">
        <RulesPreview settings={s} counts={counts} />
        <p className="mt-3 flex items-center gap-2 text-sm" aria-live="polite">
          {status === 'saving' ? (
            <>
              <Loader2 aria-hidden className="size-4 animate-spin" /> Saving…
            </>
          ) : status === 'saved' ? (
            <span className="flex items-center gap-2 text-lime">
              <Check aria-hidden className="size-4" /> All changes saved
            </span>
          ) : status === 'invalid' ? (
            <span className="flex items-center gap-2 text-amber">
              <AlertTriangle aria-hidden className="size-4" /> Fix the highlighted fields to save
            </span>
          ) : status === 'error' ? (
            <span className="text-blood">{serverError}</span>
          ) : disabled ? (
            <span className="text-muted">Read-only</span>
          ) : (
            <span className="text-muted">Changes save automatically</span>
          )}
        </p>
      </aside>
    </div>
  );
}

const toInt = (raw: string): number => (raw.trim() === '' ? Number.NaN : Math.trunc(Number(raw)));

function NumberField({
  id,
  label,
  hint,
  suffix,
  value,
  error,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  suffix?: string;
  value: number;
  error?: string;
  disabled: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          value={Number.isNaN(value) ? '' : value}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          onChange={(e) => onChange(toInt(e.target.value))}
        />
        {suffix ? <span className="text-sm font-semibold text-muted">{suffix}</span> : null}
      </div>
      {error ? (
        <p id={`${id}-error`} className="text-sm text-blood">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function ToggleRow({
  id,
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  disabled: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="grid gap-0.5">
        <Label htmlFor={id}>{label}</Label>
        {hint ? <p className="text-xs text-muted">{hint}</p> : null}
      </div>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  );
}

function SelectField({
  id,
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: [string, string][];
  disabled: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 rounded-md border border-border bg-input px-3 text-sm disabled:opacity-50"
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}

type BestOf = TournamentSettings['finalBestOf'];
function BestOfField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: BestOf;
  disabled: boolean;
  onChange: (v: BestOf) => void;
}) {
  const id = `bo-${label.replace(/\W/g, '')}`;
  return (
    <SelectField
      id={id}
      label={label}
      value={String(value)}
      disabled={disabled}
      options={[
        ['1', 'Best of 1'],
        ['3', 'Best of 3'],
        ['5', 'Best of 5'],
        ['7', 'Best of 7'],
      ]}
      onChange={(v) => onChange(Number(v) as BestOf)}
    />
  );
}

function IncrementsEditor({
  value,
  disabled,
  error,
  onChange,
}: {
  value: TournamentSettings['bidIncrements'];
  disabled: boolean;
  error?: string;
  onChange: (v: TournamentSettings['bidIncrements']) => void;
}) {
  return (
    <fieldset className="grid gap-3" disabled={disabled}>
      <legend className="mb-2 text-sm font-semibold">Minimum raise</legend>
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant={value.type === 'flat' ? 'default' : 'secondary'}
          onClick={() => onChange({ type: 'flat', step: 1 })}
          aria-pressed={value.type === 'flat'}
        >
          Flat raise
        </Button>
        <Button
          type="button"
          size="sm"
          variant={value.type === 'bands' ? 'default' : 'secondary'}
          onClick={() => onChange(EXAMPLE_BAND_INCREMENTS)}
          aria-pressed={value.type === 'bands'}
        >
          Price bands
        </Button>
      </div>
      {value.type === 'flat' ? (
        <div className="flex max-w-48 items-center gap-2">
          <span className="text-sm text-muted">+</span>
          <Input
            aria-label="Flat raise in MP"
            type="number"
            min={1}
            value={Number.isNaN(value.step) ? '' : value.step}
            onChange={(e) => onChange({ type: 'flat', step: toInt(e.target.value) })}
          />
          <span className="text-sm font-semibold text-muted">MP</span>
        </div>
      ) : (
        <div className="grid gap-2">
          {value.bands.map((band, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span className="w-12 text-muted">From</span>
              <Input
                aria-label={`Band ${i + 1} starts at`}
                type="number"
                min={0}
                value={Number.isNaN(band.from) ? '' : band.from}
                disabled={i === 0}
                onChange={(e) => {
                  const bands = value.bands.map((b, j) =>
                    j === i ? { ...b, from: toInt(e.target.value) } : b,
                  );
                  onChange({ type: 'bands', bands });
                }}
              />
              <span className="text-muted">MP → +</span>
              <Input
                aria-label={`Band ${i + 1} raise`}
                type="number"
                min={1}
                value={Number.isNaN(band.step) ? '' : band.step}
                onChange={(e) => {
                  const bands = value.bands.map((b, j) =>
                    j === i ? { ...b, step: toInt(e.target.value) } : b,
                  );
                  onChange({ type: 'bands', bands });
                }}
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={`Remove band ${i + 1}`}
                disabled={value.bands.length === 1}
                onClick={() =>
                  onChange({ type: 'bands', bands: value.bands.filter((_, j) => j !== i) })
                }
              >
                <Trash2 aria-hidden />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="justify-self-start"
            onClick={() => {
              const last = value.bands.at(-1);
              onChange({
                type: 'bands',
                bands: [
                  ...value.bands,
                  { from: (last?.from ?? 0) + 100, step: (last?.step ?? 5) * 2 },
                ],
              });
            }}
          >
            <Plus aria-hidden /> Add band
          </Button>
        </div>
      )}
      {error ? <p className="text-sm text-blood">{error}</p> : null}
    </fieldset>
  );
}

/** Live preview card (§7.2): soldiers needed, purse in play, format summary. */
export function RulesPreview({
  settings,
  counts,
}: {
  settings: TournamentSettings;
  counts: RulesPreviewCounts;
}) {
  const min = counts.captains * (settings.minPlayersPerTeam - 1);
  const max = counts.captains * (settings.maxPlayersPerTeam - 1);
  let format: string;
  try {
    format =
      counts.captains >= 2
        ? planFormat(counts.captains, settings).summary
        : 'Add at least 2 captains to see the format.';
  } catch {
    // planFormat is Lane C's (C1); until it lands, show a simple fallback.
    format = `${counts.captains} teams → groups, then knockout (preview coming soon).`;
  }
  const inRange = counts.soldiers >= min && counts.soldiers <= max;
  return (
    <Card className="border-lime/30">
      <CardHeader>
        <CardTitle>Live preview</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        <p>
          <strong>{counts.captains}</strong> captains × {settings.minPlayersPerTeam}–
          {settings.maxPlayersPerTeam} players → you need{' '}
          <strong className={inRange ? 'text-lime' : 'text-amber'}>
            {min}–{max} soldiers
          </strong>{' '}
          ({counts.soldiers} approved{counts.pending > 0 ? `, ${counts.pending} pending` : ''}).
        </p>
        <p>
          Total purse in play: <strong>{formatMP(counts.totalPurse)}</strong>.
        </p>
        <p className="text-muted">{format}</p>
      </CardContent>
    </Card>
  );
}
