import type * as React from 'react';

import { cn } from '@/lib/utils';

export function Card({ className, ...props }: React.ComponentProps<'div'>): React.JSX.Element {
  return (
    <div
      data-slot="card"
      className={cn(
        'flex flex-col gap-5 rounded-lg border border-border bg-surface py-5 text-foreground shadow-sm',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({
  className,
  ...props
}: React.ComponentProps<'div'>): React.JSX.Element {
  return (
    <div
      data-slot="card-header"
      className={cn(
        '@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-5 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-5',
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: React.ComponentProps<'div'>): React.JSX.Element {
  return (
    <div
      data-slot="card-title"
      className={cn('font-display text-lg leading-tight tracking-wide uppercase', className)}
      {...props}
    />
  );
}

export function CardDescription({
  className,
  ...props
}: React.ComponentProps<'div'>): React.JSX.Element {
  return (
    <div data-slot="card-description" className={cn('text-sm text-muted', className)} {...props} />
  );
}

export function CardAction({
  className,
  ...props
}: React.ComponentProps<'div'>): React.JSX.Element {
  return (
    <div
      data-slot="card-action"
      className={cn('col-start-2 row-span-2 row-start-1 self-start justify-self-end', className)}
      {...props}
    />
  );
}

export function CardContent({
  className,
  ...props
}: React.ComponentProps<'div'>): React.JSX.Element {
  return <div data-slot="card-content" className={cn('px-5', className)} {...props} />;
}

export function CardFooter({
  className,
  ...props
}: React.ComponentProps<'div'>): React.JSX.Element {
  return (
    <div
      data-slot="card-footer"
      className={cn('flex items-center px-5 [.border-t]:pt-5', className)}
      {...props}
    />
  );
}
