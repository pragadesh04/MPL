'use client';

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
import { ApiClientError, api, errorMessage } from '../lib/api';
import { FormError, FormField } from './form-field';

export interface EditablePerson {
  id: string;
  name: string;
  ign: string | null;
  phone: string | null;
  amount: number;
}

/** Edit a captain (purse) or soldier (base price) before Start, or remove them. */
export function EditPersonDialog({
  tournamentId,
  kind,
  person,
  open,
  onOpenChange,
}: {
  tournamentId: string;
  kind: ParticipantKind;
  person: EditablePerson;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(person.name);
  const [ign, setIgn] = useState(person.ign ?? '');
  const [phone, setPhone] = useState(person.phone ?? '');
  const [amount, setAmount] = useState(String(person.amount));
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const url = `/api/tournaments/${tournamentId}/${kind === 'LEADER' ? 'leaders' : 'players'}/${person.id}`;

  const run = async (fn: () => Promise<unknown>, ok: string): Promise<void> => {
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      await fn();
      toast.success(ok);
      onOpenChange(false);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiClientError) setFieldErrors(err.fieldErrors);
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void run(
              () =>
                api(url, {
                  method: 'PATCH',
                  body:
                    kind === 'LEADER'
                      ? { name, ign, phone, purse: Number(amount) }
                      : { name, ign, phone, basePrice: Number(amount) },
                }),
              'Saved',
            );
          }}
        >
          <DialogHeader>
            <DialogTitle>Edit {kind === 'LEADER' ? 'captain' : 'soldier'}</DialogTitle>
          </DialogHeader>
          <FormError message={error} />
          <FormField id="edit-name" label="Name" error={fieldErrors.name}>
            <Input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} />
          </FormField>
          <FormField id="edit-ign" label="IGN" error={fieldErrors.ign}>
            <Input id="edit-ign" value={ign} onChange={(e) => setIgn(e.target.value)} />
          </FormField>
          <FormField id="edit-phone" label="Phone" error={fieldErrors.phone}>
            <Input id="edit-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </FormField>
          <FormField
            id="edit-amount"
            label={kind === 'LEADER' ? 'Purse (MP)' : 'Base price (MP)'}
            error={fieldErrors.purse ?? fieldErrors.basePrice}
          >
            <Input
              id="edit-amount"
              type="number"
              min={0}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </FormField>
          <DialogFooter className="sm:justify-between">
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={() =>
                void run(() => api(url, { method: 'DELETE' }), `${person.name} removed`)
              }
            >
              Remove
            </Button>
            <Button type="submit" disabled={busy}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
