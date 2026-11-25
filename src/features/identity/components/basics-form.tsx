'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, errorMessage } from '../lib/api';
import { FormError, FormField, fieldAria } from './form-field';

/** Setup step 1: the tournament name. */
export function BasicsForm({
  tournamentId,
  initial,
  disabled,
}: {
  tournamentId: string;
  initial: { name: string };
  disabled: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const trimmed = name.trim();
  const nameError =
    trimmed.length > 0 && trimmed.length < 3 ? 'Use at least 3 characters' : undefined;

  const save = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (nameError || trimmed.length === 0) {
      setError(nameError ?? 'Enter a tournament name');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api(`/api/tournaments/${tournamentId}`, { method: 'PATCH', body: { name: trimmed } });
      toast.success('Saved');
      router.push(`/t/${tournamentId}/setup?step=rules`);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="grid max-w-xl gap-6" noValidate>
      <FormError message={error} />
      <FormField
        id="t-name"
        label="Tournament name"
        error={nameError}
        hint={nameError ? undefined : 'Shown on the big screen and in announcements.'}
        className="gap-2"
      >
        <Input
          id="t-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          autoComplete="off"
          autoFocus
          disabled={disabled}
          className="h-12 text-base"
          {...fieldAria('t-name', nameError)}
        />
      </FormField>
      <Button
        type="submit"
        size="lg"
        disabled={busy || disabled}
        className="w-full justify-center sm:w-auto"
      >
        {busy ? 'Saving…' : 'Save and continue'}
      </Button>
    </form>
  );
}
