'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ParticipantKind } from '@/lib/schemas/enums';
import { registerPlayerSchema } from '../schemas';
import { api, errorMessage } from '../lib/api';
import { applyServerError } from '../lib/forms';
import { FormError, FormField, fieldAria } from './form-field';
import { PasswordInput } from './password-input';
import { UsernameField } from './username-field';

interface ClaimResponse {
  kind: ParticipantKind;
  tournamentId: string;
}

export const afterClaimPath = (r: ClaimResponse): string =>
  r.kind === 'LEADER' ? `/t/${r.tournamentId}/teams/setup` : `/t/${r.tournamentId}/people/me`;

/** Logged in: claim the spot with one tap (§7.4 step 1). */
export function ClaimButton({ token, username }: { token: string; username: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="grid gap-3">
      <FormError message={error} />
      <Button
        type="button"
        size="lg"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const res = await api<ClaimResponse>(`/api/invites/${token}/claim`, { method: 'POST' });
            router.push(afterClaimPath(res));
            router.refresh();
          } catch (err) {
            setError(errorMessage(err));
            setBusy(false);
          }
        }}
      >
        Claim this spot as @{username}
      </Button>
    </div>
  );
}

type Values = z.input<typeof registerPlayerSchema>;

/** No account yet: register (prefilled with what the organiser typed), then claim (§7.4). */
export function InviteRegisterForm({
  token,
  prefill,
}: {
  token: string;
  prefill: { name: string; ign: string | null };
}) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<Values, unknown, z.output<typeof registerPlayerSchema>>({
    resolver: zodResolver(registerPlayerSchema),
    defaultValues: {
      accountType: 'PLAYER',
      displayName: prefill.name,
      ign: prefill.ign ?? '',
      username: '',
      password: '',
    },
  });
  const { errors, isSubmitting } = form.formState;
  const username = useWatch({ control: form.control, name: 'username' });

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      await api('/api/auth/register', {
        body: { ...values, organiserKey: undefined, requestedRole: undefined },
      });
    } catch (err) {
      setFormError(
        applyServerError(err, form.setError, [
          'displayName',
          'ign',
          'username',
          'password',
        ]),
      );
      return;
    }
    try {
      const res = await api<ClaimResponse>(`/api/invites/${token}/claim`, { method: 'POST' });
      router.push(afterClaimPath(res));
      router.refresh();
    } catch (err) {
      setFormError(`Account created, but the spot couldn’t be claimed: ${errorMessage(err)}`);
      router.refresh();
    }
  });

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <FormError message={formError} />
      <FormField id="displayName" label="Name" error={errors.displayName?.message}>
        <Input
          id="displayName"
          {...fieldAria('displayName', errors.displayName?.message)}
          {...form.register('displayName')}
        />
      </FormField>
      <FormField id="ign" label="Mini Militia IGN" error={errors.ign?.message}>
        <Input id="ign" {...fieldAria('ign', errors.ign?.message)} {...form.register('ign')} />
      </FormField>
      <UsernameField
        value={username}
        error={errors.username?.message}
        registration={form.register('username')}
      />
      <FormField id="password" label="Password" error={errors.password?.message}>
        <PasswordInput
          id="password"
          autoComplete="new-password"
          {...fieldAria('password', errors.password?.message)}
          {...form.register('password')}
        />
      </FormField>
      <Button type="submit" size="lg" disabled={isSubmitting}>
        {isSubmitting ? 'Creating account…' : 'Create account & claim'}
      </Button>
    </form>
  );
}
