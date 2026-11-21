'use client';

import { AlertTriangle, Check } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  backgroundContrast,
  findTooSimilarColor,
  MIN_TEAM_COLOR_CONTRAST,
} from '@/lib/rules/validateReadyToStart';
import { teamStyle } from '@/lib/team-color';
import { cn } from '@/lib/utils';
import { ApiClientError, api, errorMessage } from '../lib/api';
import { suggestShortName, TEAM_PALETTE } from '../lib/palette';
import { FormError, FormField } from './form-field';
import { TeamBannerPreview, TeamCardPreview } from './team-card-preview';

export interface OtherTeam {
  leaderId: string;
  name: string;
  shortName: string;
  color: string;
}

export interface TeamSetupInitial {
  name: string;
  shortName: string;
  color: string;
  emoji: string | null;
  motto: string | null;
  logoUrl: string | null;
}

const HEX = /^#[0-9a-f]{6}$/;

/**
 * Captain team setup (§7.4 step 2): name (unique, checked live), short code (auto-suggested),
 * colour picker (taken colours greyed out with that team's name, live), custom hex with a
 * contrast check and "too similar to <team>" warning, emoji / logo, motto, live previews.
 * Organisers reuse it from the Teams tracker (`endpoint` points at …/teams/:leaderId).
 */
export function TeamSetupForm({
  endpoint,
  captainName,
  purse,
  initial,
  otherTeams,
  disabled,
  onSaved,
}: {
  endpoint: string;
  captainName: string;
  purse?: number;
  initial: TeamSetupInitial | null;
  otherTeams: OtherTeam[];
  disabled?: boolean;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? '');
  const [shortName, setShortName] = useState(initial?.shortName ?? '');
  const [shortTouched, setShortTouched] = useState(Boolean(initial));
  const [color, setColor] = useState(initial?.color ?? '');
  const [custom, setCustom] = useState(
    initial && !TEAM_PALETTE.some((p) => p.hex === initial.color) ? initial.color : '',
  );
  const [emoji, setEmoji] = useState(initial?.emoji ?? '');
  const [logoUrl, setLogoUrl] = useState(initial?.logoUrl ?? '');
  const [motto, setMotto] = useState(initial?.motto ?? '');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const takenBy = new Map(otherTeams.map((t) => [t.color.toLowerCase(), t]));
  const nameTaken = otherTeams.find(
    (t) => t.name.trim().toLowerCase() === name.trim().toLowerCase() && name.trim() !== '',
  );
  const shortTaken = otherTeams.find(
    (t) => t.shortName.toUpperCase() === shortName.toUpperCase() && shortName !== '',
  );
  const lc = color.toLowerCase();
  const validColor = HEX.test(lc);
  const similar = validColor
    ? findTooSimilarColor(
        lc,
        otherTeams.filter((t) => t.color !== lc),
      )
    : undefined;
  const lowContrast = validColor && backgroundContrast(lc) < MIN_TEAM_COLOR_CONTRAST;

  const save = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      await api(endpoint, {
        method: 'PUT',
        body: { name, shortName, color: lc, emoji, logoUrl, motto },
      });
      toast.success('Team saved');
      router.refresh();
      onSaved?.();
    } catch (err) {
      if (err instanceof ApiClientError) setFieldErrors(err.fieldErrors);
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const preview = { name, shortName, color: lc, emoji, motto };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <form onSubmit={save} className="grid gap-5">
        <FormError message={error} />
        <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
          <FormField
            id="team-name"
            label="Team name"
            error={
              fieldErrors.name ?? (nameTaken ? 'Another team already has that name' : undefined)
            }
          >
            <Input
              id="team-name"
              value={name}
              disabled={disabled}
              maxLength={30}
              onChange={(e) => {
                setName(e.target.value);
                if (!shortTouched) setShortName(suggestShortName(e.target.value));
              }}
            />
          </FormField>
          <FormField
            id="team-short"
            label="Short code"
            error={fieldErrors.shortName ?? (shortTaken ? `Used by ${shortTaken.name}` : undefined)}
          >
            <Input
              id="team-short"
              value={shortName}
              disabled={disabled}
              maxLength={4}
              className="font-display tracking-widest uppercase"
              onChange={(e) => {
                setShortTouched(true);
                setShortName(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''));
              }}
            />
          </FormField>
        </div>

        <fieldset className="grid gap-3" disabled={disabled}>
          <legend className="mb-1 text-sm font-semibold">Team colour</legend>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
            {TEAM_PALETTE.map((p) => {
              const taken = takenBy.get(p.hex);
              const selected = lc === p.hex;
              return (
                <button
                  key={p.hex}
                  type="button"
                  disabled={Boolean(taken)}
                  onClick={() => {
                    setColor(p.hex);
                    setCustom('');
                  }}
                  aria-pressed={selected}
                  aria-label={taken ? `${p.name}, taken by ${taken.name}` : p.name}
                  title={taken ? `Taken by ${taken.name}` : p.name}
                  style={teamStyle(p.hex)}
                  className={cn(
                    'relative flex aspect-square flex-col items-center justify-center rounded-lg border-2 text-[0.625rem] font-semibold',
                    taken ? 'cursor-not-allowed border-border opacity-40' : 'bg-team text-on-team',
                    selected ? 'border-foreground ring-2 ring-lime' : 'border-transparent',
                  )}
                >
                  {selected ? <Check aria-hidden className="size-5" /> : null}
                  {taken ? (
                    <span className="bg-team text-on-team absolute inset-x-0 bottom-0 truncate rounded-b-md px-0.5">
                      {taken.shortName}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="team-custom" className="text-sm text-muted">
              Custom hex
            </label>
            <Input
              id="team-custom"
              value={custom}
              placeholder="#1a2b3c"
              maxLength={7}
              className="w-32 font-mono"
              onChange={(e) => {
                const v = e.target.value.trim();
                setCustom(v);
                if (HEX.test(v.toLowerCase())) setColor(v.toLowerCase());
              }}
            />
          </div>
          {fieldErrors.color ? <p className="text-sm text-blood">{fieldErrors.color}</p> : null}
          {validColor && takenBy.has(lc) ? (
            <p className="text-sm text-blood">Taken by {takenBy.get(lc)!.name}</p>
          ) : similar ? (
            <p className="flex items-center gap-2 text-sm text-amber">
              <AlertTriangle aria-hidden className="size-4" /> Too similar to {similar.name} — pick
              something more different so people can tell you apart.
            </p>
          ) : null}
          {lowContrast ? (
            <p className="flex items-center gap-2 text-sm text-amber">
              <AlertTriangle aria-hidden className="size-4" /> Too dark to read on the big screen.
            </p>
          ) : null}
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
          <FormField id="team-emoji" label="Emoji" error={fieldErrors.emoji}>
            <Input
              id="team-emoji"
              value={emoji}
              disabled={disabled}
              maxLength={8}
              placeholder="🦏"
              className="text-center text-xl"
              onChange={(e) => setEmoji(e.target.value)}
            />
          </FormField>
          <FormField id="team-logo" label="Logo link (optional)" error={fieldErrors.logoUrl}>
            <Input
              id="team-logo"
              type="url"
              value={logoUrl}
              disabled={disabled}
              placeholder="https://…"
              onChange={(e) => setLogoUrl(e.target.value)}
            />
          </FormField>
        </div>
        <FormField id="team-motto" label="Motto / battle cry (optional)" error={fieldErrors.motto}>
          <Input
            id="team-motto"
            value={motto}
            disabled={disabled}
            maxLength={80}
            onChange={(e) => setMotto(e.target.value)}
          />
        </FormField>
        {disabled ? null : (
          <Button
            type="submit"
            size="lg"
            className="justify-self-start"
            disabled={busy || !validColor || name.trim().length < 2 || shortName.length < 2}
          >
            {initial ? 'Save team' : 'Team ready'}
          </Button>
        )}
      </form>
      <aside className="grid gap-3 lg:sticky lg:top-20 lg:self-start">
        <p className="text-sm font-semibold text-muted">Live preview</p>
        <TeamCardPreview team={preview} captainName={captainName} purse={purse} />
        <TeamBannerPreview team={preview} />
      </aside>
    </div>
  );
}
