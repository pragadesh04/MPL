'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, errorMessage } from '../lib/api';
import { FormError, FormField } from './form-field';

/** Setup step 1: name and logo (§7.2). */
export function BasicsForm({
  tournamentId,
  initial,
  disabled,
}: {
  tournamentId: string;
  initial: { name: string; logoUrl: string | null };
  disabled: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [logoUrl, setLogoUrl] = useState(initial.logoUrl ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/api/tournaments/${tournamentId}`, { method: 'PATCH', body: { name, logoUrl } });
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
    <form onSubmit={save} className="grid max-w-xl gap-4">
      <FormError message={error} />
      <FormField id="t-name" label="Tournament name">
        <Input
          id="t-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          minLength={3}
          maxLength={60}
          required
          disabled={disabled}
        />
      </FormField>
      <FormField id="t-logo" label="Logo link (optional)" hint="An https:// image link">
        <Input
          id="t-logo"
          type="url"
          value={logoUrl}
          onChange={(e) => setLogoUrl(e.target.value)}
          placeholder="https://…"
          disabled={disabled}
        />
      </FormField>
      <Button type="submit" disabled={busy || disabled} className="justify-self-start">
        Save & continue
      </Button>
    </form>
  );
}
