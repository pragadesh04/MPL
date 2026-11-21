'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { api, ApiClientError, errorMessage } from '../lib/api';
import { FormError, FormField } from './form-field';
import { PasswordInput, PasswordStrengthMeter } from './password-input';

/** Set a new password from a one-time link (§2.5). */
export function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (done) {
    return (
      <div className="grid gap-3">
        <p className="text-lime">Password changed. Log in as @{done}.</p>
        <Button asChild>
          <Link href="/login">Log in</Link>
        </Button>
      </div>
    );
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (password !== confirm) {
          setError('Passwords don’t match');
          return;
        }
        setBusy(true);
        setError(null);
        try {
          const res = await api<{ username: string }>(`/api/password-resets/${token}`, {
            body: { password },
          });
          setDone(res.username);
        } catch (err) {
          setError(
            err instanceof ApiClientError && err.status === 404
              ? 'This link has expired or was already used. Ask for a new one.'
              : errorMessage(err),
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <FormError message={error} />
      <FormField id="new-password" label="New password">
        <PasswordInput
          id="new-password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </FormField>
      <PasswordStrengthMeter password={password} />
      <FormField id="confirm-password" label="Confirm password">
        <PasswordInput
          id="confirm-password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </FormField>
      <Button type="submit" size="lg" disabled={busy || password.length < 8}>
        Set new password
      </Button>
    </form>
  );
}
