'use client';

import { UserPlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import type { ParticipantKind } from '@/lib/schemas/enums';
import { ApiClientError, api, errorMessage } from '../lib/api';
import { FormError, FormField } from './form-field';
import { CopyButton, WhatsAppButton } from './share';

interface Added {
  kind: ParticipantKind;
  name: string;
  link: string;
}

/**
 * "Add person" drawer (path A, §7.2 step 3): the Type dropdown first, then the fields for that
 * type. "Save & add another" keeps the type. Every saved person gets a personal link.
 */
export function AddPersonSheet({
  tournamentId,
  tournamentName,
  defaultPurse,
  minBasePrice,
}: {
  tournamentId: string;
  tournamentName: string;
  defaultPurse: number;
  minBasePrice: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<ParticipantKind>('PLAYER');
  const [name, setName] = useState('');
  const [ign, setIgn] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<Added | null>(null);

  const reset = (): void => {
    setName('');
    setIgn('');
    setAmount('');
    setFieldErrors({});
  };

  const save = async (another: boolean): Promise<void> => {
    setBusy(true);
    setError(null);
    setFieldErrors({});
    const value = amount.trim() === '' ? undefined : Number(amount);
    try {
      const added = await api<Added>(`/api/tournaments/${tournamentId}/people`, {
        body:
          type === 'LEADER'
            ? { type, name, ign, purse: value }
            : { type, name, ign, basePrice: value },
      });
      setLast(added);
      reset();
      router.refresh();
      if (!another) setOpen(false);
    } catch (err) {
      if (err instanceof ApiClientError) setFieldErrors(err.fieldErrors);
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const role = type === 'LEADER' ? 'Captain' : 'Soldier';
  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button type="button">
            <UserPlus aria-hidden /> Add person
          </Button>
        </SheetTrigger>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Add person</SheetTitle>
            <SheetDescription>
              They&apos;re approved at once and get a personal link to claim their spot.
            </SheetDescription>
          </SheetHeader>
          <form
            className="grid gap-4 px-4 pb-6"
            onSubmit={(e) => {
              e.preventDefault();
              void save(false);
            }}
          >
            <FormField id="person-type" label="Type">
              <select
                id="person-type"
                value={type}
                onChange={(e) => setType(e.target.value as ParticipantKind)}
                className="h-10 rounded-md border border-border bg-input px-3 text-sm"
              >
                <option value="LEADER">Captain</option>
                <option value="PLAYER">Soldier</option>
              </select>
            </FormField>
            <FormError message={error} />
            <FormField id="person-name" label="Name" error={fieldErrors.name}>
              <Input
                id="person-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </FormField>
            <FormField id="person-ign" label="IGN (optional)" error={fieldErrors.ign}>
              <Input id="person-ign" value={ign} onChange={(e) => setIgn(e.target.value)} />
            </FormField>
            {type === 'LEADER' ? (
              <FormField
                id="person-purse"
                label="Purse (MP)"
                error={fieldErrors.purse}
                hint={`Default ${defaultPurse} MP`}
              >
                <Input
                  id="person-purse"
                  type="number"
                  min={0}
                  value={amount}
                  placeholder={String(defaultPurse)}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </FormField>
            ) : (
              <FormField
                id="person-price"
                label="Base price (MP)"
                error={fieldErrors.basePrice}
                hint={`At least ${minBasePrice} MP`}
              >
                <Input
                  id="person-price"
                  type="number"
                  min={minBasePrice}
                  value={amount}
                  placeholder={String(minBasePrice)}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </FormField>
            )}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={busy || name.trim().length < 2}>
                Save
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={busy || name.trim().length < 2}
                onClick={() => void save(true)}
              >
                Save & add another
              </Button>
            </div>
            {last ? (
              <div className="grid gap-2 rounded-md border border-lime/40 bg-lime/5 p-3 text-sm">
                <p>
                  <strong>{last.name}</strong> added. Send their personal link:
                </p>
                <div className="flex gap-2">
                  <CopyButton
                    text={last.link}
                    label="Copy link"
                    toastLabel="Personal link copied"
                  />
                  <WhatsAppButton
                    text={`Hi ${last.name}! You're invited to ${tournamentName} on MPL as ${
                      last.kind === 'LEADER' ? 'Captain' : 'Soldier'
                    }. Open your personal link to join: ${last.link}`}
                  />
                </div>
              </div>
            ) : null}
            <p className="text-xs text-muted">Adding a {role.toLowerCase()}.</p>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}
