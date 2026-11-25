'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { InitialsAvatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MpAmount } from '@/components/ui/mp-amount';
import { ApiClientError, api, errorMessage } from '../lib/api';
import { FormError, FormField } from './form-field';

/** "Check your card" (§7.4, §7.5): photo / name / IGN as they'll appear on the auction card. */
export function MyCardForm({
  tournamentId,
  initial,
  basePrice,
  disabled,
}: {
  tournamentId: string;
  initial: { name: string; ign: string | null; phone: string | null; photoUrl: string | null };
  basePrice: number | null;
  disabled: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [ign, setIgn] = useState(initial.ign ?? '');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  return (
    <div className="grid gap-6 sm:grid-cols-[1fr_16rem]">
      <form
        className="grid gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          setFieldErrors({});
          try {
            await api(`/api/tournaments/${tournamentId}/me`, {
              method: 'PATCH',
              body: { name, ign },
            });
            toast.success('Card updated');
            router.refresh();
          } catch (err) {
            if (err instanceof ApiClientError) setFieldErrors(err.fieldErrors);
            setError(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <FormError message={error} />
        <FormField id="card-name" label="Name" error={fieldErrors.name}>
          <Input
            id="card-name"
            value={name}
            disabled={disabled}
            onChange={(e) => setName(e.target.value)}
          />
        </FormField>
        <FormField id="card-ign" label="IGN" error={fieldErrors.ign}>
          <Input
            id="card-ign"
            value={ign}
            disabled={disabled}
            onChange={(e) => setIgn(e.target.value)}
          />
        </FormField>
        {disabled ? null : (
          <Button type="submit" disabled={busy} className="justify-self-start">
            Save my card
          </Button>
        )}
      </form>
      <div className="grid content-start gap-2 rounded-xl border border-border bg-surface p-4 text-center">
        <p className="text-xs font-semibold tracking-widest text-muted uppercase">Auction card</p>
        <div className="mx-auto">
          <InitialsAvatar name={name || '?'} size="lg" />
        </div>
        <p className="font-display text-xl tracking-wide">{ign || name || 'Your IGN'}</p>
        <p className="text-sm text-muted">{name}</p>
        {basePrice !== null ? (
          <p className="flex items-center justify-center gap-2 text-sm">
            Base <MpAmount value={basePrice} />
          </p>
        ) : null}
      </div>
    </div>
  );
}
