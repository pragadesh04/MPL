'use client';

import type * as React from 'react';
import { Slot } from 'radix-ui';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

export const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md font-sans font-semibold tracking-wide whitespace-nowrap uppercase transition-all outline-none select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 aria-invalid:ring-2 aria-invalid:ring-blood/60 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: 'bg-lime text-lime-foreground shadow-glow hover:bg-lime/90 active:bg-lime-dim',
        secondary: 'bg-surface-2 text-foreground hover:bg-surface-2/80',
        outline:
          'border border-border bg-transparent text-foreground hover:border-lime-dim hover:bg-surface-2',
        ghost: 'text-foreground hover:bg-surface-2',
        destructive: 'bg-blood text-blood-foreground hover:bg-blood/90',
        link: 'text-lime underline-offset-4 hover:underline',
        gold: 'bg-gold text-gold-foreground hover:bg-gold/90',
      },
      size: {
        sm: 'h-8 gap-1.5 px-3 text-xs',
        default: 'h-10 px-4 text-sm',
        lg: 'h-12 px-6 text-base',
        xl: "h-16 w-full px-8 font-display text-2xl [&_svg:not([class*='size-'])]:size-6",
        icon: 'size-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export function Button({
  className,
  variant,
  size,
  asChild = false,
  type,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }): React.JSX.Element {
  if (asChild) {
    return (
      <Slot.Root
        data-slot="button"
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      />
    );
  }
  return (
    <button
      data-slot="button"
      type={type ?? 'button'}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}
