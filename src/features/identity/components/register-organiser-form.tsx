'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { registerOrganiserSchema } from '../schemas';
import { api } from '../lib/api';
import { applyServerError } from '../lib/forms';
import { FormError, FormField, fieldAria } from './form-field';
import { PasswordInput, PasswordStrengthMeter } from './password-input';
import { UsernameField } from './username-field';

const formSchema = registerOrganiserSchema
  .extend({ confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, {
    message: 'Passwords don’t match',
    path: ['confirmPassword'],
  });
type Values = z.input<typeof formSchema>;
type Output = z.output<typeof formSchema>;

/** Organiser sign-up (§7.0): auto-login → dashboard with the organiser key card. */
export function RegisterOrganiserForm() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<Values, unknown, Output>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      accountType: 'ORGANISER',
      displayName: '',
      username: '',
      password: '',
      confirmPassword: '',
    },
  });
  const { errors, isSubmitting } = form.formState;
  const username = useWatch({ control: form.control, name: 'username' });
  const password = useWatch({ control: form.control, name: 'password' });

  const onSubmit = form.handleSubmit(async ({ confirmPassword: _c, ...values }) => {
    setFormError(null);
    try {
      await api('/api/auth/register', { body: values });
      router.replace('/dashboard?welcome=1');
      router.refresh();
    } catch (err) {
      setFormError(
        applyServerError(err, form.setError, ['displayName', 'username', 'password']),
      );
    }
  });

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
      <PasswordStrengthMeter password={password} />
      <FormField
        id="confirmPassword"
        label="Confirm password"
        error={errors.confirmPassword?.message}
      >
        <PasswordInput
          id="confirmPassword"
          autoComplete="new-password"
          {...fieldAria('confirmPassword', errors.confirmPassword?.message)}
          {...form.register('confirmPassword')}
        />
      </FormField>
      <Button type="submit" size="lg" disabled={isSubmitting}>
        {isSubmitting ? 'Setting up…' : 'Create organiser account'}
      </Button>
    </form>
  );
}
