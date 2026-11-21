'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { loginSchema } from '../schemas';
import { api } from '../lib/api';
import { applyServerError } from '../lib/forms';
import { FormError, FormField, fieldAria } from './form-field';
import { PasswordInput } from './password-input';

type LoginValues = z.input<typeof loginSchema>;

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: '', password: '' },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      await api('/api/auth/login', { body: values });
      router.replace(next);
      router.refresh();
    } catch (err) {
      setFormError(applyServerError(err, form.setError, ['username', 'password']));
    }
  });

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <FormError message={formError} />
      <FormField id="username" label="Username" error={errors.username?.message}>
        <Input
          id="username"
          autoComplete="username"
          autoCapitalize="none"
          {...fieldAria('username', errors.username?.message)}
          {...form.register('username')}
        />
      </FormField>
      <FormField id="password" label="Password" error={errors.password?.message}>
        <PasswordInput
          id="password"
          autoComplete="current-password"
          {...fieldAria('password', errors.password?.message)}
          {...form.register('password')}
        />
      </FormField>
      <Button type="submit" size="lg" disabled={isSubmitting}>
        {isSubmitting ? 'Checking…' : 'Log in'}
      </Button>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <button
          type="button"
          className="font-semibold text-lime hover:underline"
          onClick={() => setShowHelp((v) => !v)}
          aria-expanded={showHelp}
        >
          Forgot password?
        </button>
        <Link href="/register" className="text-muted hover:text-foreground">
          New here? <span className="font-semibold text-lime">Create an account</span>
        </Link>
      </div>
      {showHelp ? (
        <div className="grid gap-1 rounded-md border border-border bg-surface-2 p-3 text-sm text-muted">
          <p>
            <strong className="text-foreground">Players:</strong> ask your organiser to send you a
            reset link.
          </p>
          <p>
            <strong className="text-foreground">Organisers:</strong> contact the site admin.
          </p>
        </div>
      ) : null}
    </form>
  );
}
