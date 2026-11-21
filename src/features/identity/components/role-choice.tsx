'use client';

import { Crown, Swords } from 'lucide-react';
import type { ParticipantKind } from '@/lib/schemas/enums';
import { cn } from '@/lib/utils';

const OPTIONS: { value: ParticipantKind; label: string; help: string; Icon: typeof Crown }[] = [
  { value: 'LEADER', label: 'Captain', help: 'Gets points and bids for soldiers', Icon: Crown },
  { value: 'PLAYER', label: 'Soldier', help: 'Gets drafted into a squad', Icon: Swords },
];

/** Captain / Soldier toggle with one-line explanations (§7.0). */
export function RoleChoice({
  value,
  onChange,
  name = 'role',
  disabled,
}: {
  value: ParticipantKind | undefined;
  onChange: (value: ParticipantKind) => void;
  name?: string;
  disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label="Join as" className="grid grid-cols-2 gap-2">
      {OPTIONS.map(({ value: v, label, help, Icon }) => {
        const checked = value === v;
        return (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={checked}
            name={name}
            disabled={disabled}
            onClick={() => onChange(v)}
            className={cn(
              'flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors',
              checked
                ? 'border-lime bg-lime/10 shadow-glow'
                : 'border-border bg-surface hover:border-lime-dim',
            )}
          >
            <span className="flex items-center gap-2 font-display text-lg tracking-wide">
              <Icon aria-hidden className={cn('size-4', checked ? 'text-lime' : 'text-muted')} />
              {label}
            </span>
            <span className="text-xs text-muted">{help}</span>
          </button>
        );
      })}
    </div>
  );
}
