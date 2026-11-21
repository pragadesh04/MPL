'use client';

import type * as React from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { WEBHOOK_EVENTS, type WebhookEvent } from '@/lib/schemas/realtime';
import { cn } from '@/lib/utils';
import { EVENT_LABELS } from './labels';

interface EventCheckboxesProps {
  value: WebhookEvent[];
  onChange: (events: WebhookEvent[]) => void;
  idPrefix: string;
  disabled?: boolean;
  invalid?: boolean;
}

/** One checkbox per webhook event, kept in catalogue order. */
export function EventCheckboxes({
  value,
  onChange,
  idPrefix,
  disabled = false,
  invalid = false,
}: EventCheckboxesProps): React.JSX.Element {
  const toggle = (event: WebhookEvent, on: boolean): void => {
    const next = new Set(value);
    if (on) next.add(event);
    else next.delete(event);
    onChange(WEBHOOK_EVENTS.filter((e) => next.has(e)));
  };

  return (
    <div className={cn('grid gap-2 sm:grid-cols-2', invalid && 'rounded-md ring-1 ring-blood/60')}>
      {WEBHOOK_EVENTS.map((event) => {
        const id = `${idPrefix}-${event}`;
        const { label, hint } = EVENT_LABELS[event];
        return (
          <label
            key={event}
            htmlFor={id}
            className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-surface-2/40 px-3 py-2 hover:border-lime-dim"
          >
            <Checkbox
              id={id}
              checked={value.includes(event)}
              onCheckedChange={(c) => toggle(event, c === true)}
              disabled={disabled}
              className="mt-0.5"
            />
            <span className="grid gap-0.5">
              <span className="text-sm font-semibold">{label}</span>
              <span className="font-numeric text-[0.6875rem] text-muted">
                {event}
                {hint ? ` · ${hint}` : ''}
              </span>
            </span>
          </label>
        );
      })}
    </div>
  );
}
