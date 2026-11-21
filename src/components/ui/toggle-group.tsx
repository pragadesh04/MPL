'use client';

import * as React from 'react';
import { ToggleGroup as ToggleGroupPrimitive } from 'radix-ui';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

/**
 * Segmented toggle (List | Tree, Captain | Soldier). Use `type="single"` for a segmented control;
 * give the group an `aria-label`.
 */
export const toggleVariants = cva(
  "inline-flex items-center justify-center gap-2 text-sm font-semibold tracking-wide whitespace-nowrap uppercase transition-colors outline-none hover:text-foreground focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-lime data-[state=on]:text-lime-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: 'bg-transparent text-muted',
        outline: 'border border-border bg-transparent text-muted hover:bg-surface-2',
      },
      size: {
        sm: 'h-8 min-w-8 px-2.5 text-xs',
        default: 'h-10 min-w-10 px-3',
        lg: 'h-12 min-w-12 px-4 text-base',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

type ToggleVariantProps = VariantProps<typeof toggleVariants>;

const ToggleGroupContext = React.createContext<ToggleVariantProps>({
  variant: 'default',
  size: 'default',
});

export function ToggleGroup({
  className,
  variant,
  size,
  children,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Root> & ToggleVariantProps): React.JSX.Element {
  const value = React.useMemo(() => ({ variant, size }), [variant, size]);
  return (
    <ToggleGroupPrimitive.Root
      data-slot="toggle-group"
      data-variant={variant}
      data-size={size}
      className={cn(
        'inline-flex w-fit items-center overflow-hidden rounded-md border border-border bg-surface p-0.5',
        className,
      )}
      {...props}
    >
      <ToggleGroupContext.Provider value={value}>{children}</ToggleGroupContext.Provider>
    </ToggleGroupPrimitive.Root>
  );
}

export function ToggleGroupItem({
  className,
  children,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item> & ToggleVariantProps): React.JSX.Element {
  const context = React.useContext(ToggleGroupContext);
  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      data-variant={context.variant ?? variant}
      data-size={context.size ?? size}
      className={cn(
        toggleVariants({ variant: context.variant ?? variant, size: context.size ?? size }),
        'flex-1 shrink-0 rounded-sm',
        className,
      )}
      {...props}
    >
      {children}
    </ToggleGroupPrimitive.Item>
  );
}
