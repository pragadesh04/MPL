import type * as React from 'react';
import { Slot } from 'radix-ui';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

export const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring [&>svg]:pointer-events-none [&>svg]:size-3',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-lime text-lime-foreground',
        secondary: 'border-transparent bg-surface-2 text-foreground',
        outline: 'border-border text-foreground',
        amber: 'border-transparent bg-amber text-amber-foreground',
        gold: 'border-transparent bg-gold text-gold-foreground',
        blood: 'border-transparent bg-blood text-blood-foreground',
        sand: 'border-transparent bg-sand text-sand-foreground',
        info: 'border-transparent bg-info text-info-foreground',
        success: 'border-transparent bg-success text-success-foreground',
      },
      caps: {
        true: 'text-[0.6875rem] tracking-widest uppercase',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'default',
      caps: false,
    },
  },
);

export function Badge({
  className,
  variant,
  caps,
  asChild = false,
  ...props
}: React.ComponentProps<'span'> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }): React.JSX.Element {
  const Comp = asChild ? Slot.Root : 'span';
  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant, caps }), className)}
      {...props}
    />
  );
}
