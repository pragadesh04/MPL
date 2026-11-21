import type * as React from 'react';

import { cn } from '@/lib/utils';

export function Textarea({
  className,
  ...props
}: React.ComponentProps<'textarea'>): React.JSX.Element {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'flex field-sizing-content min-h-20 w-full rounded-md border border-border bg-input px-3 py-2 text-base text-foreground transition-colors outline-none placeholder:text-muted md:text-sm',
        'focus-visible:border-lime-dim focus-visible:ring-2 focus-visible:ring-ring',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'aria-invalid:border-blood aria-invalid:ring-blood/40',
        className,
      )}
      {...props}
    />
  );
}
