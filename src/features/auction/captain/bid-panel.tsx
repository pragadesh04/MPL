'use client';

import { useId, useRef, useState } from 'react';
import { GavelIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/sonner';
import { formatAmount } from '@/lib/money';
import type { AuctionSnapshot } from '@/lib/schemas/auction';
import { useSoundEnabled } from '@/lib/sound';
import { cn } from '@/lib/utils';
import { haptic, playSound } from '../shared/effects';
import { needsJumpConfirm, type BidSettings, type TeamBidState } from '../shared/phase';
import type { AuctionRealtime } from '../realtime/use-auction-realtime';

/**
 * The captain's bid controls (§7.8, §3.2): the big BID button, quick-raise chips, the custom
 * amount field and the jump-bid confirmation. Whether the team can bid, the next amount and the
 * allowed range all come from `teamBidState` (the same rule functions the server runs); the
 * server re-checks every bid.
 */

type BidFn = AuctionRealtime['bid'];

export interface BidPanelProps {
  snapshot: AuctionSnapshot;
  state: TeamBidState;
  settings: BidSettings;
  offline: boolean;
  bid: BidFn;
}

export function BidPanel({ snapshot, state, settings, offline, bid }: BidPanelProps) {
  const [pending, setPending] = useState(false);
  const inflight = useRef(false);
  const [confirmAmount, setConfirmAmount] = useState<number | null>(null);
  const [custom, setCustom] = useState('');
  const sound = useSoundEnabled();
  const reasonId = useId();
  const customId = useId();

  const blocked = !state.canBid || offline || pending;
  const reason = offline
    ? 'You are offline. Bidding resumes when the connection is back.'
    : state.reason;

  const submit = async (amount: number): Promise<void> => {
    if (inflight.current) return;
    inflight.current = true;
    setPending(true);
    try {
      const res = await bid(amount);
      if (res.ok) {
        if (sound) playSound('bid');
        haptic(30);
        setCustom('');
      } else if (res.error.code === 'OUTBID') {
        toast.error('Someone bid first', { description: 'The price moved. Check the new bid.' });
      } else {
        toast.error(res.error.message);
      }
    } finally {
      inflight.current = false;
      setPending(false);
    }
  };

  const request = (amount: number): void => {
    if (blocked) return;
    if (needsJumpConfirm(snapshot, amount, settings)) setConfirmAmount(amount);
    else void submit(amount);
  };

  const bounds = state.bounds;
  const customValue = custom.trim() === '' ? null : Number(custom);
  const customValid =
    customValue !== null &&
    Number.isInteger(customValue) &&
    bounds !== null &&
    customValue >= bounds.min &&
    customValue <= bounds.max;

  return (
    <div className="space-y-3">
      <Button
        type="button"
        size="xl"
        className="h-20 text-3xl"
        disabled={blocked || state.nextBid === null}
        aria-describedby={reason ? reasonId : undefined}
        onClick={() => state.nextBid !== null && request(state.nextBid)}
      >
        <GavelIcon aria-hidden="true" />
        {pending
          ? 'Bidding…'
          : state.nextBid !== null
            ? `Bid ${formatAmount(state.nextBid)} MP`
            : 'Bid'}
      </Button>
      {reason ? (
        <p
          id={reasonId}
          role="status"
          className={cn(
            'text-center text-sm font-semibold',
            state.reason?.startsWith('You hold') && !offline ? 'text-lime' : 'text-amber',
          )}
        >
          {reason}
        </p>
      ) : null}

      {settings.allowCustomBids && state.quick.length > 0 ? (
        <div className="flex flex-wrap justify-center gap-2" aria-label="Quick raise">
          {state.quick.map((amount) => (
            <Button
              key={amount}
              type="button"
              variant="outline"
              size="sm"
              disabled={blocked}
              aria-label={`Quick bid ${formatAmount(amount)} MP`}
              onClick={() => request(amount)}
              className="tabular font-numeric"
            >
              {formatAmount(amount)} MP
            </Button>
          ))}
        </div>
      ) : null}

      {settings.allowCustomBids ? (
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (customValid && customValue !== null) request(customValue);
          }}
        >
          <div className="flex-1 space-y-1">
            <label htmlFor={customId} className="text-xs tracking-widest text-muted uppercase">
              Custom bid amount
            </label>
            <Input
              id={customId}
              type="number"
              inputMode="numeric"
              min={bounds?.min}
              max={bounds?.max}
              step={1}
              placeholder={bounds ? String(bounds.min) : undefined}
              value={custom}
              disabled={blocked}
              aria-invalid={custom !== '' && !customValid ? true : undefined}
              onChange={(e) => setCustom(e.target.value)}
            />
          </div>
          <Button type="submit" variant="secondary" disabled={blocked || !customValid}>
            Place custom bid
          </Button>
        </form>
      ) : null}
      {settings.allowCustomBids && bounds && custom !== '' && !customValid ? (
        <p className="text-xs text-amber">
          Enter a whole number from {formatAmount(bounds.min)} to {formatAmount(bounds.max)} MP.
        </p>
      ) : null}

      <Dialog open={confirmAmount !== null} onOpenChange={(o) => !o && setConfirmAmount(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm jump bid</DialogTitle>
            <DialogDescription>
              You are bidding {formatAmount(confirmAmount ?? 0)} MP, well above the next bid of{' '}
              {formatAmount(state.nextBid ?? 0)} MP. Is that right?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmAmount(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={blocked}
              onClick={() => {
                const amount = confirmAmount;
                setConfirmAmount(null);
                if (amount !== null) void submit(amount);
              }}
            >
              Yes, bid {formatAmount(confirmAmount ?? 0)} MP
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
