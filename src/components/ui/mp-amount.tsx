import type * as React from 'react';

import { formatAmount, MP_UNIT } from '@/lib/money';
import { cn } from '@/lib/utils';

const sizes = {
  sm: { value: 'text-sm', unit: 'text-[0.5625rem] px-1' },
  default: { value: 'text-base', unit: 'text-[0.625rem] px-1' },
  lg: { value: 'text-2xl', unit: 'text-xs px-1.5' },
  xl: { value: 'text-5xl', unit: 'text-sm px-2' },
} as const;

export type MpAmountSize = keyof typeof sizes;

/** An integer Militia Points amount: `1,250` in the digits font plus a small "MP" tag. */
export function MpAmount({
  value,
  size = 'default',
  className,
}: {
  value: number;
  size?: MpAmountSize;
  className?: string;
}): React.JSX.Element {
  const s = sizes[size];
  return (
    <span
      data-slot="mp-amount"
      className={cn('inline-flex items-baseline gap-1 whitespace-nowrap', className)}
    >
      <span className={cn('tabular font-numeric leading-none font-semibold', s.value)}>
        {formatAmount(value)}
      </span>
      <span
        className={cn(
          'rounded-sm bg-lime/15 py-px leading-tight font-bold tracking-widest text-lime uppercase',
          s.unit,
        )}
      >
        {MP_UNIT}
      </span>
    </span>
  );
}
