'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { changePasswordSchema, updateProfileSchema } from '../schemas';
import { api } from '../lib/api';
import { applyServerError } from '../lib/forms';
import { FormError, FormField, fieldAria } from './form-field';
import { PasswordInput } from './password-input';

type ProfileValues = z.input<typeof updateProfileSchema>;

export function ProfileForm({ initial }: { initial: ProfileValues }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<ProfileValues, unknown, z.output<typeof updateProfileSchema>>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: initial,
  });
  const { errors, isSubmitting } = form.formState;
  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      await api('/api/me/profile', { method: 'PATCH', body: values });
      toast.success('Profile saved');
      router.refresh();
    } catch (err) {
      setFormError(
        applyServerError(err, form.setError, ['displayName', 'ign']),
      );
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
      <p className="text-sm text-muted">
        Changes also update your card in tournaments that haven&apos;t started yet.
      </p>
      <Button type="submit" disabled={isSubmitting} className="justify-self-start">
        Save profile
      </Button>
    </form>
  );
}

type PasswordValues = z.input<typeof changePasswordSchema>;

export function ChangePasswordForm() {
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<PasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '' },
  });
  const { errors, isSubmitting } = form.formState;
  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      await api('/api/me/password', { body: values });
      form.reset();
      toast.success('Password changed');
    } catch (err) {
      setFormError(applyServerError(err, form.setError, ['currentPassword', 'newPassword']));
    }
  });
  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <FormError message={formError} />
      <FormField
        id="currentPassword"
        label="Current password"
        error={errors.currentPassword?.message}
      >
        <PasswordInput
          id="currentPassword"
          autoComplete="current-password"
          {...fieldAria('currentPassword', errors.currentPassword?.message)}
          {...form.register('currentPassword')}
        />
      </FormField>
      <FormField id="newPassword" label="New password" error={errors.newPassword?.message}>
        <PasswordInput
          id="newPassword"
          autoComplete="new-password"
          {...fieldAria('newPassword', errors.newPassword?.message)}
          {...form.register('newPassword')}
        />
      </FormField>
      <Button type="submit" disabled={isSubmitting} className="justify-self-start">
        Change password
      </Button>
    </form>
  );
}
