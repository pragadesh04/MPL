import type * as React from 'react';

import { cn } from '@/lib/utils';

export function Input({
  className,
  type,
  ...props
}: React.ComponentProps<'input'>): React.JSX.Element {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'flex h-10 w-full min-w-0 rounded-md border border-border bg-input px-3 py-2 text-base text-foreground transition-colors outline-none selection:bg-lime selection:text-lime-foreground placeholder:text-muted md:text-sm',
        'file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground',
        'focus-visible:border-lime-dim focus-visible:ring-2 focus-visible:ring-ring',
        'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
        'aria-invalid:border-blood aria-invalid:ring-blood/40',
        className,
      )}
      {...props}
    />
  );
}
