'use client';

import type * as React from 'react';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export interface FormFieldProps {
  id: string;
  label: React.ReactNode;
  error?: string;
  hint?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

/** Label + control + hint/error line. Pass `aria-invalid` / `aria-describedby` on the control. */
export function FormField({ id, label, error, hint, className, children }: FormFieldProps) {
  return (
    <div className={cn('grid gap-1.5', className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm font-medium text-blood">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Props to spread on an input for accessible errors. */
export function fieldAria(id: string, error?: string): Record<string, string | boolean> {
  return error ? { 'aria-invalid': true, 'aria-describedby': `${id}-error` } : {};
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-md border border-blood/50 bg-blood/10 px-3 py-2 text-sm text-blood"
    >
      {message}
    </p>
  );
}
