'use client';

import type * as React from 'react';
import { Avatar as AvatarPrimitive } from 'radix-ui';

import { cn } from '@/lib/utils';
import { teamStyle } from '@/lib/team-color';

export function Avatar({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Root>): React.JSX.Element {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      className={cn('relative flex size-10 shrink-0 overflow-hidden rounded-md', className)}
      {...props}
    />
  );
}

export function AvatarImage({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Image>): React.JSX.Element {
  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={cn('aspect-square size-full object-cover', className)}
      {...props}
    />
  );
}

export function AvatarFallback({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Fallback>): React.JSX.Element {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn(
        'flex size-full items-center justify-center bg-surface-2 font-display text-sm text-foreground uppercase',
        className,
      )}
      {...props}
    />
  );
}

/** Up to two initials from a display name: "Ghost Rider" → "GR", "viper" → "VI". */
export function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words.at(0);
  const last = words.at(-1);
  if (!first || !last) return '?';
  if (words.length === 1) return first.slice(0, 2).toUpperCase();
  return (first.charAt(0) + last.charAt(0)).toUpperCase();
}

const initialsSizes = {
  sm: 'size-8 text-xs',
  default: 'size-10 text-sm',
  lg: 'size-14 text-lg',
} as const;

/**
 * Initials on a coloured square. With `color` (a team `#rrggbb`) it uses the team colour and a
 * readable foreground; otherwise a neutral surface. The name is exposed via `aria-label`.
 */
export function InitialsAvatar({
  name,
  color,
  size = 'default',
  className,
  ...props
}: Omit<React.ComponentProps<'span'>, 'children' | 'color'> & {
  name: string;
  color?: string;
  size?: keyof typeof initialsSizes;
}): React.JSX.Element {
  return (
    <span
      data-slot="initials-avatar"
      role="img"
      aria-label={name}
      style={color ? teamStyle(color) : undefined}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-md font-display tracking-wide uppercase select-none',
        color ? 'bg-team text-on-team' : 'border border-border bg-surface-2 text-foreground',
        initialsSizes[size],
        className,
      )}
      {...props}
    >
      <span aria-hidden="true">{getInitials(name)}</span>
    </span>
  );
}
