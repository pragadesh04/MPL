'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import type { z } from 'zod';
import { InitialsAvatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { registerPlayerSchema } from '../schemas';
import { api } from '../lib/api';
import { applyServerError } from '../lib/forms';
import { formatKeyInput, useOrganiserKeyPreview } from '../lib/hooks';
import { FormError, FormField, fieldAria } from './form-field';
import { PasswordInput } from './password-input';
import { RoleChoice } from './role-choice';
import { UsernameField } from './username-field';

type Values = z.input<typeof registerPlayerSchema>;
type Output = z.output<typeof registerPlayerSchema>;

/** Player sign-up with the optional organiser key (§7.0, §2.3 B). */
export function RegisterPlayerForm({ initialKey }: { initialKey: string }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<Values, unknown, Output>({
    resolver: zodResolver(registerPlayerSchema),
    defaultValues: {
      accountType: 'PLAYER',
      displayName: '',
      ign: '',
      username: '',
      password: '',
      phone: '',
      photoUrl: '',
      organiserKey: formatKeyInput(initialKey),
      requestedRole: undefined,
    },
  });
  const { errors, isSubmitting } = form.formState;
  const keyValue = useWatch({ control: form.control, name: 'organiserKey' }) ?? '';
  const role = useWatch({ control: form.control, name: 'requestedRole' });
  const username = useWatch({ control: form.control, name: 'username' });
  const lookup = useOrganiserKeyPreview(keyValue);
  const joinable = lookup.state === 'found' && lookup.preview.canJoin;
  const organiserFirst =
    lookup.state === 'found' ? (lookup.preview.organiserName.split(' ')[0] ?? '') : '';

  const submitLabel = joinable
    ? role === 'LEADER'
      ? `Enlist as captain under ${organiserFirst}`
      : role === 'PLAYER'
        ? `Enlist as soldier under ${organiserFirst}`
        : 'Pick captain or soldier'
    : 'Create account';

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    if (lookup.state === 'invalid' || lookup.state === 'incomplete') {
      form.setError('organiserKey', {
        message: 'We couldn’t find that key. Check it with your organiser, or leave it empty.',
      });
      return;
    }
    if (joinable && !values.requestedRole) {
      form.setError('requestedRole', { message: 'Pick Captain or Soldier' });
      return;
    }
    // A key whose tournament isn't taking sign-ups is dropped: the player becomes a free agent.
    const body = joinable
      ? values
      : { ...values, organiserKey: undefined, requestedRole: undefined };
    try {
      await api('/api/auth/register', { body });
      router.replace('/dashboard?welcome=1');
      router.refresh();
    } catch (err) {
      setFormError(
        applyServerError(err, form.setError, [
          'displayName',
          'ign',
          'username',
          'password',
          'phone',
          'photoUrl',
          'organiserKey',
          'requestedRole',
        ]),
      );
    }
  });

  const keyRegistration = form.register('organiserKey');

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <FormError message={formError} />
      <FormField id="displayName" label="Name" error={errors.displayName?.message}>
        <Input
          id="displayName"
          autoComplete="name"
          {...fieldAria('displayName', errors.displayName?.message)}
          {...form.register('displayName')}
        />
      </FormField>
      <FormField
        id="ign"
        label="Mini Militia IGN"
        error={errors.ign?.message}
        hint="Your in-game name, shown on your auction card"
      >
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
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="phone" label="Phone (optional)" error={errors.phone?.message}>
          <Input
            id="phone"
            type="tel"
            autoComplete="tel"
            {...fieldAria('phone', errors.phone?.message)}
            {...form.register('phone')}
          />
        </FormField>
        <FormField id="photoUrl" label="Photo link (optional)" error={errors.photoUrl?.message}>
          <Input
            id="photoUrl"
            type="url"
            placeholder="https://…"
            {...fieldAria('photoUrl', errors.photoUrl?.message)}
            {...form.register('photoUrl')}
          />
        </FormField>
      </div>

      <div className="grid gap-3 rounded-lg border border-dashed border-border p-3">
        <FormField
          id="organiserKey"
          label="Organiser key (optional)"
          error={errors.organiserKey?.message}
          hint="Got a key like RV7-K2P from your organiser? Enter it to join their tournament."
        >
          <Input
            id="organiserKey"
            inputMode="text"
            autoCapitalize="characters"
            placeholder="XXX-XXX"
            className="font-display text-lg tracking-[0.3em] uppercase"
            {...fieldAria('organiserKey', errors.organiserKey?.message)}
            {...keyRegistration}
            onChange={(e) => {
              e.target.value = formatKeyInput(e.target.value);
              void keyRegistration.onChange(e);
            }}
          />
        </FormField>
        {lookup.state === 'checking' ? (
          <p className="flex items-center gap-2 text-sm text-muted">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Looking up the key…
          </p>
        ) : lookup.state === 'invalid' ? (
          <p role="alert" className="text-sm text-blood">
            We couldn’t find that key. Check it with your organiser, or leave it empty.
          </p>
        ) : lookup.state === 'found' ? (
          <div className="grid gap-3 rounded-md bg-surface-2 p-3 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2">
            <div className="flex items-center gap-3">
              <InitialsAvatar name={lookup.preview.organiserName} />
              {lookup.preview.canJoin ? (
                <p>
                  You&apos;re joining{' '}
                  <strong className="text-lime">{lookup.preview.tournamentName}</strong>
                </p>
              ) : (
                <p className="text-amber">
                  {lookup.preview.message} You can still create your account.
                </p>
              )}
            </div>
            {lookup.preview.canJoin ? (
              <>
                <RoleChoice
                  value={role}
                  onChange={(v) => form.setValue('requestedRole', v, { shouldValidate: true })}
                />
                {errors.requestedRole ? (
                  <p role="alert" className="text-sm text-blood">
                    {errors.requestedRole.message}
                  </p>
                ) : null}
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      <Button type="submit" size="lg" disabled={isSubmitting}>
        {isSubmitting ? 'Enlisting…' : submitLabel}
      </Button>
    </form>
  );
}
