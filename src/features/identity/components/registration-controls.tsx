'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { api, errorMessage } from '../lib/api';

/** Organiser-key sign-ups: Open / Closed, max registrations, live counter (§2.3 B, §7.2). */
export function RegistrationControls({
  tournamentId,
  open,
  maxRegistrations,
  registered,
  pending,
  disabled,
}: {
  tournamentId: string;
  open: boolean;
  maxRegistrations: number | null;
  registered: number;
  pending: number;
  disabled: boolean;
}) {
  const router = useRouter();
  const [max, setMax] = useState(maxRegistrations === null ? '' : String(maxRegistrations));
  const [busy, setBusy] = useState(false);

  const save = async (next: { registrationOpen: boolean; maxRegistrations: number | null }) => {
    setBusy(true);
    try {
      await api(`/api/tournaments/${tournamentId}/registration`, { method: 'PATCH', body: next });
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const maxValue = max.trim() === '' ? null : Number(max);

  return (
    <div className="grid gap-3 border-t border-border pt-4">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="reg-open">Sign-ups with the key</Label>
        <div className="flex items-center gap-2 text-sm">
          <span className={open ? 'text-lime' : 'text-muted'}>{open ? 'Open' : 'Closed'}</span>
          <Switch
            id="reg-open"
            checked={open}
            disabled={disabled || busy}
            onCheckedChange={(v) => save({ registrationOpen: v, maxRegistrations: maxValue })}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="grid gap-1.5">
          <Label htmlFor="reg-max">Max registrations (optional)</Label>
          <Input
            id="reg-max"
            type="number"
            min={1}
            value={max}
            disabled={disabled}
            onChange={(e) => setMax(e.target.value)}
            className="w-32"
          />
        </div>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={disabled || busy || maxValue === maxRegistrations}
          onClick={() => save({ registrationOpen: open, maxRegistrations: maxValue })}
        >
          Save
        </Button>
      </div>
      <p className="text-sm" aria-live="polite">
        <strong className="tabular">{registered}</strong> registered with the key
        {maxRegistrations ? ` (of ${maxRegistrations})` : ''} ·{' '}
        <strong className="tabular text-amber">{pending}</strong> pending
      </p>
    </div>
  );
}
