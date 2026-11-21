import type * as React from 'react';

import { teamStyle } from '@/lib/team-color';
import { cn } from '@/lib/utils';

const sizes = {
  sm: { root: 'gap-1.5 text-xs', swatch: 'size-3', code: 'text-[0.625rem] px-1' },
  default: { root: 'gap-2 text-sm', swatch: 'size-4', code: 'text-xs px-1.5' },
  lg: { root: 'gap-2.5 text-base', swatch: 'size-5', code: 'text-sm px-2' },
} as const;

/**
 * Team colour swatch + short code + name. Colour is never the only identifier (PLAN §7.13), so the
 * short code is always rendered and the name is shown unless `hideName` (then it becomes the
 * accessible label and tooltip).
 */
export function TeamChip({
  name,
  shortName,
  color,
  size = 'default',
  hideName = false,
  className,
}: {
  name: string;
  shortName: string;
  color: string;
  size?: keyof typeof sizes;
  hideName?: boolean;
  className?: string;
}): React.JSX.Element {
  const s = sizes[size];
  return (
    <span
      data-slot="team-chip"
      style={teamStyle(color)}
      title={hideName ? name : undefined}
      className={cn('inline-flex min-w-0 items-center font-semibold', s.root, className)}
    >
      <span
        aria-hidden="true"
        className={cn('bg-team shrink-0 rounded-sm ring-1 ring-border', s.swatch)}
      />
      <span
        className={cn(
          'border-team text-team shrink-0 rounded-sm border py-px font-display leading-tight tracking-wider uppercase',
          s.code,
        )}
      >
        {shortName}
      </span>
      {hideName ? (
        <span className="sr-only">{name}</span>
      ) : (
        <span className="truncate text-foreground">{name}</span>
      )}
    </span>
  );
}
