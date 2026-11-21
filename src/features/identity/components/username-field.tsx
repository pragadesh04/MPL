'use client';

import { Check, Loader2, X } from 'lucide-react';
import type { UseFormRegisterReturn } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { useUsernameAvailability } from '../lib/hooks';
import { FormField, fieldAria } from './form-field';

/** Username input with a live availability check (§7.0). */
export function UsernameField({
  value,
  error,
  registration,
}: {
  value: string;
  error?: string;
  registration: UseFormRegisterReturn;
}) {
  const availability = useUsernameAvailability(value);
  const hint =
    availability.state === 'checking' ? (
      <span className="inline-flex items-center gap-1">
        <Loader2 className="size-3 animate-spin" aria-hidden /> Checking…
      </span>
    ) : availability.state === 'available' ? (
      <span className="inline-flex items-center gap-1 text-lime">
        <Check className="size-3" aria-hidden /> Available
      </span>
    ) : availability.state === 'taken' ? (
      <span className="inline-flex items-center gap-1 text-blood">
        <X className="size-3" aria-hidden /> {availability.reason}
      </span>
    ) : (
      'Letters, numbers and _ (you log in with this)'
    );
  return (
    <FormField id="username" label="Username" error={error} hint={hint}>
      <Input
        id="username"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        {...fieldAria('username', error)}
        {...registration}
      />
    </FormField>
  );
}
