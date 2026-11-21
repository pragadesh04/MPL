'use client';

import { Eye, EyeOff } from 'lucide-react';
import { useState, type ComponentProps } from 'react';
import { Input } from '@/components/ui/input';

/** Password input with a "show password" toggle (§7.0). */
export function PasswordInput(props: Omit<ComponentProps<'input'>, 'type'>) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={visible ? 'text' : 'password'} className="pr-11" />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted hover:text-foreground"
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

/** 0–4 strength score for the organiser sign-up meter. */
export function passwordStrength(password: string): number {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) score++;
  return score;
}

const LABELS = ['Too weak', 'Weak', 'Okay', 'Strong', 'Very strong'] as const;
const TONES = ['bg-blood', 'bg-blood', 'bg-amber', 'bg-lime-dim', 'bg-lime'] as const;

export function PasswordStrengthMeter({ password }: { password: string }) {
  const score = passwordStrength(password);
  return (
    <div className="grid gap-1" aria-live="polite">
      <div className="flex gap-1" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={`h-1.5 flex-1 rounded-full ${i < score ? TONES[score] : 'bg-surface-2'}`}
          />
        ))}
      </div>
      <span className="text-xs text-muted">
        {password ? LABELS[score] : 'At least 8 characters'}
      </span>
    </div>
  );
}
