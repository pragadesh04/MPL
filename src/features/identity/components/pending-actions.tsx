'use client';

import { ArrowLeftRight, Check, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import type { ParticipantKind } from '@/lib/schemas/enums';
import { api, errorMessage } from '../lib/api';
import { FormField } from './form-field';

const base = (tournamentId: string, kind: ParticipantKind): string =>
  `/api/tournaments/${tournamentId}/${kind === 'LEADER' ? 'leaders' : 'players'}`;

const approveBody = (kind: ParticipantKind, ids: string[], amount: string) => ({
  ids,
  ...(amount.trim() === ''
    ? {}
    : kind === 'LEADER'
      ? { purse: Number(amount) }
      : { basePrice: Number(amount) }),
});

/** Inline purse / base price, Approve, Reject (with reason), Switch role (§7.2 pending rows). */
export function PendingActions({
  tournamentId,
  kind,
  id,
  name,
  defaultAmount,
}: {
  tournamentId: string;
  kind: ParticipantKind;
  id: string;
  name: string;
  defaultAmount: number;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState(String(defaultAmount));
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<unknown>, ok: string): Promise<void> => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <label className="flex items-center gap-1 text-xs text-muted">
        {kind === 'LEADER' ? 'Purse' : 'Base'}
        <Input
          type="number"
          min={0}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="h-8 w-20"
          aria-label={`${kind === 'LEADER' ? 'Purse' : 'Base price'} for ${name}`}
        />
      </label>
      <Button
        type="button"
        size="sm"
        disabled={busy}
        onClick={() =>
          run(
            () =>
              api(`${base(tournamentId, kind)}/approve`, { body: approveBody(kind, [id], amount) }),
            `${name} approved`,
          )
        }
      >
        <Check aria-hidden /> Approve
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={busy}
        onClick={() => setRejecting(true)}
      >
        <X aria-hidden /> Reject
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={busy}
        onClick={() =>
          run(
            () => api(`${base(tournamentId, kind)}/${id}/switch-role`, { method: 'POST' }),
            `${name} moved to ${kind === 'LEADER' ? 'soldiers' : 'captains'}`,
          )
        }
      >
        <ArrowLeftRight aria-hidden /> Switch to {kind === 'LEADER' ? 'soldier' : 'captain'}
      </Button>
      <Dialog open={rejecting} onOpenChange={setRejecting}>
        <DialogContent>
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void run(
                () => api(`${base(tournamentId, kind)}/${id}/reject`, { body: { reason } }),
                `${name} rejected`,
              ).then(() => setRejecting(false));
            }}
          >
            <DialogHeader>
              <DialogTitle>Reject {name}?</DialogTitle>
            </DialogHeader>
            <FormField id={`reason-${id}`} label="Reason (they will see it)">
              <Input
                id={`reason-${id}`}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={200}
                required
              />
            </FormField>
            <DialogFooter>
              <Button type="submit" variant="destructive" disabled={busy || reason.trim() === ''}>
                Reject
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Bulk approve every pending row in the tab with one value. */
export function BulkApprove({
  tournamentId,
  kind,
  ids,
  defaultAmount,
}: {
  tournamentId: string;
  kind: ParticipantKind;
  ids: string[];
  defaultAmount: number;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState(String(defaultAmount));
  const [busy, setBusy] = useState(false);
  if (ids.length < 2) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border p-3 text-sm">
      Approve all {ids.length} with {kind === 'LEADER' ? 'a purse of' : 'a base price of'}
      <Input
        type="number"
        min={0}
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="h-8 w-20"
        aria-label="Amount for everyone"
      />
      MP
      <Button
        type="button"
        size="sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const res = await api<{ approved: string[] }>(`${base(tournamentId, kind)}/approve`, {
              body: approveBody(kind, ids, amount),
            });
            toast.success(`${res.approved.length} approved`);
            router.refresh();
          } catch (err) {
            toast.error(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <Check aria-hidden /> Approve all
      </Button>
    </div>
  );
}
