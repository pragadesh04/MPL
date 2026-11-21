'use client';

import type * as React from 'react';
import { Toaster as Sonner, toast, type ToasterProps } from 'sonner';

export { toast };

/**
 * Sonner styles are unlayered, so Tailwind utilities can't override them; theme it through its
 * CSS variables, pointed at our design tokens (no hex).
 */
const tokenVars = {
  '--normal-bg': 'var(--color-surface)',
  '--normal-text': 'var(--color-foreground)',
  '--normal-border': 'var(--color-border)',
  '--success-bg': 'var(--color-surface)',
  '--success-text': 'var(--color-success)',
  '--success-border': 'var(--color-success)',
  '--error-bg': 'var(--color-surface)',
  '--error-text': 'var(--color-blood)',
  '--error-border': 'var(--color-blood)',
  '--warning-bg': 'var(--color-surface)',
  '--warning-text': 'var(--color-amber)',
  '--warning-border': 'var(--color-amber)',
  '--info-bg': 'var(--color-surface)',
  '--info-text': 'var(--color-info)',
  '--info-border': 'var(--color-info)',
  '--border-radius': 'var(--radius-md)',
} as React.CSSProperties;

export function Toaster({ toastOptions, ...props }: ToasterProps): React.JSX.Element {
  return (
    <Sonner
      theme="dark"
      position="top-center"
      className="toaster group"
      style={tokenVars}
      toastOptions={{
        ...toastOptions,
        classNames: {
          toast: 'font-sans',
          title: 'font-semibold tracking-wide',
          description: 'text-muted',
          ...toastOptions?.classNames,
        },
      }}
      {...props}
    />
  );
}
