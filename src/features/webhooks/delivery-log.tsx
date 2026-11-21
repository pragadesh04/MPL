'use client';

import type * as React from 'react';
import { RefreshCwIcon, RotateCcwIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusPill } from '@/components/ui/status-pill';
import type { DeliveryView } from '@/server/services/webhooks/types';
import { STATUS_LABELS, STATUS_TONES } from './labels';

interface DeliveryLogProps {
  deliveries: DeliveryView[] | null;
  loading: boolean;
  error: string | null;
  redeliveringId: number | null;
  onRefresh: () => void;
  onRedeliver: (deliveryId: number) => void;
}

const timeFormat = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** Recent deliveries with status chips and a Redeliver button. */
export function DeliveryLog({
  deliveries,
  loading,
  error,
  redeliveringId,
  onRefresh,
  onRedeliver,
}: DeliveryLogProps): React.JSX.Element {
  return (
    <div className="grid gap-3 border-t border-border pt-4">
      <div className="flex items-center justify-between gap-2">
        <h4 className="font-display text-sm tracking-wide uppercase">Recent deliveries</h4>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onRefresh}
          disabled={loading}
          aria-label="Refresh deliveries"
        >
          <RefreshCwIcon aria-hidden="true" className={loading ? 'animate-spin' : undefined} />
        </Button>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-blood">
          {error}
        </p>
      ) : null}

      {deliveries === null && loading ? <p className="text-sm text-muted">Loading…</p> : null}

      {deliveries !== null && deliveries.length === 0 ? (
        <p className="text-sm text-muted">Nothing sent yet. Use “Send test” to try it.</p>
      ) : null}

      {deliveries !== null && deliveries.length > 0 ? (
        <ul className="grid gap-2">
          {deliveries.map((d) => (
            <li
              key={d.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border bg-surface-2/40 px-3 py-2"
            >
              <StatusPill tone={STATUS_TONES[d.status]}>{STATUS_LABELS[d.status]}</StatusPill>
              <span className="font-numeric text-sm">{d.event}</span>
              {d.payload.data && typeof d.payload.data === 'object' && 'test' in d.payload.data ? (
                <span className="text-[0.6875rem] tracking-widest text-muted uppercase">test</span>
              ) : null}
              <span className="tabular text-xs text-muted">
                {timeFormat.format(new Date(d.createdAt))} · {d.attempts}{' '}
                {d.attempts === 1 ? 'attempt' : 'attempts'}
              </span>
              {d.lastError ? (
                <span
                  className="w-full truncate text-xs text-blood sm:order-last"
                  title={d.lastError}
                >
                  {d.lastError}
                </span>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="ml-auto"
                onClick={() => onRedeliver(d.id)}
                disabled={redeliveringId !== null}
              >
                <RotateCcwIcon aria-hidden="true" />
                {redeliveringId === d.id ? 'Sending…' : 'Redeliver'}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
