import type * as React from 'react';
import { UserPlusIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

/** Dashed "Open slot" placeholder for an unfilled squad position (row by default, or a card). */
export function OpenSlot({
  className,
  label = 'Open slot',
  variant = 'row',
  ...props
}: Omit<React.ComponentProps<'div'>, 'children'> & {
  label?: string;
  variant?: 'row' | 'card';
}): React.JSX.Element {
  return (
    <div
      data-slot="open-slot"
      data-variant={variant}
      className={cn(
        'flex items-center gap-2 rounded-md border border-dashed border-border text-sm font-semibold tracking-widest text-muted uppercase',
        variant === 'row' ? 'h-11 px-3' : 'min-h-24 flex-col justify-center p-4 text-center',
        className,
      )}
      {...props}
    >
      <UserPlusIcon className="size-4 shrink-0 opacity-70" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
