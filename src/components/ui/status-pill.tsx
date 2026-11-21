import type * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

export const statusPillVariants = cva(
  "inline-flex w-fit items-center gap-1.5 rounded-full border px-3 py-1 text-[0.6875rem] leading-none font-bold tracking-widest whitespace-nowrap uppercase [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
  {
    variants: {
      tone: {
        lime: 'border-lime/40 bg-lime/10 text-lime',
        amber: 'border-amber/40 bg-amber/10 text-amber',
        gold: 'border-gold/40 bg-gold/10 text-gold',
        blood: 'border-blood/50 bg-blood/15 text-blood',
        sand: 'border-sand/40 bg-sand/10 text-sand',
        info: 'border-info/40 bg-info/10 text-info',
        success: 'border-success/40 bg-success/10 text-success',
        neutral: 'border-border bg-surface-2 text-muted',
      },
    },
    defaultVariants: { tone: 'lime' },
  },
);

export type StatusPillTone = NonNullable<VariantProps<typeof statusPillVariants>['tone']>;

/**
 * Headline stat pill, e.g. `AUCTION COMPLETE` · `4 CAPTAINS`. Set `live` for a pulsing dot
 * (a live lot, an active auction).
 */
export function StatusPill({
  className,
  tone,
  live = false,
  children,
  ...props
}: React.ComponentProps<'span'> &
  VariantProps<typeof statusPillVariants> & { live?: boolean }): React.JSX.Element {
  return (
    <span
      data-slot="status-pill"
      className={cn(statusPillVariants({ tone }), className)}
      {...props}
    >
      {live ? (
        <span aria-hidden="true" className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-60" />
          <span className="relative inline-flex size-2 rounded-full bg-current" />
        </span>
      ) : null}
      {children}
    </span>
  );
}
