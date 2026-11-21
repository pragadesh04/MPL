'use client';

import { useState } from 'react';
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
import { errorMessage } from '../lib/api';
import { FormError, FormField } from './form-field';

/**
 * "Type the tournament name to confirm" (cancel, transfer ownership, Start — §1, §7.2, §7.3).
 * `onConfirm` gets the typed name; the server re-checks it.
 */
export function ConfirmByNameDialog({
  open,
  onOpenChange,
  title,
  description,
  tournamentName,
  confirmLabel,
  destructive = false,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  tournamentName: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: (typedName: string) => Promise<void>;
  children?: React.ReactNode;
}) {
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const matches = typed.trim().toLowerCase() === tournamentName.trim().toLowerCase();

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!matches) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm(typed);
      setTyped('');
      onOpenChange(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          {children}
          <FormError message={error} />
          <FormField
            id="confirm-name"
            label={
              <span>
                Type <strong className="text-lime">{tournamentName}</strong> to confirm
              </span>
            }
          >
            <Input
              id="confirm-name"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
            />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Back
            </Button>
            <Button
              type="submit"
              variant={destructive ? 'destructive' : 'default'}
              disabled={!matches || busy}
            >
              {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
